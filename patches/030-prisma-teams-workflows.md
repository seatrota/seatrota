# 030 Prisma teams workflows

Additive changes only, on top of 021:

- New enums `TeamsReminderTiming` (`BEFORE_START`, `AFTER_END`), `TeamsReminderRecipient` (`ATTENDEE`, `HOSTS`) and `TeamsReminderStatus`.
- New `teams_workflow` table: one email reminder rule per row on a team event type, with timing, offset in minutes, recipient, subject and body templates.
- New `teams_reminder` table: one queued email per rule and booking, with its send time, status and attempt count. `bookingId` has no foreign key, so the upstream `Booking` model is not touched; the sender cancels a row whose booking is gone or cancelled.
- `TeamsEventType` gains the `workflows` back-relation. No upstream table is added to, altered or dropped.

Migration: `packages/prisma/migrations/20261117140000_teams_workflows`.
