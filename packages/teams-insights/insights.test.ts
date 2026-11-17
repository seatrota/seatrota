// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { describe, expect, test } from "vitest";
import { buildInsights, type InsightBooking, isNoShow, percent, resolveRange } from "./insights";

const members = [
  { userId: 1, name: "Ana" },
  { userId: 2, name: "Ben" },
  { userId: 3, name: "Cy" },
];
const eventTypes = [
  { id: 10, title: "Intro", schedulingType: "ROUND_ROBIN" as const, hostUserIds: [1, 2, 3] },
  { id: 20, title: "Panel", schedulingType: "COLLECTIVE" as const, hostUserIds: [1, 2, 3] },
];

function booking(overrides: Partial<InsightBooking> & Pick<InsightBooking, "bookingId">): InsightBooking {
  return {
    eventTypeId: 10,
    assignedUserId: 1,
    hostUserIds: [1],
    status: "ACCEPTED",
    noShowHost: false,
    guestNoShow: false,
    ...overrides,
  };
}

describe("team insights", () => {
  const bookings: InsightBooking[] = [
    booking({ bookingId: 1, assignedUserId: 1, hostUserIds: [1] }),
    booking({ bookingId: 2, assignedUserId: 1, hostUserIds: [1], guestNoShow: true }),
    booking({ bookingId: 3, assignedUserId: 2, hostUserIds: [2] }),
    booking({ bookingId: 4, assignedUserId: 2, hostUserIds: [2], status: "CANCELLED" }),
    booking({ bookingId: 5, assignedUserId: 3, hostUserIds: [3], noShowHost: true }),
    booking({ bookingId: 6, assignedUserId: 3, hostUserIds: [3], status: "REJECTED", guestNoShow: true }),
    booking({ bookingId: 7, eventTypeId: 20, assignedUserId: 1, hostUserIds: [1, 2, 3] }),
  ];
  const insights = buildInsights({ bookings, members, eventTypes });

  test("totals count bookings, cancellations and no-shows", () => {
    expect(insights.totals).toEqual({
      bookings: 7,
      active: 5,
      cancelled: 2,
      noShows: 2,
      guestNoShows: 1,
      hostNoShows: 1,
      cancellationRate: 28.6,
      noShowRate: 40,
    });
  });

  test("each member gets the bookings they organized and the ones they hosted", () => {
    expect(insights.members.map((member) => [member.name, member.bookings, member.cancelled, member.noShows, member.hosted])).toEqual([
      ["Ana", 3, 0, 1, 3],
      ["Ben", 2, 1, 0, 2],
      ["Cy", 2, 1, 1, 2],
    ]);
  });

  test("event types are tallied separately", () => {
    expect(insights.eventTypes.map((eventType) => [eventType.title, eventType.bookings, eventType.active])).toEqual([
      ["Intro", 6, 4],
      ["Panel", 1, 1],
    ]);
  });

  test("round-robin distribution covers active bookings and lists hosts with none", () => {
    const empty = buildInsights({
      bookings: [booking({ bookingId: 1, assignedUserId: 2 })],
      members,
      eventTypes,
    });
    expect(empty.roundRobin).toEqual([
      {
        eventTypeId: 10,
        title: "Intro",
        total: 1,
        rows: [
          { userId: 2, name: "Ben", bookings: 1, share: 100 },
          { userId: 1, name: "Ana", bookings: 0, share: 0 },
          { userId: 3, name: "Cy", bookings: 0, share: 0 },
        ],
      },
    ]);
    expect(insights.roundRobin[0]?.rows.map((row) => [row.name, row.bookings, row.share])).toEqual([
      ["Ana", 2, 50],
      ["Ben", 1, 25],
      ["Cy", 1, 25],
    ]);
  });

  test("a cancelled booking is never a no-show, and empty data gives zero rates", () => {
    expect(isNoShow({ status: "CANCELLED", noShowHost: true, guestNoShow: true })).toBe(false);
    expect(percent(1, 0)).toBe(0);
    const none = buildInsights({ bookings: [], members, eventTypes: [] });
    expect(none.totals.cancellationRate).toBe(0);
    expect(none.totals.noShowRate).toBe(0);
    expect(none.members.every((member) => member.bookings === 0)).toBe(true);
  });
});

describe("dashboard range", () => {
  const now = new Date("2026-12-01T00:00:00.000Z");

  test("defaults to 30 days either side of now", () => {
    const range = resolveRange({}, now);
    expect(range.from.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });

  test("refuses reversed, invalid or over-long ranges", () => {
    expect(() => resolveRange({ from: "2026-12-02", to: "2026-12-01" }, now)).toThrow(RangeError);
    expect(() => resolveRange({ from: "nope" }, now)).toThrow(RangeError);
    expect(() => resolveRange({ from: "2025-01-01", to: "2026-12-01" }, now)).toThrow(RangeError);
  });
});
