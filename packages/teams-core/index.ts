// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export type SeatRole = "owner" | "manager" | "member";

export interface SeatHolder {
  readonly personId: string;
  readonly role: SeatRole;
}

export interface Roster {
  readonly rosterId: string;
  readonly displayName: string;
  readonly handle: string;
  readonly holders: readonly SeatHolder[];
}

export function openRoster(input: { rosterId: string; displayName: string; handle: string }): Roster {
  return {
    rosterId: input.rosterId,
    displayName: input.displayName,
    handle: input.handle,
    holders: [],
  };
}

export function grantSeat(roster: Roster, holder: SeatHolder): Roster {
  return {
    ...roster,
    holders: [...roster.holders, holder],
  };
}

export function seatCount(roster: Roster): number {
  return roster.holders.length;
}
