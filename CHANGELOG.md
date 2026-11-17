# Changelog

## v0.1.0 (unreleased)

The first self-hosted release of SeatRota, the Teams add-on for Cal.diy. Works with Cal.diy.

When the `v0.1.0` tag is pushed, the image is published as `ghcr.io/seatrota/seatrota:v0.1.0` and `:latest` (`linux/amd64`). To self-host, see [docs/QUICKSTART.md](docs/QUICKSTART.md).

### Added

- **Teams and invites.** Teams with owner, admin and member roles, and email invites that expire after 7 days. Each team gets event types and a public booking page at `/team/<slug>`.
- **Round-robin and collective scheduling.**
  - Round-robin picks a host by priority, weight and fixed hosts, then by who was booked least recently.
  - A collective event offers only the times every host is free, and every host goes on the booking.
  - If the assigned round-robin host cancels, the booking is reassigned to another host.
- **Email reminder workflows.** Each event type can send templated reminders a set number of minutes before the start or after the end, to the attendee or to the hosts. `POST /api/cron/teams-reminders` sends due reminders. SMS is not supported.
- **Insights dashboard.** Bookings, cancellations, no-shows and per-member counts, plus the round-robin distribution for each event type, over any date range.
- **OIDC SSO.**
  - Generic OpenID Connect, with one provider per team or one for the whole instance. Setup notes cover Keycloak, Authentik, Google Workspace and Entra ID.
  - People on a verified email domain join the team automatically.
  - A group claim can map to a team role.
  - Password login can be refused for verified domains.
  - SAML is not supported.
- **Docker.**
  - `docker/Dockerfile`, with a Compose stack in `docker/compose.yml`.
  - The container checks its environment and applies migrations before it serves traffic.
  - A release workflow publishes the image to GHCR on a `v*` tag.
- **Per-seat billing for hosted instances, Stripe test mode only.** Setting it up is optional. A live Stripe key is refused at startup.
- **Upstream sync.** `scripts/upstream-sync.sh` replays SeatRota's patches onto a newer Cal.diy commit, and CI dry-runs it on every pull request.

### Licensing

Files from the Cal.diy snapshot (`calcom/cal.diy@ae027bb`) stay MIT, and they keep their notices. `packages/teams-*` is AGPL-3.0-only.

### Known limits

- The published image is built for `http://localhost:3000`. Any other public URL needs a build from source.
- When a booking is rescheduled through the core Cal.diy flow, its reminders are not queued again.
- The upstream sync's 3-way merge has not yet been tried against a real upstream change; upstream has not moved since the snapshot.
- Hosted cloud is not available yet. To hear when it opens, join the waitlist at <https://seatrota.github.io>.

The build record for each milestone (pull request, merge commit, clean-room result) is in [docs/STATUS.md](docs/STATUS.md).
