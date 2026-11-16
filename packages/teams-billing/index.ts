// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export interface SeatBill {
  readonly rosterId: string;
  readonly occupiedSeats: number;
  readonly minorUnitsPerSeat: number;
}

export function seatBillMinorUnits(bill: SeatBill): number {
  if (bill.occupiedSeats < 0 || bill.minorUnitsPerSeat < 0) {
    return 0;
  }
  return bill.occupiedSeats * bill.minorUnitsPerSeat;
}
