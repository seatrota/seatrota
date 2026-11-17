# 050 Prisma SSO tables

Additive models only: `TeamsSsoConnection`, `TeamsSsoDomain`, and `TeamsSsoRoleMap`, mapped to `teams_sso_*` tables. `TeamsTeam` gains back-relations so the foreign keys type-check. No upstream table is altered.

`scopeKey` is `team:<id>` or `instance` because a Postgres unique index would allow many null team ids.

Migration: `packages/prisma/migrations/20261117120000_teams_sso`.
