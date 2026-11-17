// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

const TEAM_PREFIX = "teams-oidc-team-";
const INSTANCE_ID = "teams-oidc-instance";

export type SsoScope = "team" | "instance";

export function scopeKeyFor(scope: SsoScope, teamId: number): string {
  return scope === "instance" ? "instance" : `team:${teamId}`;
}

export function providerIdForScopeKey(scopeKey: string): string {
  if (scopeKey === "instance") return INSTANCE_ID;
  if (scopeKey.startsWith("team:")) return `${TEAM_PREFIX}${scopeKey.slice("team:".length)}`;
  return `${TEAM_PREFIX}${scopeKey}`;
}

export function isTeamsOidcProvider(provider: string | undefined): provider is string {
  return provider === INSTANCE_ID || (!!provider && provider.startsWith(TEAM_PREFIX));
}

export function scopeKeyFromProvider(provider: string): string | null {
  if (provider === INSTANCE_ID) return "instance";
  if (!provider.startsWith(TEAM_PREFIX)) return null;
  const teamId = provider.slice(TEAM_PREFIX.length);
  if (!/^[0-9]+$/.test(teamId)) return null;
  return `team:${teamId}`;
}
