// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { expect, test } from "vitest";
import { TeamsBookingEventHandler } from "./hooks";
import {
  beforeHostSelection,
  type ConfirmedBooking,
  collectiveSlots,
  type HostCalendar,
  type HostCandidate,
  onHostCancelled,
  roundRobinSlots,
} from "./scheduler";

const day = "2026-11-18";
const nine = "2026-11-18T09:00:00.000Z";
const ten = "2026-11-18T10:00:00.000Z";
const eleven = "2026-11-18T11:00:00.000Z";

function calendar(input: {
  userId: number;
  times: string[];
  priority?: HostCalendar["priority"];
  weight?: number;
  fixed?: boolean;
}): HostCalendar {
  return {
    userId: input.userId,
    priority: input.priority ?? "medium",
    weight: input.weight ?? 100,
    fixed: input.fixed ?? false,
    slots: { [day]: input.times.map((time) => ({ time })) },
  };
}

function candidate(host: HostCalendar, openTimes?: readonly string[]): HostCandidate {
  return {
    userId: host.userId,
    priority: host.priority,
    weight: host.weight,
    fixed: host.fixed,
    openTimes: openTimes ?? host.slots[day]?.map((slot) => slot.time) ?? [],
  };
}

test("collective offers no slot where any required host is busy", () => {
  const opened = collectiveSlots([
    calendar({ userId: 1, times: [nine, ten] }),
    calendar({ userId: 2, times: [nine, eleven] }),
    calendar({ userId: 3, times: [nine, ten, eleven] }),
  ]);
  const times = (opened[day] ?? []).map((slot) => slot.time);

  expect(times).toEqual([nine]);
  expect(opened[day]?.[0]?.userIds).toEqual([1, 2, 3]);
  expect(times.includes(ten)).toBe(false);
  expect(times.includes(eleven)).toBe(false);
});

test("a weight of zero does not gate the collective intersection", () => {
  const opened = collectiveSlots([
    calendar({ userId: 1, times: [nine, ten] }),
    calendar({ userId: 2, times: [nine], weight: 0 }),
  ]);
  expect((opened[day] ?? []).map((slot) => slot.time)).toEqual([nine, ten]);
});

test("round-robin slots are the union, and a busy fixed host removes the time", () => {
  const opened = roundRobinSlots([
    calendar({ userId: 1, times: [nine] }),
    calendar({ userId: 2, times: [ten] }),
    calendar({ userId: 3, times: [nine], fixed: true }),
  ]);
  const times = (opened[day] ?? []).map((slot) => slot.time);
  expect(times).toEqual([nine]);
  expect(opened[day]?.[0]?.userIds).toEqual([3, 1]);
});

test("priority high is chosen ahead of a less-booked medium host", () => {
  const hosts = [
    candidate(calendar({ userId: 10, times: [nine], priority: "medium" })),
    candidate(calendar({ userId: 11, times: [nine], priority: "high" })),
    candidate(calendar({ userId: 12, times: [nine], priority: "low" })),
  ];
  const picked = beforeHostSelection({
    mode: "round-robin",
    time: nine,
    hosts,
    history: [{ userId: 11, bookedAt: "2026-11-01T00:00:00.000Z" }],
  });
  expect(picked).toEqual({
    organizerUserId: 11,
    hostUserIds: [11],
    assignmentReason: "priority",
  });
});

test("weight-adjusted fairness prefers the host furthest under their share", () => {
  const hosts = [
    candidate(calendar({ userId: 1, times: [nine], weight: 100 })),
    candidate(calendar({ userId: 2, times: [nine], weight: 200 })),
  ];
  const history: ConfirmedBooking[] = [];
  for (let index = 0; index < 8; index += 1) {
    history.push({ userId: 1, bookedAt: `2026-10-01T00:0${index}:00.000Z` });
  }
  for (let index = 0; index < 12; index += 1) {
    history.push({ userId: 2, bookedAt: `2026-10-02T00:${String(index).padStart(2, "0")}:00.000Z` });
  }
  const picked = beforeHostSelection({ mode: "round-robin", time: nine, hosts, history });
  expect(picked?.organizerUserId).toBe(2);
  expect(picked?.assignmentReason).toBe("weight");
});

