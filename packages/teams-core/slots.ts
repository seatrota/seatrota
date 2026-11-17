// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export type HostSlotGroup = {
  userId: number;
  slots: Record<string, { time: string }[]>;
};

export type TeamSlot = {
  time: string;
  userId: number;
};

/**
 * Union of host availability. The first host in `hostsInOrder` keeps a time
 * when more than one host is free. Later hosts only fill times nobody earlier claimed.
 */
export function unionHostSlots(hostsInOrder: readonly HostSlotGroup[]): Record<string, TeamSlot[]> {
  const merged: Record<string, TeamSlot[]> = {};
  const claimed = new Set<string>();

  for (const host of hostsInOrder) {
    for (const [date, slots] of Object.entries(host.slots)) {
      for (const slot of slots) {
        if (claimed.has(slot.time)) {
          continue;
        }
        claimed.add(slot.time);
        const day = merged[date] ?? [];
        day.push({ time: slot.time, userId: host.userId });
        merged[date] = day;
      }
    }
  }

  return merged;
}

export function hostForSlot(slots: Record<string, TeamSlot[]>, time: string): number | null {
  for (const day of Object.values(slots)) {
    const match = day.find((slot) => slot.time === time);
    if (match) {
      return match.userId;
    }
  }
  return null;
}
