// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { expect, test } from "vitest";

import { hostForSlot, unionHostSlots } from "./slots";

test("the first host keeps a shared time and the next host fills the gap", () => {
  const merged = unionHostSlots([
    {
      userId: 1,
      slots: {
        "2026-11-18": [{ time: "2026-11-18T09:00:00.000Z" }, { time: "2026-11-18T10:00:00.000Z" }],
      },
    },
    {
      userId: 2,
      slots: {
        "2026-11-18": [{ time: "2026-11-18T09:00:00.000Z" }, { time: "2026-11-18T11:00:00.000Z" }],
      },
    },
  ]);

  expect(merged["2026-11-18"]).toEqual([
    { time: "2026-11-18T09:00:00.000Z", userId: 1 },
    { time: "2026-11-18T10:00:00.000Z", userId: 1 },
    { time: "2026-11-18T11:00:00.000Z", userId: 2 },
  ]);
  expect(hostForSlot(merged, "2026-11-18T11:00:00.000Z")).toBe(2);
  expect(hostForSlot(merged, "2026-11-18T12:00:00.000Z")).toBeNull();
});
