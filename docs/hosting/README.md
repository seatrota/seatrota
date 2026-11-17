# Hosted readiness

SeatRota ships a container image and environment-based configuration, so it can be hosted. Nothing in this repository deploys it anywhere.

## Image

```sh
docker build -f docker/Dockerfile --build-arg NEXT_PUBLIC_WEBAPP_URL=https://seatrota.example -t seatrota:local .
cp docker/seatrota.env.example docker/seatrota.env   # fill it in
docker compose -f docker/compose.yml up --build
```

- `NEXT_PUBLIC_WEBAPP_URL` is compiled into the client bundle, so it is a build argument. Set the same value at run time.
- On start, the entrypoint does three things in order:
  1. Runs `check-env`. It prints every configuration problem, and the container exits if there is one.
  2. Applies the Prisma migrations. Set `SEATROTA_SKIP_MIGRATIONS=1` to skip this step.
  3. Runs `next start` on `PORT` (default 3000).
- The image runs as the unprivileged `node` user. Its health check requests `/auth/login`.

CI builds the image and checks that:

- a live Stripe key stops the container at startup;
- with Postgres, the login page answers 200 (after the first-run redirect on an empty database);
- the reminders cron route answers 401 without its key and 200 with it.

## Configuration

Every setting is an environment variable; `docker/seatrota.env.example` lists them.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL`, `DATABASE_DIRECT_URL` | Postgres connection. |
| `NEXTAUTH_SECRET` | Session signing secret. |
| `CALENDSO_ENCRYPTION_KEY` | Exactly 32 bytes. It encrypts stored secrets such as SSO client secrets. |
| `NEXT_PUBLIC_WEBAPP_URL`, `NEXTAUTH_URL` | Public URL. A hosted instance must use https outside localhost. |
| `CRON_API_KEY` | Key for `POST /api/cron/teams-reminders`. Required in hosted mode. |
| `EMAIL_*` | SMTP settings for reminders and invites. |
| `SEATROTA_HOSTED` | `1` turns on hosted-mode checks. |
| `SEATROTA_SSO_ENABLED` | `0` turns the SSO plan flag off. |
| `SEATROTA_BILLING_ENABLED` | `1` turns on per-seat billing. |
| `STRIPE_SECRET_KEY` | Stripe **test** secret key (`sk_test_...`). A live key is refused. |
| `SEATROTA_STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook endpoint (`whsec_...`). |
| `SEATROTA_STRIPE_SEAT_PRICE_ID` | Recurring per-seat price (`price_...`). |
| `SEATROTA_BILLING_TRIAL_DAYS` | Optional trial length, 0 to 90 days. |

## Per-seat billing (Stripe test mode only)

- **Seats:** one seat per team member, with a minimum of one.
- **Subscribing:** an owner or admin clicks "Subscribe" on the team settings page. SeatRota creates a Stripe Checkout session for that many seats and sends the owner to it.
- **Webhook:** Stripe sends subscription events to `POST /api/teams/billing/webhook`. SeatRota checks the `Stripe-Signature` header and accepts only signatures less than 5 minutes old. It records the subscription's status, seat count and period end.
- **Seat changes:** when a member joins (invite, or SSO domain auto-join) or is removed, SeatRota sets the subscription's seat quantity to match, with proration. A failure is logged and never blocks the membership change.
- **Live keys refused:** a key that starts with `sk_live_` or `rk_live_` is refused at startup and again by the Stripe adapter, so a misconfigured instance cannot charge a real card.

Test setup, in a Stripe test-mode account:

1. Create a product with a recurring per-unit price. Copy its `price_...` id.
2. Add a webhook endpoint at `https://<host>/api/teams/billing/webhook` for these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Copy its signing secret. For local testing, the Stripe CLI can forward events instead: `stripe listen --forward-to localhost:3000/api/teams/billing/webhook`.
