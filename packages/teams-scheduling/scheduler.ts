// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export type HostPriority = "high" | "medium" | "low";

export type SchedulingMode = "round-robin" | "collective";

export type AssignmentReason =
  | "priority"
  | "weight"
  | "least-recently-booked"
  | "tiebreak"
  | "collective"
  | "fixed";

export type DatedSlots = Readonly<Record<string, readonly { time: string }[]>>;

export type HostCalendar = {
  userId: number;
  priority: HostPriority;
  weight: number;
  fixed: boolean;
  slots: DatedSlots;
};

export type HostCandidate = {
  userId: number;
  priority: HostPriority;
  weight: number;
  fixed: boolean;
  openTimes: readonly string[];
};

export type ConfirmedBooking = {
  userId: number;
  bookedAt: string;
};

export type HostSelection = {
  organizerUserId: number;
  hostUserIds: number[];
  assignmentReason: AssignmentReason;
};

export type SlotOffer = {
  time: string;
  userIds: number[];
};

export type BeforeHostSelectionInput = {
  mode: SchedulingMode;
  time: string;
  hosts: readonly HostCandidate[];
  history: readonly ConfirmedBooking[];
};

export type HostCancellationInput = {
  cancelledUserId: number;
  organizerUserId: number;
  mode: SchedulingMode;
  time: string;
  hosts: readonly HostCandidate[];
  history: readonly ConfirmedBooking[];
};

const PRIORITY_RANK: Record<HostPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function openTimesOf(slots: DatedSlots): string[] {
  const times: string[] = [];
  for (const day of Object.values(slots)) {
    for (const slot of day) {
      times.push(slot.time);
    }
  }
  return times;
}

export function candidateFromCalendar(host: HostCalendar): HostCandidate {
  return {
    userId: host.userId,
    priority: host.priority,
    weight: host.weight,
    fixed: host.fixed,
    openTimes: openTimesOf(host.slots),
  };
}

function eligible(host: HostCandidate): boolean {
  return host.weight > 0;
}

function hasTime(host: HostCandidate, time: string): boolean {
  for (const open of host.openTimes) {
    if (open === time) {
      return true;
    }
  }
  return false;
}

function indexTimes(slots: DatedSlots): Map<string, string> {
  const times = new Map<string, string>();
  for (const [date, day] of Object.entries(slots)) {
    for (const slot of day) {
      if (!times.has(slot.time)) {
        times.set(slot.time, date);
      }
    }
  }
  return times;
}

function pushSlot(target: Record<string, SlotOffer[]>, date: string, time: string, userIds: number[]): void {
  const day = target[date] ?? [];
  day.push({ time, userIds });
  target[date] = day;
}

export function collectiveSlots(hosts: readonly HostCalendar[]): Record<string, SlotOffer[]> {
  const required = hosts.filter((host) => host.weight > 0);
  if (required.length === 0) {
    return {};
  }
  const indexes = required.map((host) => indexTimes(host.slots));
  const first = indexes[0];
  if (!first) {
    return {};
  }
  const result: Record<string, SlotOffer[]> = {};
  const userIds = required.map((host) => host.userId);
  for (const entry of Array.from(first.entries())) {
    const time = entry[0];
    const date = entry[1];
    let everyoneFree = true;
    for (let index = 1; index < indexes.length; index += 1) {
      const hostTimes = indexes[index];
      if (!hostTimes?.has(time)) {
        everyoneFree = false;
        break;
      }
    }
    if (!everyoneFree) {
      continue;
    }
    pushSlot(result, date, time, userIds);
  }
  return result;
}

export function roundRobinSlots(hosts: readonly HostCalendar[]): Record<string, SlotOffer[]> {
  const fixed = hosts.filter((host) => host.fixed && host.weight > 0);
  const rotating = hosts.filter((host) => !host.fixed && host.weight > 0);
  if (fixed.length === 0 && rotating.length === 0) {
    return {};
  }
  const fixedIndexes = fixed.map((host) => indexTimes(host.slots));
  const rotatingIndexes = rotating.map((host) => ({
    userId: host.userId,
    times: indexTimes(host.slots),
  }));
  const timeToDate = new Map<string, string>();
  const sources = rotating.length > 0 ? rotatingIndexes.map((host) => host.times) : fixedIndexes;
  for (const times of sources) {
    for (const entry of Array.from(times.entries())) {
      const time = entry[0];
      const date = entry[1];
      if (!timeToDate.has(time)) {
        timeToDate.set(time, date);
      }
    }
  }
  const result: Record<string, SlotOffer[]> = {};
  for (const entry of Array.from(timeToDate.entries())) {
    const time = entry[0];
    const date = entry[1];
    let fixedFree = true;
    for (const hostTimes of fixedIndexes) {
      if (!hostTimes.has(time)) {
        fixedFree = false;
        break;
      }
    }
    if (!fixedFree) {
      continue;
    }
    const rotatingIds: number[] = [];
    for (const host of rotatingIndexes) {
      if (host.times.has(time)) {
        rotatingIds.push(host.userId);
      }
    }
    if (rotating.length > 0 && rotatingIds.length === 0) {
      continue;
    }
    const userIds = [...fixed.map((host) => host.userId), ...rotatingIds];
    pushSlot(result, date, time, userIds);
  }
  return result;
}

type Load = {
  count: number;
  last: string | null;
};

