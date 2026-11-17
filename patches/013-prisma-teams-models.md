# 013 Prisma teams tables

Additive models only: `TeamsTeam`, `TeamsMembership`, `TeamsInvite`, `TeamsEventType`, and `TeamsHost`, mapped to `teams_*` tables. `User` and `EventType` gain back-relations so the foreign keys on the new tables type-check. No upstream team, membership, or host table is used.

Migration: `packages/prisma/migrations/20261117000000_teams_core`.
