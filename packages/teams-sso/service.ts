// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { randomBytes } from "node:crypto";
import { prisma } from "@calcom/prisma";
import { assertTeamsAccess, TeamsRequestError, type TeamsRole } from "@seatrota/teams-core";
import { nodeDnsTxtResolver } from "./dns-resolver";
import {
  assertDomain,
  type DnsTxtResolver,
  emailDomain,
  txtRecordProvesDomain,
  verificationHost,
  verificationTokenText,
} from "./domain";
import { decidePasswordLogin } from "./enforce";
import { type TeamsOidcProviderConfig, teamsOidcProvider } from "./oidc-provider";
import { ssoPlanEnabled } from "./plan";
import { providerIdForScopeKey, type SsoScope, scopeKeyFor, scopeKeyFromProvider } from "./provider-id";
import { type GroupRoleMapping, groupMappingMatched, mapGroupsToRole, readGroupClaim } from "./roles";
import { decryptClientSecret, encryptClientSecret } from "./secrets";

const ROLE_VALUES: readonly TeamsRole[] = ["OWNER", "ADMIN", "MEMBER"];

export class TeamsSsoEnforcedError extends Error {
  readonly code = "third-party-identity-provider-enabled";

  constructor() {
    super("third-party-identity-provider-enabled");
    this.name = "TeamsSsoEnforcedError";
  }
}

function asRole(role: string): TeamsRole {
  if (role === "OWNER" || role === "ADMIN" || role === "MEMBER") return role;
  throw new TeamsRequestError("BAD_REQUEST", "Unknown team role");
}

function assertPlan(): void {
  if (!ssoPlanEnabled()) {
    throw new TeamsRequestError("BAD_REQUEST", "SSO is not enabled for this plan");
  }
}

async function teamForActor(slug: string, userId: number, procedure: "ssoRead" | "ssoManage") {
  const team = await prisma.teamsTeam.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!team) throw new TeamsRequestError("NOT_FOUND", "Team not found");
  const membership = await prisma.teamsMembership.findUnique({
    where: { teamId_userId: { teamId: team.id, userId } },
    select: { role: true },
  });
  assertTeamsAccess({
    procedure,
    isAuthenticated: true,
    role: membership ? asRole(membership.role) : null,
  });
  return team;
}

function cleanRoleMaps(roleMaps: readonly GroupRoleMapping[]): GroupRoleMapping[] {
  const seen = new Set<string>();
  const cleaned: GroupRoleMapping[] = [];
  for (const mapping of roleMaps) {
    const group = mapping.group.trim();
    if (!group || group.length > 200) continue;
    if (!ROLE_VALUES.includes(mapping.role)) {
      throw new TeamsRequestError("BAD_REQUEST", "Unknown team role");
    }
    if (seen.has(group)) continue;
    seen.add(group);
    cleaned.push({ group, role: mapping.role });
  }
  if (cleaned.length > 50) {
    throw new TeamsRequestError("BAD_REQUEST", "Use at most 50 group mappings");
  }
  return cleaned;
}

async function connectionByScope(scopeKey: string) {
  return prisma.teamsSsoConnection.findUnique({
    where: { scopeKey },
    select: {
      id: true,
      scopeKey: true,
      teamId: true,
      discoveryUrl: true,
      clientId: true,
      clientSecretCiphertext: true,
      scopes: true,
      enforceSso: true,
      groupClaim: true,
      enabled: true,
      roleMaps: { select: { groupName: true, role: true }, orderBy: { id: "asc" } },
    },
  });
}

function viewConnection(
  connection: NonNullable<Awaited<ReturnType<typeof connectionByScope>>>,
  teamId: number
) {
  return {
    providerId: providerIdForScopeKey(connection.scopeKey),
    signInPath: `/api/auth/signin/${providerIdForScopeKey(connection.scopeKey)}`,
    discoveryUrl: connection.discoveryUrl,
    clientId: connection.clientId,
    hasClientSecret: connection.clientSecretCiphertext.length > 0,
    scopes: connection.scopes,
    enforceSso: connection.enforceSso,
    groupClaim: connection.groupClaim,
    enabled: connection.enabled,
    roleMaps: connection.roleMaps.map((mapping) => ({
      group: mapping.groupName,
      role: asRole(mapping.role),
    })),
    teamId,
  };
}

