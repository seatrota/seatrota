# 014 Next.js seams

`apps/web/next.config.ts` transpiles `@seatrota/teams-core` and `@seatrota/teams-booking`, which ship TypeScript source.

The permanent redirect from `/settings/teams` to `/teams` is removed so the settings pages in patch 012 are reachable. The command palette already points at `/settings/teams`.
