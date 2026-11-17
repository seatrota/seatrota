// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import {
  type BeforeHostSelectionInput,
  beforeHostSelection,
  type HostCancellationInput,
  type HostSelection,
  onHostCancelled,
} from "./scheduler";

/**
 * Booking seam for team host choice. Mirrors BookingEventHandlerService:
 * the booking path asks this handler who should attend, then records the reason.
 * The documented round-robin tie is random; the lowest user id is used instead
 * so the same inputs always return the same host.
 */
export class TeamsBookingEventHandler {
  beforeHostSelection(input: BeforeHostSelectionInput): HostSelection | null {
    return beforeHostSelection(input);
  }

  onHostCancelled(input: HostCancellationInput): HostSelection | null {
    return onHostCancelled(input);
  }
}
