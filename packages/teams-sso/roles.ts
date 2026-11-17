// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import type { TeamsRole } from "@seatrota/teams-core";

const RANK: Record<TeamsRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export interface GroupRoleMapping {
  readonly group: string;
  readonly role: TeamsRole;
}

export function normalizeGroupName(group: string): string {
  const trimmed = group.trim();
  return trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
}

export function readGroupClaim(profile: Record<string, unknown>, claim: string): string[] {
  const name = claim.trim();
  if (!name) return [];
  const value = profile[name];
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map(normalizeGroupName)
      .filter((group) => group.length > 0);
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map(normalizeGroupName)
    .filter((group) => group.length > 0);
}

/**
 * Highest matching role wins so a person in both a member group and an admin group
 * is not stuck at the first mapping in the list. No match, or a blank claim, stays MEMBER.
 */
export function mapGroupsToRole(input: {
  groups: readonly string[];
  mappings: readonly GroupRoleMapping[];
  groupClaimEnabled: boolean;
}): TeamsRole {
  if (!input.groupClaimEnabled) return "MEMBER";
  const present = new Set(input.groups.map(normalizeGroupName));
  let best: TeamsRole = "MEMBER";
  for (const mapping of input.mappings) {
    if (!present.has(normalizeGroupName(mapping.group))) continue;
    if (RANK[mapping.role] > RANK[best]) best = mapping.role;
  }
  return best;
}

export function groupMappingMatched(input: {
  groups: readonly string[];
  mappings: readonly GroupRoleMapping[];
  groupClaimEnabled: boolean;
}): boolean {
  if (!input.groupClaimEnabled) return false;
  const present = new Set(input.groups.map(normalizeGroupName));
  return input.mappings.some((mapping) => present.has(normalizeGroupName(mapping.group)));
}
