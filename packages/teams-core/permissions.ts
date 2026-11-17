// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export const TEAMS_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;

export type TeamsRole = (typeof TEAMS_ROLES)[number];

export const MANAGER_ROLES: readonly TeamsRole[] = ["OWNER", "ADMIN"];

export type TeamsProcedure =
  | "create"
  | "list"
  | "get"
  | "invite"
  | "acceptInvite"
  | "changeRole"
  | "removeMember"
  | "createEventType"
  | "updateEventType"
  | "deleteEventType"
  | "listEventTypes"
  | "publicTeam"
  | "slots"
  | "book"
  | "ssoRead"
  | "ssoManage"
  | "workflowRead"
  | "workflowManage"
  | "insightsRead";

export type TeamsAccessNeed = "public" | "authenticated" | "read" | "manage" | "invitee";

export const PROCEDURE_ACCESS: Record<TeamsProcedure, TeamsAccessNeed> = {
  create: "authenticated",
  list: "authenticated",
  get: "read",
  invite: "manage",
  acceptInvite: "invitee",
  changeRole: "manage",
  removeMember: "manage",
  createEventType: "manage",
  updateEventType: "manage",
  deleteEventType: "manage",
  listEventTypes: "read",
  publicTeam: "public",
  slots: "public",
  book: "public",
  ssoRead: "read",
  ssoManage: "manage",
  workflowRead: "read",
  workflowManage: "manage",
  insightsRead: "read",
};

export class TeamsAccessError extends Error {
  readonly code: "UNAUTHORIZED" | "FORBIDDEN";

  constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "TeamsAccessError";
    this.code = code;
  }
}

export class TeamsRequestError extends Error {
  readonly code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT";

  constructor(code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT", message: string) {
    super(message);
    this.name = "TeamsRequestError";
    this.code = code;
  }
}

export function isManagerRole(role: TeamsRole | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function assertTeamsAccess(input: {
  procedure: TeamsProcedure;
  isAuthenticated: boolean;
  role: TeamsRole | null;
  isInvitee?: boolean;
}): void {
  const need = PROCEDURE_ACCESS[input.procedure];
  if (need === "public") {
    return;
  }
  if (!input.isAuthenticated) {
    throw new TeamsAccessError("UNAUTHORIZED", "Sign in required");
  }
  if (need === "authenticated") {
    return;
  }
  if (need === "invitee") {
    if (!input.isInvitee) {
      throw new TeamsAccessError("FORBIDDEN", "This invite is for a different email");
    }
    return;
  }
  if (!input.role) {
    throw new TeamsAccessError("FORBIDDEN", "You are not a member of this team");
  }
  if (need === "read") {
    return;
  }
  if (!isManagerRole(input.role)) {
    throw new TeamsAccessError("FORBIDDEN", "Only owners and admins can manage this team");
  }
}

export function assertMembershipChange(input: {
  actorRole: TeamsRole;
  action: "changeRole" | "remove";
  targetRole: TeamsRole;
  nextRole?: TeamsRole;
  ownerCount: number;
}): void {
  assertTeamsAccess({
    procedure: input.action === "remove" ? "removeMember" : "changeRole",
    isAuthenticated: true,
    role: input.actorRole,
  });

  if (input.actorRole === "ADMIN" && (input.targetRole === "OWNER" || input.nextRole === "OWNER")) {
    throw new TeamsAccessError("FORBIDDEN", "Admins cannot change an owner");
  }

  const removesOwner =
    input.targetRole === "OWNER" &&
    (input.action === "remove" || (input.nextRole !== undefined && input.nextRole !== "OWNER"));

  if (removesOwner && input.ownerCount <= 1) {
    throw new TeamsAccessError("FORBIDDEN", "The team needs at least one owner");
  }
}
