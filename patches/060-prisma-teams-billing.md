# 060 Prisma teams billing

Additive changes only:

- New `teams_subscription` table: one per-seat Stripe subscription per team. It stores the Stripe customer and subscription ids, the status, the billed seat count, the period end, the cancel-at-period-end flag and the last event id.
- `TeamsTeam` gains the optional `subscription` back-relation. No upstream table is added to, altered or dropped.

Migration: `packages/prisma/migrations/20261117150000_teams_billing`.