export async function getSsoSettings(input: { userId: number; slug: string }) {
  const team = await teamForActor(input.slug, input.userId, "ssoRead");
  const [teamConnection, instanceConnection, domains] = await Promise.all([
    connectionByScope(scopeKeyFor("team", team.id)),
    connectionByScope("instance"),
    prisma.teamsSsoDomain.findMany({
      where: { teamId: team.id },
      select: {
        id: true,
        domain: true,
        verificationToken: true,
        verifiedAt: true,
        connection: { select: { scopeKey: true } },
      },
      orderBy: { id: "asc" },
    }),
  ]);
  return {
    planEnabled: ssoPlanEnabled(),
    teamId: team.id,
    team: teamConnection ? viewConnection(teamConnection, team.id) : null,
    instance: instanceConnection ? viewConnection(instanceConnection, team.id) : null,
    domains: domains.map((domain) => ({
      id: domain.id,
      domain: domain.domain,
      scope: domain.connection.scopeKey === "instance" ? ("instance" as const) : ("team" as const),
      verified: domain.verifiedAt !== null,
      verifiedAt: domain.verifiedAt,
      verificationHost: verificationHost(domain.domain),
      verificationText: verificationTokenText(domain.verificationToken),
    })),
  };
}

export async function saveSsoConnection(input: {
  userId: number;
  slug: string;
  scope: SsoScope;
  discoveryUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes: string;
  enforceSso: boolean;
  groupClaim: string;
  enabled: boolean;
  roleMaps: readonly GroupRoleMapping[];
}) {
  assertPlan();
  const team = await teamForActor(input.slug, input.userId, "ssoManage");
  const discoveryUrl = input.discoveryUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(discoveryUrl);
  } catch {
    throw new TeamsRequestError("BAD_REQUEST", "Discovery URL must be a valid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new TeamsRequestError("BAD_REQUEST", "Discovery URL must be http or https");
  }
  const clientId = input.clientId.trim();
  if (!clientId) throw new TeamsRequestError("BAD_REQUEST", "Client id is required");
  const scopes = input.scopes.trim() || "openid email profile";
  const roleMaps = cleanRoleMaps(input.roleMaps);
  const scopeKey = scopeKeyFor(input.scope, team.id);
  const existing = await prisma.teamsSsoConnection.findUnique({
    where: { scopeKey },
    select: { id: true, clientSecretCiphertext: true },
  });
  const secret = input.clientSecret?.trim() ?? "";
  if (!secret && !existing) {
    throw new TeamsRequestError("BAD_REQUEST", "Client secret is required");
  }
  const clientSecretCiphertext = secret
    ? encryptClientSecret(secret)
    : (existing?.clientSecretCiphertext ?? "");
  const data = {
    discoveryUrl,
    clientId,
    clientSecretCiphertext,
    scopes,
    enforceSso: input.enforceSso,
    groupClaim: input.groupClaim.trim(),
    enabled: input.enabled,
    teamId: input.scope === "team" ? team.id : null,
  };
  const saved = existing
    ? await prisma.teamsSsoConnection.update({
        where: { id: existing.id },
        data,
        select: { id: true },
      })
    : await prisma.teamsSsoConnection.create({
        data: { scopeKey, ...data },
        select: { id: true },
      });
  await prisma.teamsSsoRoleMap.deleteMany({ where: { connectionId: saved.id } });
  if (roleMaps.length > 0) {
    await prisma.teamsSsoRoleMap.createMany({
      data: roleMaps.map((mapping) => ({
        connectionId: saved.id,
        groupName: mapping.group,
        role: mapping.role,
      })),
    });
  }
  return { scopeKey, providerId: providerIdForScopeKey(scopeKey) };
}

