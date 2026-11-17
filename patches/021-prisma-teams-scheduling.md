# 021 Prisma teams scheduling

Additive changes only, on top of 013:

- New enums `TeamsSchedulingType` (`ROUND_ROBIN`, `COLLECTIVE`) and `TeamsHostPriority`.
- `teams_event_type.schedulingType` and `teams_host.priority`, `weight`, `isFixed`, all with defaults.
- New `teams_assignment` table that records which host got each booking, for fair rotation and reassignment.
- `User` and `Booking` gain back-relations to `TeamsAssignment` so the foreign keys type-check. No upstream column or table is added, altered or dropped.

Migration: `packages/prisma/migrations/20261117130000_teams_scheduling`.
