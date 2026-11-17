// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { createPublicKey, type JsonWebKey, verify } from "node:crypto";
import { discoveryWellKnown } from "./oidc-provider";
import { ssoPlanEnabled } from "./plan";
import { provisionOidcUser } from "./service";

export interface OidcSignInParams {
  user?: { email?: string | null; name?: string | null } | null;
  account?: { provider?: string; providerAccountId?: string } | null;
  profile?: Record<string, unknown> | null;
}

interface DiscoveryDocument {
  issuer: string;
  jwks_uri: string;
}

interface JsonWebTokenHeader {
  alg?: string;
  kid?: string;
}

export async function completeOidcSignIn(params: OidcSignInParams): Promise<boolean> {
  if (!ssoPlanEnabled()) return false;
  const provider = params.account?.provider;
  if (!provider) return false;
  const email = params.user?.email || readString(params.profile, "email");
  if (!email) return false;
  const name =
    params.user?.name ||
    readString(params.profile, "name") ||
    readString(params.profile, "preferred_username") ||
    email;
  const subject = params.account?.providerAccountId || readString(params.profile, "sub") || email;
  await provisionOidcUser({
    provider,
    email,
    name,
    subject,
    profile: params.profile ?? {},
  });
  return true;
}

/**
 * Session lookup treats `sub` as the numeric user id. The IdP subject is not that id,
 * so the JWT written for an OIDC login has to carry the provisioned user instead.
 */
export async function teamsOidcJwt(params: {
  token: Record<string, unknown>;
  user?: { email?: string | null } | null;
}): Promise<Record<string, unknown>> {
  const { prisma } = await import("@calcom/prisma");
  const email = (params.user?.email || (typeof params.token.email === "string" ? params.token.email : ""))
    .trim()
    .toLowerCase();
  if (!email) return params.token;
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, username: true, email: true, role: true, locale: true },
  });
  if (!user) return params.token;
  return {
    ...params.token,
    sub: String(user.id),
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    locale: user.locale,
  };
}

export async function verifyOidcIdToken(input: {
  idToken: string;
  discoveryUrl: string;
  clientId: string;
}): Promise<Record<string, unknown>> {
  const discovery = await fetchJson<DiscoveryDocument>(discoveryWellKnown(input.discoveryUrl));
  const jwks = await fetchJson<{ keys: JsonWebKey[] }>(discovery.jwks_uri);
  const [headerPart, payloadPart, signaturePart] = input.idToken.split(".");
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new Error("ID token is not a JWT");
  }
  const header = decodeJson<JsonWebTokenHeader>(headerPart);
  const payload = decodeJson<Record<string, unknown>>(payloadPart);
  const jwk = jwks.keys.find((key) => key.kid === header.kid) ?? jwks.keys[0];
  if (!jwk) throw new Error("Discovery document has no signing keys");
  const algorithm =
    header.alg === "RS384" ? "RSA-SHA384" : header.alg === "RS512" ? "RSA-SHA512" : "RSA-SHA256";
  if (header.alg && header.alg !== "RS256" && header.alg !== "RS384" && header.alg !== "RS512") {
    throw new Error("ID token algorithm is not supported");
  }
  const valid = verify(
    algorithm,
    Buffer.from(`${headerPart}.${payloadPart}`),
    createPublicKey({ key: jwk, format: "jwk" }),
    Buffer.from(signaturePart, "base64url")
  );
  if (!valid) throw new Error("ID token signature is invalid");
  if (payload.iss !== discovery.issuer) throw new Error("ID token issuer does not match discovery");
  const audience = payload.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!audiences.includes(input.clientId)) throw new Error("ID token audience does not match the client");
  if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) {
    throw new Error("ID token has expired");
  }
  return payload;
}

function readString(profile: Record<string, unknown> | null | undefined, key: string): string {
  const value = profile?.[key];
  return typeof value === "string" ? value : "";
}

function decodeJson<T>(part: string): T {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`OIDC request failed (${response.status}) for ${url}`);
  return (await response.json()) as T;
}
