// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { describe, expect, test } from "vitest";
import {
  assertMembershipChange,
  assertTeamsAccess,
  PROCEDURE_ACCESS,
  TeamsAccessError,
  type TeamsProcedure,
  type TeamsRole,
} from "./permissions";

function expectForbidden(run: () => void) {
  expect(run).toThrow(TeamsAccessError);
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(TeamsAccessError);
    expect((error as TeamsAccessError).code).toBe("FORBIDDEN");
  }
}

describe("router permission checks", () => {
  const procedures = Object.keys(PROCEDURE_ACCESS) as TeamsProcedure[];

  test("public procedures do not require a session", () => {
    for (const procedure of procedures.filter((name) => PROCEDURE_ACCESS[name] === "public")) {
      expect(() => assertTeamsAccess({ procedure, isAuthenticated: false, role: null })).not.toThrow();
    }
  });

  test("signed-out callers cannot use private procedures", () => {
    for (const procedure of procedures.filter((name) => PROCEDURE_ACCESS[name] !== "public")) {
      expect(() => assertTeamsAccess({ procedure, isAuthenticated: false, role: "OWNER" })).toThrow(
        TeamsAccessError
      );
    }
  });

  test("any signed-in user can create and list teams", () => {
    expect(() => assertTeamsAccess({ procedure: "create", isAuthenticated: true, role: null })).not.toThrow();
    expect(() => assertTeamsAccess({ procedure: "list", isAuthenticated: true, role: null })).not.toThrow();
  });

  test.each(["get", "listEventTypes", "ssoRead"] as const)("members can read %s", (procedure) => {
    for (const role of ["OWNER", "ADMIN", "MEMBER"] as const) {
      expect(() => assertTeamsAccess({ procedure, isAuthenticated: true, role })).not.toThrow();
    }
    expectForbidden(() => assertTeamsAccess({ procedure, isAuthenticated: true, role: null }));
  });

  test.each([
    "invite",
    "changeRole",
    "removeMember",
    "createEventType",
    "updateEventType",
    "deleteEventType",
    "ssoManage",
  ] as const)("only owners and admins can %s", (procedure) => {
    expect(() => assertTeamsAccess({ procedure, isAuthenticated: true, role: "OWNER" })).not.toThrow();
    expect(() => assertTeamsAccess({ procedure, isAuthenticated: true, role: "ADMIN" })).not.toThrow();
    expectForbidden(() => assertTeamsAccess({ procedure, isAuthenticated: true, role: "MEMBER" }));
    expectForbidden(() => assertTeamsAccess({ procedure, isAuthenticated: true, role: null }));
  });

  test("acceptInvite is limited to the invited email", () => {
    expect(() =>
      assertTeamsAccess({ procedure: "acceptInvite", isAuthenticated: true, role: null, isInvitee: true })
    ).not.toThrow();
    expectForbidden(() =>
      assertTeamsAccess({ procedure: "acceptInvite", isAuthenticated: true, role: "OWNER", isInvitee: false })
    );
  });
});

describe("membership changes", () => {
  test("admins cannot change or remove an owner", () => {
    expectForbidden(() =>
      assertMembershipChange({
        actorRole: "ADMIN",
        action: "changeRole",
        targetRole: "OWNER",
        nextRole: "ADMIN",
        ownerCount: 1,
      })
    );
    expectForbidden(() =>
      assertMembershipChange({
        actorRole: "ADMIN",
        action: "remove",
        targetRole: "OWNER",
        ownerCount: 2,
      })
    );
    expectForbidden(() =>
      assertMembershipChange({
        actorRole: "ADMIN",
        action: "changeRole",
        targetRole: "MEMBER",
        nextRole: "OWNER",
        ownerCount: 1,
      })
    );
  });

  test("admins can change members", () => {
    expect(() =>
      assertMembershipChange({
        actorRole: "ADMIN",
        action: "changeRole",
        targetRole: "MEMBER",
        nextRole: "ADMIN",
        ownerCount: 1,
      })
    ).not.toThrow();
  });

  test("the last owner stays in place", () => {
    expectForbidden(() =>
      assertMembershipChange({
        actorRole: "OWNER",
        action: "remove",
        targetRole: "OWNER",
        ownerCount: 1,
      })
    );
    expectForbidden(() =>
      assertMembershipChange({
        actorRole: "OWNER",
        action: "changeRole",
        targetRole: "OWNER",
        nextRole: "ADMIN",
        ownerCount: 1,
      })
    );
  });

  test("an owner can demote another owner when a second owner remains", () => {
    expect(() =>
      assertMembershipChange({
        actorRole: "OWNER" satisfies TeamsRole,
        action: "changeRole",
        targetRole: "OWNER",
        nextRole: "MEMBER",
        ownerCount: 2,
      })
    ).not.toThrow();
  });

  test("members cannot change roles", () => {
    expectForbidden(() =>
      assertMembershipChange({
        actorRole: "MEMBER",
        action: "changeRole",
        targetRole: "MEMBER",
        nextRole: "ADMIN",
        ownerCount: 1,
      })
    );
  });
});
