// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { expect, test } from "vitest";

import { grantSeat, openRoster, seatCount } from "./index";

test("grantSeat adds one holder and leaves the original roster unchanged", () => {
  const roster = openRoster({
    rosterId: "roster_desk",
    displayName: "Desk",
    handle: "desk",
  });
  const seated = grantSeat(roster, { personId: "person_ada", role: "member" });

  expect(seatCount(roster)).toBe(0);
  expect(seatCount(seated)).toBe(1);
  expect(seated.holders[0]?.personId).toBe("person_ada");
});