export async function addSsoDomain(input: { userId: number; slug: string; scope: SsoScope; domain: string }) {
  assertPlan();
  const team = await teamForActor(input.slug, input.userId, "ssoManage");
  const domain = assertDomain(input.domain);
  const scopeKey = scopeKeyFor(input.scope, team.id);
  const connection = await prisma.teamsSsoConnection.findUnique({
    where: { scopeKey },
    select: { id: true },
  });
  if (!connection) {
    throw new TeamsRequestError("BAD_REQUEST", "Save the SSO provider before adding a domain");
  }
  const token = randomBytes(16).toString("hex");
  try {
    const created = await prisma.teamsSsoDomain.create({
      data: {
        connectionId: connection.id,
        domain,
        teamId: team.id,
        verificationToken: token,
      },
      select: { id: true, domain: true, verificationToken: true },
    });
    return {
      id: created.id,
      domain: created.domain,
      verificationHost: verificationHost(created.domain),
      verificationText: verificationTokenText(created.verificationToken),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TeamsRequestError("CONFLICT", "That domain is already claimed");
    }
    throw error;
  }
}

export async function verifySsoDomain(
  input: { userId: number; slug: string; domain: string },
  resolver: DnsTxtResolver = nodeDnsTxtResolver()
) {
  assertPlan();
  const team = await teamForActor(input.slug, input.userId, "ssoManage");
  const domain = assertDomain(input.domain);
  const row = await prisma.teamsSsoDomain.findUnique({
    where: { domain },
    select: { id: true, teamId: true, verificationToken: true, verifiedAt: true },
  });
  if (!row || row.teamId !== team.id) {
    throw new TeamsRequestError("NOT_FOUND", "Domain not found");
  }
  const proved = await txtRecordProvesDomain({
    domain,
    token: row.verificationToken,
    resolver,
  });
  if (!proved) {
    throw new TeamsRequestError(
      "BAD_REQUEST",
      `No TXT record ${verificationTokenText(row.verificationToken)} at ${verificationHost(domain)}`
    );
  }
  const verifiedAt = row.verifiedAt ?? new Date();
  await prisma.teamsSsoDomain.update({
    where: { id: row.id },
    data: { verifiedAt },
    select: { id: true },
  });
  return { domain, verifiedAt };
}

export async function removeSsoDomain(input: { userId: number; slug: string; domain: string }) {
  assertPlan();
  const team = await teamForActor(input.slug, input.userId, "ssoManage");
  const domain = assertDomain(input.domain);
  const row = await prisma.teamsSsoDomain.findUnique({
    where: { domain },
    select: { id: true, teamId: true },
  });
  if (!row || row.teamId !== team.id) {
    throw new TeamsRequestError("NOT_FOUND", "Domain not found");
  }
  await prisma.teamsSsoDomain.delete({ where: { id: row.id } });
  return { domain };
}

export async function decryptedClientSecret(scopeKey: string): Promise<string> {
  const row = await prisma.teamsSsoConnection.findUnique({
    where: { scopeKey },
    select: { clientSecretCiphertext: true },
  });
  if (!row) throw new TeamsRequestError("NOT_FOUND", "SSO connection not found");
  return decryptClientSecret(row.clientSecretCiphertext);
}

export async function listEnabledOidcProviders(): Promise<TeamsOidcProviderConfig[]> {
  if (!ssoPlanEnabled()) return [];
  const rows = await prisma.teamsSsoConnection.findMany({
    where: { enabled: true },
    select: {
      scopeKey: true,
      teamId: true,
      discoveryUrl: true,
      clientId: true,
      clientSecretCiphertext: true,
      scopes: true,
    },
    orderBy: { id: "asc" },
  });
  return rows.map((row) =>
    teamsOidcProvider({
      id: providerIdForScopeKey(row.scopeKey),
      name: row.scopeKey === "instance" ? "Instance SSO" : "Team SSO",
      discoveryUrl: row.discoveryUrl,
      clientId: row.clientId,
      clientSecret: decryptClientSecret(row.clientSecretCiphertext),
      scopes: row.scopes,
    })
  );
}

