# 011 Mount teams router

`packages/trpc/server/routers/viewer/_router.tsx` mounts `teamsRouter` from `@seatrota/teams-core/router` as `viewer.teams`.

Cal.diy serves each viewer namespace from its own `/api/trpc/<name>` route. `viewer.teams.*` is three segments, so the client sends it to `/api/trpc/teams`. `teams` is added to `ENDPOINTS`, and `apps/web/pages/api/trpc/teams/[trpc].ts` handles that router.

The procedures (create, list, get, invite, accept, role changes, member removal, event-type CRUD, public page, slots, and book) and their owner/admin/member checks live in `packages/teams-core`.
