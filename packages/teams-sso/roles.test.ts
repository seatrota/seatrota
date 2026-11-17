// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { describe, expect, test } from "vitest";
import { groupMappingMatched, mapGroupsToRole, readGroupClaim } from "./roles";

const mappings = [
  { group: "seat-members", role: "MEMBER" as const },
  { group: "seat-admins", role: "ADMIN" as const },
  { group: "seat-owners", role: "OWNER" as const },
];

describe("group claim role mapping", () => {
  test("reads string and array claims", () => {
    expect(readGroupClaim({ groups: "seat-admins seat-members" }, "groups")).toEqual([
      "seat-admins",
      "seat-members",
    ]);
    expect(readGroupClaim({ groups: ["seat-admins", "/seat-owners"] }, "groups")).toEqual([
      "seat-admins",
      "seat-owners",
    ]);
    expect(readGroupClaim({ groups: ["seat-admins"] }, "")).toEqual([]);
  });

  test("uses the highest matching role", () => {
    expect(
      mapGroupsToRole({
        groups: ["seat-members", "seat-admins"],
        mappings,
        groupClaimEnabled: true,
      })
    ).toBe("ADMIN");
    expect(
      mapGroupsToRole({
        groups: ["/seat-owners", "seat-admins"],
        mappings,
        groupClaimEnabled: true,
      })
    ).toBe("OWNER");
  });

  test("stays a member when nothing matches or the claim is off", () => {
    expect(mapGroupsToRole({ groups: ["other"], mappings, groupClaimEnabled: true })).toBe("MEMBER");
    expect(mapGroupsToRole({ groups: ["seat-owners"], mappings, groupClaimEnabled: false })).toBe("MEMBER");
    expect(groupMappingMatched({ groups: ["seat-admins"], mappings, groupClaimEnabled: true })).toBe(true);
    expect(groupMappingMatched({ groups: ["other"], mappings, groupClaimEnabled: true })).toBe(false);
  });
});