export async function assertTeamsPasswordLoginAllowed(email: string): Promise<void> {
  const domain = emailDomain(email);
  const planEnabled = ssoPlanEnabled();
  if (!planEnabled || !domain) return;
  const rows = await prisma.teamsSsoDomain.findMany({
    where: { domain, verifiedAt: { not: null } },
    select: { connection: { select: { enforceSso: true, enabled: true } } },
  });
  const decision = decidePasswordLogin({
    email,
    planEnabled,
    matches: rows.map((row) => ({
      verified: true,
      enforceSso: row.connection.enabled && row.connection.enforceSso,
    })),
  });
  if (!decision.allowed) throw new TeamsSsoEnforcedError();
}

export async function provisionOidcUser(input: {
  provider: string;
  email: string;
  name: string;
  subject: string;
  profile: Record<string, unknown>;
}): Promise<{ userId: number; teamId: number | null; role: TeamsRole | null }> {
  if (!ssoPlanEnabled()) {
    throw new TeamsRequestError("BAD_REQUEST", "SSO is not enabled for this plan");
  }
  const scopeKey = scopeKeyFromProvider(input.provider);
  if (!scopeKey) throw new TeamsRequestError("BAD_REQUEST", "Unknown SSO provider");
  const email = input.email.trim().toLowerCase();
  const domain = emailDomain(email);
  if (!domain) throw new TeamsRequestError("BAD_REQUEST", "SSO profile has no email domain");
  const connection = await connectionByScope(scopeKey);
  if (!connection || !connection.enabled) {
    throw new TeamsRequestError("BAD_REQUEST", "SSO provider is not enabled");
  }
  const user = await findOrCreateUser({
    email,
    name: input.name.trim() || email,
    subject: input.subject,
  });
  const domainRow = await prisma.teamsSsoDomain.findFirst({
    where: {
      domain,
      verifiedAt: { not: null },
      connectionId: connection.id,
    },
    select: { teamId: true },
  });
  if (!domainRow) return { userId: user.id, teamId: null, role: null };
  const mappings = connection.roleMaps.map((mapping) => ({
    group: mapping.groupName,
    role: asRole(mapping.role),
  }));
  const claimEnabled = connection.groupClaim.trim().length > 0;
  const groups = readGroupClaim(input.profile, connection.groupClaim);
  const role = mapGroupsToRole({ groups, mappings, groupClaimEnabled: claimEnabled });
  const matched = groupMappingMatched({ groups, mappings, groupClaimEnabled: claimEnabled });
  const existing = await prisma.teamsMembership.findUnique({
    where: { teamId_userId: { teamId: domainRow.teamId, userId: user.id } },
    select: { id: true, role: true },
  });
  if (!existing) {
    await prisma.teamsMembership.create({
      data: { teamId: domainRow.teamId, userId: user.id, role },
    });
  } else if (matched && existing.role !== role) {
    await prisma.teamsMembership.update({
      where: { id: existing.id },
      data: { role },
    });
  }
  return {
    userId: user.id,
    teamId: domainRow.teamId,
    role: existing && !matched ? asRole(existing.role) : role,
  };
}

async function findOrCreateUser(input: { email: string; name: string; subject: string }) {
  const existing = await prisma.user.findFirst({
    where: { email: { equals: input.email, mode: "insensitive" } },
    select: { id: true, name: true, identityProviderId: true },
  });
  if (existing) {
    if (!existing.identityProviderId || !existing.name) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...(existing.identityProviderId ? {} : { identityProviderId: input.subject }),
          ...(existing.name ? {} : { name: input.name }),
        },
        select: { id: true },
      });
    }
    return { id: existing.id };
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          username: usernameFor(input.email),
          emailVerified: new Date(),
          identityProviderId: input.subject,
        },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }
  throw new TeamsRequestError("CONFLICT", "Could not provision the SSO user");
}

function usernameFor(email: string): string {
  const local =
    email
      .split("@")[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "user";
  return `${local.slice(0, 24)}-${randomBytes(3).toString("hex")}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
