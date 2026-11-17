# 020 Booking host hooks

`BookingEventHandlerService` gains two methods, `beforeHostSelection` and `onHostCancelled`. They delegate to `@seatrota/teams-scheduling`, which owns round-robin and collective host selection. `packages/teams-core/service.ts` calls `beforeHostSelection` when a team event is booked.

`handleCancelBooking.ts` calls `reassignCancelledTeamHost` from `@seatrota/teams-scheduling/persist` after the upstream cancellation work. The call is inside its own try/catch, so a teams failure is logged and never fails the upstream cancellation.

No upstream host-selection helper is imported or reused. Selection logic lives in `packages/teams-scheduling/scheduler.ts`.