function loadFor(userId: number, history: readonly ConfirmedBooking[]): Load {
  let count = 0;
  let last: string | null = null;
  for (const row of history) {
    if (row.userId !== userId) {
      continue;
    }
    count += 1;
    if (last === null || row.bookedAt > last) {
      last = row.bookedAt;
    }
  }
  return { count, last };
}

function ratioLess(left: Load, leftWeight: number, right: Load, rightWeight: number): boolean {
  return left.count * rightWeight < right.count * leftWeight;
}

function narrowRotating(
  pool: readonly HostCandidate[],
  history: readonly ConfirmedBooking[]
): { host: HostCandidate; reason: AssignmentReason } {
  const topRank = pool.reduce((rank, host) => Math.max(rank, PRIORITY_RANK[host.priority]), 0);
  const ranked = pool.filter((host) => PRIORITY_RANK[host.priority] === topRank);
  const top = ranked[0];
  if (!top) {
    throw new Error("round-robin pool was empty");
  }
  if (ranked.length === 1) {
    return { host: top, reason: pool.length > 1 ? "priority" : "tiebreak" };
  }

  let fairest = ranked;
  let bestLoad = loadFor(top.userId, history);
  let bestWeight = top.weight;
  const kept: HostCandidate[] = [];
  for (const host of ranked) {
    const load = loadFor(host.userId, history);
    if (kept.length === 0 || ratioLess(load, host.weight, bestLoad, bestWeight)) {
      bestLoad = load;
      bestWeight = host.weight;
      kept.length = 0;
      kept.push(host);
    } else if (!ratioLess(bestLoad, bestWeight, load, host.weight)) {
      kept.push(host);
    }
  }
  fairest = kept;
  const fairestHost = fairest[0];
  if (!fairestHost) {
    throw new Error("round-robin pool was empty");
  }
  if (fairest.length === 1) {
    return { host: fairestHost, reason: "weight" };
  }

  const quiet: HostCandidate[] = [];
  let oldestAt: string | null = null;
  for (const host of fairest) {
    const at = loadFor(host.userId, history).last;
    const stamp = at ?? "";
    const oldestStamp = oldestAt ?? "";
    if (quiet.length === 0 || stamp < oldestStamp) {
      oldestAt = stamp;
      quiet.length = 0;
      quiet.push(host);
    } else if (stamp === oldestStamp) {
      quiet.push(host);
    }
  }
  const quietHost = quiet[0];
  if (!quietHost) {
    throw new Error("round-robin pool was empty");
  }
  if (quiet.length === 1) {
    return { host: quietHost, reason: "least-recently-booked" };
  }

  let winner = quietHost;
  for (const host of quiet) {
    if (host.userId < winner.userId) {
      winner = host;
    }
  }
  return { host: winner, reason: "tiebreak" };
}

function selectionFor(
  organizerUserId: number,
  hostUserIds: number[],
  assignmentReason: AssignmentReason
): HostSelection {
  return { organizerUserId, hostUserIds, assignmentReason };
}

export function beforeHostSelection(input: BeforeHostSelectionInput): HostSelection | null {
  if (input.mode === "collective") {
    const required = input.hosts.filter((host) => eligible(host));
    if (required.length === 0) {
      return null;
    }
    for (const host of required) {
      if (!hasTime(host, input.time)) {
        return null;
      }
    }
    const organizer = required[0];
    if (!organizer) {
      return null;
    }
    return selectionFor(
      organizer.userId,
      required.map((host) => host.userId),
      "collective"
    );
  }

  const fixed = input.hosts.filter((host) => host.fixed && eligible(host));
  const rotating = input.hosts.filter((host) => !host.fixed && eligible(host));
  for (const host of fixed) {
    if (!hasTime(host, input.time)) {
      return null;
    }
  }
  const available = rotating.filter((host) => hasTime(host, input.time));
  if (available.length === 0) {
    if (fixed.length === 0) {
      return null;
    }
    const ordered = [...fixed].sort((left, right) => left.userId - right.userId);
    const organizer = ordered[0];
    if (!organizer) {
      return null;
    }
    return selectionFor(
      organizer.userId,
      ordered.map((host) => host.userId),
      "fixed"
    );
  }

  const picked = narrowRotating(available, input.history);
  const fixedIds = fixed.map((host) => host.userId).sort((left, right) => left - right);
  const hostUserIds = [picked.host.userId, ...fixedIds.filter((userId) => userId !== picked.host.userId)];
  return selectionFor(picked.host.userId, hostUserIds, picked.reason);
}

export function onHostCancelled(input: HostCancellationInput): HostSelection | null {
  if (input.mode !== "round-robin") {
    return null;
  }
  if (input.cancelledUserId !== input.organizerUserId) {
    return null;
  }
  const cancelled = input.hosts.find((host) => host.userId === input.cancelledUserId);
  if (!cancelled || cancelled.fixed) {
    return null;
  }
  const hosts = input.hosts.map((host) => {
    if (host.userId !== input.cancelledUserId) {
      return host;
    }
    return {
      ...host,
      openTimes: host.openTimes.filter((time) => time !== input.time),
    };
  });
  const next = beforeHostSelection({
    mode: input.mode,
    time: input.time,
    hosts,
    history: input.history,
  });
  if (!next || next.organizerUserId === input.cancelledUserId) {
    return null;
  }
  return next;
}
