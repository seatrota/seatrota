// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export type RosterHookWhen = "seat-granted" | "booking-requested";

export interface RosterHook {
  readonly hookId: string;
  readonly when: RosterHookWhen;
  readonly note: string;
}

export function describeRosterHook(hook: RosterHook): string {
  return `${hook.when} (${hook.hookId}): ${hook.note}`;
}
