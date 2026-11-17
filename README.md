# SeatRota

SeatRota adds team scheduling to self-hosted Cal.diy: teams and invites, round-robin and collective events, email reminder workflows, an insights dashboard and OIDC SSO, shipped as a Docker image.

Works with Cal.diy. Website: <https://seatrota.github.io>

Hosted cloud coming, join the waitlist at <https://seatrota.github.io>.

## Quickstart

```sh
git clone https://github.com/seatrota/seatrota.git && cd seatrota
cp docker/seatrota.env.example docker/seatrota.env
sed -i -e "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$(openssl rand -hex 32)|" -e "s|^CALENDSO_ENCRYPTION_KEY=.*|CALENDSO_ENCRYPTION_KEY=$(openssl rand -hex 16)|" -e "s|^CRON_API_KEY=.*|CRON_API_KEY=$(openssl rand -hex 32)|" docker/seatrota.env
docker pull ghcr.io/seatrota/seatrota:v0.1.0
docker compose -f docker/compose.yml up
```

Then open <http://localhost:3000>. On an empty database it starts first-run setup, where you create the administrator account. [docs/QUICKSTART.md](docs/QUICKSTART.md) covers the required environment variables, creating your first team, SSO with Keycloak or any OIDC provider, and building the image from source.

## Features

- **Teams and invites.** Teams with owner, admin and member roles, and invites sent by email. Each team has its own event types and a public booking page at `/team/<slug>`.
- **Round-robin and collective events.**
  - Round-robin picks the host by priority, weight and fixed hosts, then by who was booked least recently. If the assigned host cancels, the booking moves to another host.
  - Collective events offer only the times every host is free, and add every host to the booking.
- **Email reminder workflows.** Each event type can have templated email reminders, sent a set number of minutes before the start or after the end, to the attendee or the hosts. A cron route, `POST /api/cron/teams-reminders`, sends them. SMS is not supported.
- **Insights.** For any date range: bookings, cancellations and no-shows, counts per member, and how round-robin bookings were spread across hosts.
- **OIDC SSO.**
  - Any OpenID Connect provider, set up per team or for the whole instance. The guides cover Keycloak, Authentik, Google Workspace and Entra ID.
  - Group-to-role mapping, and auto-join for people on a verified email domain.
  - Password login can be turned off for verified domains.
  - SAML is not supported.
- **Docker.**
  - The image checks its environment and runs migrations before it starts serving.
  - `docker/compose.yml` runs it alongside Postgres.
  - Release images are published to `ghcr.io/seatrota/seatrota`.
- **Upstream sync.** SeatRota stays a thin fork. Every change to an upstream file is kept as a patch in `patches/`. [`scripts/upstream-sync.sh`](scripts/upstream-sync.sh) replays those patches onto a newer Cal.diy commit, and CI dry-runs it on every pull request. See [docs/upstream-sync.md](docs/upstream-sync.md).

Release notes are in [CHANGELOG.md](CHANGELOG.md). Known limits and the build record are in [docs/STATUS.md](docs/STATUS.md).

## Licensing

SeatRota is built on a snapshot of Cal.diy, the MIT community edition. Files that come from that snapshot remain under the MIT license, with their original notices kept. See [LICENSE](LICENSE) and [UPSTREAM.md](UPSTREAM.md).

SeatRota's own code in `packages/teams-*` is licensed AGPL-3.0-only. See [LICENSE-AGPL](LICENSE-AGPL).

SeatRota is an independent project and works with Cal.diy.
