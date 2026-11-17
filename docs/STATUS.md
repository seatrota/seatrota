# SeatRota build status

SeatRota is a clean-room, AGPL-3.0 Teams add-on for Cal.diy, built on a thin fork of the MIT snapshot of `calcom/cal.diy@ae027bb70e694e2d2c44569f398d6cbcee0389b1`. Every milestone below was merged into `main` through its own pull request. Those pull requests, with their CI runs and review notes, are in the private build repository. Their numbers refer to that repository, and the merge commits listed here are all in this repository's `main` history.

| Milestone | Pull request | Merge commit | Upstream diff | Clean-room result |
| --- | --- | --- | --- | --- |
| M0 / M0.1: MIT cleanup patches, whole-tree scan | #1 | `2b820ec` | patches 000-003 | pass; self-test pass |
| M1: teams core (membership, invites, first-host booking) | #2 | `7eb1cc4` | 368 lines (010-015) | pass; self-test pass |
| M5: OIDC SSO (Keycloak e2e, enforce-SSO, group-to-role mapping, domain auto-join) | #3 | `da78009` | 276 lines (050-054) | pass; self-test pass |
| M2: round-robin and collective scheduling | #5 | `43071d4` | 313 lines (020-023) | pass; self-test pass; jscpd against `getLuckyUser` and `RegularBookingService`: 0 clones at 40 and 25 tokens |
| M3: email reminder workflows | #6 | `e3d01b8` | 238 lines (030-033) | pass; self-test pass |
| M4: insights dashboard | #7 | `223c675` | 128 lines (040-041) | pass; self-test pass |
| M6: hosted readiness (Docker image, env config, per-seat Stripe test-mode billing) | #8 | `0010dbd` | 168 lines (060-063) | pass; self-test pass |
| M7: upstream sync script with a CI dry run | #9 | `072eb9d` | 0 lines (070 records the existing workspace edits) | pass; self-test pass |

On every merged pull request, `scripts/cleanroom-check.sh` reported the following, and `scripts/cleanroom-selftest.sh` failed on both planted files and passed after they were removed:

- `jscpd found no teams clones (min 40 tokens)`
- `added dependencies 0`
- `whole-tree hits 29, unexpected 0`
- `pass`

Each pull request body has its own acceptance results and full script output.


## What exists now

- **Teams** (`packages/teams-core`, `packages/teams-booking`): teams, roles, email invites, team event types and public booking.
- **Scheduling** (`packages/teams-scheduling`): round-robin with priority, weights and fixed hosts; collective events; reassignment on cancel.
- **SSO** (`packages/teams-sso`): generic OIDC through next-auth (no SAML). It supports a provider per team or per instance, DNS domain verification with auto-join, group-to-role mapping, and enforce-SSO. Setup notes: `docs/sso/`.
- **Reminders** (`packages/teams-workflows`): templated email reminders before start or after end, sent by `POST /api/cron/teams-reminders`. Notes: `docs/workflows/`.
- **Insights** (`packages/teams-insights`): bookings, cancellations, no-shows, per-member counts and round-robin distribution. Notes: `docs/insights/`.
- **Hosting** (`packages/teams-billing`, `docker/`): the container image, environment checks, and per-seat billing that accepts Stripe test keys only. Notes: `docs/hosting/`. Nothing is deployed.
- **Upstream sync** (`scripts/upstream-sync.sh`): replays the 30-patch queue onto a newer Cal.diy commit. CI dry-runs it on every pull request. Notes: `docs/upstream-sync.md`.

## Limits and follow-ups

- Upstream `main` has not moved past the snapshot yet. The sync dry run against `main` therefore matches the recorded SHA, and the 3-way merge path has not been exercised against a real upstream change.
- An upstream reschedule creates a new booking outside the teams flow, so reminders are not re-queued for it.
- Stripe billing has only been tested against signed test-mode webhooks in CI. No Stripe account was used.
- The inherited upstream workflows (`i18n`, `release-docker`, `E2E Report`) still fail. They are not SeatRota jobs and do not gate any SeatRota job.
- The landing page's "Coming in beta" labels have not been changed.
