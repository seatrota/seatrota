# Self-host SeatRota

This guide starts the stack in [docker/compose.yml](../docker/compose.yml): Postgres 16 and the SeatRota image. The container environment is [docker/seatrota.env.example](../docker/seatrota.env.example). The commands below run from the repository root. They use `openssl`, GNU `sed`, and Docker Compose v2.

For a local run, leave the URLs in the example env file as they are (`http://localhost:3000`).

## 0. Get the code

```sh
git clone https://github.com/seatrota/seatrota.git
cd seatrota
```

## 1. Write the env file

```sh
cp docker/seatrota.env.example docker/seatrota.env
sed -i "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')|" docker/seatrota.env
sed -i "s|^CALENDSO_ENCRYPTION_KEY=.*|CALENDSO_ENCRYPTION_KEY=$(openssl rand -hex 16)|" docker/seatrota.env
sed -i "s|^CRON_API_KEY=.*|CRON_API_KEY=$(openssl rand -base64 32 | tr -d '\n')|" docker/seatrota.env
```

`openssl rand -hex 16` prints 32 hex characters, which is 32 bytes. The startup check rejects any other length. `docker/seatrota.env` is the file named by `env_file: seatrota.env` in the Compose file. Do not commit it.

`DATABASE_URL` and `DATABASE_DIRECT_URL` in the example already point at the Compose database (`postgresql://seatrota:seatrota@database:5432/seatrota`). The hostname `database` is the Compose service name. It resolves inside the app container, not on the host.

## 2. Required environment variables

The startup check in `packages/teams-billing/check-env.ts` exits if any of these are missing or invalid while billing is off and `SEATROTA_HOSTED` is not `1`:

| Variable | What this stack uses |
| --- | --- |
| `DATABASE_URL` | `postgresql://seatrota:seatrota@database:5432/seatrota` |
| `NEXTAUTH_SECRET` | The value generated above. Any non-empty secret is accepted by the check. |
| `CALENDSO_ENCRYPTION_KEY` | Exactly 32 bytes. It encrypts stored secrets such as SSO client secrets. |
| `NEXT_PUBLIC_WEBAPP_URL` | `http://localhost:3000`. It must be an `http` or `https` URL. |

Two more values are required by the rest of the image, and the example file sets both:

| Variable | Why it is set |
| --- | --- |
| `DATABASE_DIRECT_URL` | `packages/prisma/schema.prisma` reads it as the Prisma direct URL. Use the same URL as `DATABASE_URL` on this stack. |
| `NEXTAUTH_URL` | `apps/web/next.config.ts` throws when it is unset. Set it to the same origin as `NEXT_PUBLIC_WEBAPP_URL`. |

The example also lists these. With the defaults in that file (`SEATROTA_HOSTED=0`, `SEATROTA_BILLING_ENABLED=0`) they are not required for the process to start:

| Variable | When it matters |
| --- | --- |
| `CRON_API_KEY` | `POST /api/cron/teams-reminders` checks this value. Hosted mode (`SEATROTA_HOSTED=1`) refuses to start without it. This guide still generates one. |
| `EMAIL_FROM`, `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD` | Invite mail and reminder mail. `EMAIL_SERVER_PORT` in the example is `587`. |
| `SEATROTA_SSO_ENABLED` | `1` in the example. `0` turns the SSO plan flag off. |
| `SEATROTA_HOSTED` | `0` for this guide. `1` also requires `https` once the public URL is not localhost. |
| `SEATROTA_BILLING_ENABLED`, `STRIPE_SECRET_KEY`, `SEATROTA_STRIPE_WEBHOOK_SECRET`, `SEATROTA_STRIPE_SEAT_PRICE_ID`, `SEATROTA_BILLING_TRIAL_DAYS` | Per-seat billing. Leave billing at `0` until you have Stripe **test** keys. A live key (`sk_live_` or `rk_live_`) is refused. See [docs/hosting/README.md](hosting/README.md). |

`SEATROTA_SKIP_MIGRATIONS=1` skips `prisma migrate deploy` in `docker/entrypoint.sh`. Leave it unset on a first run.

## 3. Start the stack

```sh
docker pull ghcr.io/seatrota/seatrota:v0.1.0
docker compose -f docker/compose.yml up
```

`docker/compose.yml` runs `ghcr.io/seatrota/seatrota:v0.1.0` unless `SEATROTA_IMAGE` names another image. Compose waits until Postgres answers `pg_isready`, then starts the app. The entrypoint checks the environment, applies migrations, and runs `next start` on port 3000. Open <http://localhost:3000>.

The image health check requests `/auth/login`. On an empty database that URL redirects to `/auth/setup`.

