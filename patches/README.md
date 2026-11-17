# Patch queue

`patches/NNN-*.md` documents each seam patched in upstream core files. Teams core seams start at `010`. Scheduling seams start at `020`. SSO seams start at `050`.

- `000-drop-dangling-enterprise-refs` records commit `e9c8925`. The cleanup stays on `main`; the `.patch` is what sync replays.
- `001-drop-commercial-license-upsell` deletes unreferenced upsell strings from `packages/i18n/locales/*/common.json`.
- `002-drop-dangling-saml-doc-link` removes a dangling path comment from `.env.example`.
- `003-disable-upstream-pr-update` keeps the upstream PR Update workflow from running its Prepare job in this repository.
- `010`-`015` are the M1 teams-core seams: team booking routes, the teams tRPC router mount, the settings nav, additive Prisma models, Next.js seams and the teams e2e.
- `050`-`054` are the M5 SSO seams: additive Prisma SSO tables, the next-auth provider registry, OIDC provider refresh, the Next.js transpile entry and the Keycloak browser e2e. Workflow changes in `.github/workflows/seatrota.yml` are SeatRota's own file, not an upstream seam, so they have no patch.

When a seam exists:

- `patches/NNN-short-name.md` explains which upstream file changed and why the seam is needed.
- `patches/NNN-short-name.patch` (or `.diff`) is the queue entry `scripts/upstream-sync.sh` re-applies after an upstream diff.

Markdown notes are documentation. Only `.patch` and `.diff` files are applied. Number prefixes keep a stable order.
