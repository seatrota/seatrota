// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import process from "node:process";
import { prisma } from "@calcom/prisma";
import { afterAll, beforeAll, expect, test } from "vitest";
import { completeOidcSignIn, verifyOidcIdToken } from "../login";
import { providerIdForScopeKey } from "../provider-id";
import { listTeamsOidcProviders, refreshTeamsOidcProviders } from "../provider-registry";
import {
  addSsoDomain,
  assertTeamsPasswordLoginAllowed,
  decryptedClientSecret,
  saveSsoConnection,
  verifySsoDomain,
} from "../service";
import { importSeatRotaRealm, loginIdToken, waitForKeycloak } from "./keycloak-admin";

const slug = "sso-e2e";
const ownerEmail = "owner-sso-e2e@example.com";
const baseUrl = (process.env.KEYCLOAK_URL || "http://127.0.0.1:8080").replace(/\/$/, "");

let ownerId = 0;
let teamId = 0;

beforeAll(async () => {
  await waitForKeycloak(baseUrl);
  await prisma.teamsTeam.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, "ada@sso.example.com"] } } });
  const owner = await prisma.user.create({
    data: { email: ownerEmail, name: "SSO Owner", username: `owner-sso-${Date.now()}` },
    select: { id: true },
  });
  ownerId = owner.id;
  const team = await prisma.teamsTeam.create({
    data: {
      name: "SSO",
      slug,
      memberships: { create: { userId: owner.id, role: "OWNER" } },
    },
    select: { id: true },
  });
  teamId = team.id;
});

afterAll(async () => {
  await prisma.teamsTeam.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, "ada@sso.example.com"] } } });
  await prisma.$disconnect();
});

test("SSO login creates the user, joins the mapped role, and enforce-SSO refuses password login", async () => {
  const realm = await importSeatRotaRealm(baseUrl);
  const discoveryUrl = `${baseUrl}/realms/${realm.realm}/.well-known/openid-configuration`;
  await saveSsoConnection({
    userId: ownerId,
    slug,
    scope: "team",
    discoveryUrl,
    clientId: realm.clientId,
    clientSecret: realm.clientSecret,
    scopes: "openid email profile",
    enforceSso: false,
    groupClaim: "groups",
    enabled: true,
    roleMaps: [{ group: realm.group, role: "ADMIN" }],
  });
  const added = await addSsoDomain({ userId: ownerId, slug, scope: "team", domain: "sso.example.com" });
  await verifySsoDomain(
    { userId: ownerId, slug, domain: "sso.example.com" },
    {
      async resolveTxt(hostname) {
        expect(hostname).toBe(added.verificationHost);
        return [added.verificationText];
      },
    }
  );

  const storedSecret = await decryptedClientSecret(`team:${teamId}`);
  expect(storedSecret).toBe(realm.clientSecret);

  await refreshTeamsOidcProviders();
  expect(
    listTeamsOidcProviders().some((provider) => provider.id === providerIdForScopeKey(`team:${teamId}`))
  ).toBe(true);

  const idToken = await loginIdToken(realm, storedSecret);
  const profile = await verifyOidcIdToken({ idToken, discoveryUrl, clientId: realm.clientId });
  expect(profile.email).toBe(realm.email);
  const groups = profile.groups;
  expect(Array.isArray(groups) ? groups : []).toContain(realm.group);

  const signedIn = await completeOidcSignIn({
    user: { email: String(profile.email), name: "Ada Lovelace" },
    account: { provider: providerIdForScopeKey(`team:${teamId}`), providerAccountId: String(profile.sub) },
    profile,
  });
  expect(signedIn).toBe(true);

  const user = await prisma.user.findFirst({
    where: { email: realm.email },
    select: { id: true, email: true },
  });
  expect(user?.email).toBe(realm.email);
  const membership = await prisma.teamsMembership.findUnique({
    where: { teamId_userId: { teamId, userId: user?.id ?? 0 } },
    select: { role: true },
  });
  expect(membership?.role).toBe("ADMIN");

  await saveSsoConnection({
    userId: ownerId,
    slug,
    scope: "team",
    discoveryUrl,
    clientId: realm.clientId,
    scopes: "openid email profile",
    enforceSso: true,
    groupClaim: "groups",
    enabled: true,
    roleMaps: [{ group: realm.group, role: "ADMIN" }],
  });
  await expect(assertTeamsPasswordLoginAllowed(realm.email)).rejects.toThrow(
    /third-party-identity-provider-enabled/
  );
  await expect(assertTeamsPasswordLoginAllowed("other@example.com")).resolves.toBeUndefined();
});
