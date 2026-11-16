// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export interface RosterTally {
  readonly rosterId: string;
  readonly bookingCount: number;
}

export function sumRosterBookings(rows: readonly RosterTally[]): number {
  let total = 0;
  for (const row of rows) {
    total += row.bookingCount;
  }
  return total;
}
