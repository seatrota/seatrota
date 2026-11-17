// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { expect, test } from "vitest";

test("teams router exposes the core procedures", async () => {
  const { teamsRouter } = await import("./router");
  const procedures = Object.keys(teamsRouter._def.procedures);
  expect(procedures).toEqual(
    expect.arrayContaining([
      "create",
      "list",
      "get",
      "invite",
      "acceptInvite",
      "changeRole",
      "removeMember",
      "createEventType",
      "updateEventType",
      "deleteEventType",
      "publicTeam",
      "slots",
      "book",
      "ssoGet",
    ])
  );
});
