// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export interface RosterBookingRequest {
  readonly requestId: string;
  readonly rosterId: string;
  readonly startsAtIso: string;
}

export function rosterBookingKey(request: RosterBookingRequest): string {
  return `${request.rosterId}:${request.requestId}:${request.startsAtIso}`;
}