test("least-recently-booked breaks a weight tie", () => {
  const hosts = [
    candidate(calendar({ userId: 4, times: [nine] })),
    candidate(calendar({ userId: 5, times: [nine] })),
  ];
  const picked = beforeHostSelection({
    mode: "round-robin",
    time: nine,
    hosts,
    history: [
      { userId: 4, bookedAt: "2026-11-02T00:00:00.000Z" },
      { userId: 5, bookedAt: "2026-11-01T00:00:00.000Z" },
    ],
  });
  expect(picked?.organizerUserId).toBe(5);
  expect(picked?.assignmentReason).toBe("least-recently-booked");
});

test("the lowest user id breaks a remaining tie", () => {
  const hosts = [
    candidate(calendar({ userId: 8, times: [nine] })),
    candidate(calendar({ userId: 7, times: [nine] })),
  ];
  const picked = beforeHostSelection({
    mode: "round-robin",
    time: nine,
    hosts,
    history: [
      { userId: 7, bookedAt: "2026-11-01T00:00:00.000Z" },
      { userId: 8, bookedAt: "2026-11-01T00:00:00.000Z" },
    ],
  });
  expect(picked?.organizerUserId).toBe(7);
  expect(picked?.assignmentReason).toBe("tiebreak");
});

test("fixed hosts are always included with the rotating host", () => {
  const hosts = [
    candidate(calendar({ userId: 2, times: [nine] })),
    candidate(calendar({ userId: 9, times: [nine], fixed: true })),
  ];
  const picked = beforeHostSelection({ mode: "round-robin", time: nine, hosts, history: [] });
  expect(picked?.organizerUserId).toBe(2);
  expect(picked?.hostUserIds).toEqual([2, 9]);
});

test("collective selection adds every required host", () => {
  const hosts = [
    candidate(calendar({ userId: 3, times: [nine] })),
    candidate(calendar({ userId: 1, times: [nine] })),
  ];
  const handler = new TeamsBookingEventHandler();
  expect(handler.beforeHostSelection({ mode: "collective", time: nine, hosts, history: [] })).toEqual({
    organizerUserId: 3,
    hostUserIds: [3, 1],
    assignmentReason: "collective",
  });
});

test("cancelling the rotating host reassigns and cancelling a collective does not", () => {
  const hosts = [
    candidate(calendar({ userId: 1, times: [nine] })),
    candidate(calendar({ userId: 2, times: [nine] })),
  ];
  const next = onHostCancelled({
    cancelledUserId: 1,
    organizerUserId: 1,
    mode: "round-robin",
    time: nine,
    hosts,
    history: [],
  });
  expect(next?.organizerUserId).toBe(2);
  expect(
    onHostCancelled({
      cancelledUserId: 1,
      organizerUserId: 1,
      mode: "collective",
      time: nine,
      hosts,
      history: [],
    })
  ).toBeNull();
});

test("300 bookings at weights 100/100/50 stay within 5 points of 40/40/20", () => {
  const hosts = [
    candidate(calendar({ userId: 1, times: [nine], weight: 100 })),
    candidate(calendar({ userId: 2, times: [nine], weight: 100 })),
    candidate(calendar({ userId: 3, times: [nine], weight: 50 })),
  ];
  const history: ConfirmedBooking[] = [];
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  for (let index = 0; index < 300; index += 1) {
    const picked = beforeHostSelection({ mode: "round-robin", time: nine, hosts, history });
    expect(picked).not.toBeNull();
    if (!picked) {
      return;
    }
    const nextCount = counts[picked.organizerUserId] ?? 0;
    counts[picked.organizerUserId] = nextCount + 1;
    history.push({
      userId: picked.organizerUserId,
      bookedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    });
  }
  const shares = {
    user1: (counts[1] ?? 0) / 300,
    user2: (counts[2] ?? 0) / 300,
    user3: (counts[3] ?? 0) / 300,
  };
  console.log(JSON.stringify({ counts, shares }));
  expect(Math.abs(shares.user1 - 0.4)).toBeLessThanOrEqual(0.05);
  expect(Math.abs(shares.user2 - 0.4)).toBeLessThanOrEqual(0.05);
  expect(Math.abs(shares.user3 - 0.2)).toBeLessThanOrEqual(0.05);
});
