# Patch queue

`patches/NNN-*.md` documents each seam patched in upstream core files. Teams core seams start at `010`. Scheduling seams start at `020`. Reminder workflow seams start at `030`. Insights seams start at `040`. SSO seams start at `050`. Hosted-readiness seams start at `060`. Upstream-sync seams start at `070`.

- `000-drop-dangling-enterprise-refs` records commit `e9c8925`. The cleanup stays on `main`; the `.patch` is what sync replays.
- `001-drop-commercial-license-upsell` deletes unreferenced upsell strings from `packages/i18n/locales/*/common.json`.
- `002-drop-dangling-saml-doc-link` removes a dangling path comment from `.env.example`.
- `003-disable-upstream-pr-update` keeps the upstream PR Update workflow from running its Prepare job in this repository.
- `010`-`015` are the M1 teams-core seams: team booking routes, the teams tRPC router mount, the settings nav, additive Prisma models, Next.js seams and the teams e2e.
- `020`-`023` are the M2 scheduling seams: booking host hooks, additive Prisma scheduling models, the Next.js transpile entry and the scheduling e2e.
- `030`-`033` are the M3 reminder workflow seams: additive Prisma workflow and reminder tables, the Next.js transpile entry, the reminders cron route and the reminders e2e.
- `040`-`041` are the M4 insights seams: the seeded-data insights e2e and the Next.js transpile entry. The dashboard reads existing tables, so there is no schema change.
- `050`-`054` are the M5 SSO seams: additive Prisma SSO tables, the next-auth provider registry, OIDC provider refresh, the Next.js transpile entry and the Keycloak browser e2e. Workflow changes in `.github/workflows/seatrota.yml` are SeatRota's own file, not an upstream seam, so they have no patch.
- `060`-`063` are the M6 hosted-readiness seams: the additive Prisma subscription table, the Stripe webhook route, the Next.js transpile entry and the billing e2e. The container image lives in `docker/`, which is SeatRota's own directory.
- `070-workspace-baseline` records the workspace edits from before M1: the `@seatrota/*` build filter in `package.json`, the teams tasks in `turbo.json`, the teams workspaces in `yarn.lock` and `.github/CODEOWNERS`. Paths SeatRota owns outright, and the two upstream build artifacts it deletes, are listed in `scripts/seatrota-owned.txt` instead.
- `071-disable-upstream-release-docker` keeps the upstream Docker release workflow from running on SeatRota's `v*` tags; SeatRota's own image is published by `.github/workflows/release.yml`.

When a seam exists:

- `patches/NNN-short-name.md` explains which upstream file changed and why the seam is needed.
- `patches/NNN-short-name.patch` (or `.diff`) is the queue entry `scripts/upstream-sync.sh` re-applies after an upstream diff.

Markdown notes are documentation. Only `.patch` and `.diff` files are applied. Number prefixes keep a stable order.