The published image is `linux/amd64` and is built for `http://localhost:3000`. That URL is compiled into the client, so any other public URL needs a build from source.

To stop the stack, run `docker compose -f docker/compose.yml down`. Add `-v` to remove the database volume as well.

### Build from source (alternative)

```bash
SEATROTA_IMAGE=seatrota:local docker compose -f docker/compose.yml up --build
```

That builds `docker/Dockerfile` as `seatrota:local`. The first build takes 15-25 minutes and needs about 8 GB of memory for Docker. For another public URL, export `NEXT_PUBLIC_WEBAPP_URL` in the shell before the build, then set that same origin for `NEXT_PUBLIC_WEBAPP_URL` and `NEXTAUTH_URL` in `docker/seatrota.env`.

## 4. First team

1. Open <http://localhost:3000/auth/login>. When the database has no user, the login page redirects to `/auth/setup`.
2. On **Administrator user**, enter a username, a full name of at least 3 characters, an email, and a password. The setup form checks the password in strict mode: more than 14 characters, an uppercase letter, a lowercase letter, and a digit.
3. Choose **Next**, then **Finish** on **Enable apps**. That step returns to `/`.
4. The new account then goes through onboarding once, at `/onboarding/getting-started`. Choose **Continue**, confirm your name and choose **Continue**, then choose **Continue** on the calendar step (a calendar can be connected later). You land on `/event-types`, where a one-time **Welcome to Cal.diy** dialog opens; choose **Continue**. The banner at the top suggests turning on two-factor authentication for the administrator, which is worth doing.
5. Open <http://localhost:3000/settings/teams>. Enter a team name and a link. The link is a lowercase slug of letters, numbers, and hyphens (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). Submit **Create team**. The signed-in user becomes the owner.
6. Open the team. Under **Invite by email**, enter an email and submit **Send invite**. The message links to `/teams/invite/<token>` on `NEXT_PUBLIC_WEBAPP_URL`. The invite lasts 7 days. The invited person signs in with that email and opens the link. Without working `EMAIL_*` settings the send is logged and the invite row is still stored; the page lists the pending address.

The public booking page is `/team/<slug>` after the team has an event type. On the team page, **Event types** can be round-robin or collective.

Reminder mail goes out only when something calls the cron route, for example:

```text
POST /api/cron/teams-reminders
Authorization: <CRON_API_KEY>
```

See [docs/workflows/README.md](workflows/README.md).

## 5. SSO

Self-hosted installs keep SSO on unless `SEATROTA_SSO_ENABLED=0`. Notes for other providers are in [docs/sso/README.md](sso/README.md).

### Generic OIDC

On the team page, **Single sign-on** can apply to **This team** or **The whole instance**.

1. In the identity provider, create a confidential client with the authorization-code flow. Register one redirect URI:
   - Team provider: `http://localhost:3000/api/auth/callback/teams-oidc-team-<teamId>`
   - Instance provider: `http://localhost:3000/api/auth/callback/teams-oidc-instance`

   `<teamId>` is the numeric id of the team. On a fresh database the first team is id `1`, so the team callback is `http://localhost:3000/api/auth/callback/teams-oidc-team-1`.
2. Back on the team page, paste the discovery URL (the issuer URL, or the issuer's `/.well-known/openid-configuration` document), the client id, and the client secret. The secret is encrypted with `CALENDSO_ENCRYPTION_KEY` before it is stored. Leave scopes at `openid email profile` unless the provider needs more.
3. Save **SSO**. People start from `/auth/signin`. Each enabled provider is a button labeled **Sign in with \<team name\> SSO**, or **Sign in with Instance SSO** for the instance provider.
4. Optional: set **Group claim** (often `groups`) and add a row for each group name and role (owner, admin, or member). With the claim left blank, a new person joins as a member.
5. Add the email domain. The page shows a DNS TXT host and value, in the shape `_seatrota.example.com` = `seatrota-verify=<token>`. Publish that record, then choose **Verify**. After it verifies, a person who signs in with an email on that domain joins the team.
6. **Refuse password login for verified domains** blocks password sign-in for those domains.

### Keycloak

Follow [docs/sso/keycloak.md](sso/keycloak.md). In short: create a confidential OpenID Connect client, turn on standard flow, and set the redirect URI to the team or instance callback above. The discovery URL for a realm is `https://<keycloak-host>/realms/<realm>/.well-known/openid-configuration`. For group mapping, add a Group Membership mapper whose token claim name is `groups`, then put `groups` in **Group claim** and add one row per group. A local Keycloak uses `start-dev`. Do not use development mode on a public host.
