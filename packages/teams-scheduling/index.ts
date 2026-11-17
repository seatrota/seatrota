// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export { TeamsBookingEventHandler } from "./hooks";
export type {
  AssignmentReason,
  BeforeHostSelectionInput,
  ConfirmedBooking,
  DatedSlots,
  HostCalendar,
  HostCancellationInput,
  HostCandidate,
  HostPriority,
  HostSelection,
  SchedulingMode,
  SlotOffer,
} from "./scheduler";
export {
  beforeHostSelection,
  candidateFromCalendar,
  collectiveSlots,
  onHostCancelled,
  openTimesOf,
  roundRobinSlots,
} from "./scheduler";
