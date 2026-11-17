// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export interface OidcProfile {
  sub?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  picture?: string;
}

export interface TeamsOidcProviderConfig {
  id: string;
  name: string;
  type: "oauth";
  wellKnown: string;
  clientId: string;
  clientSecret: string;
  authorization: { params: { scope: string } };
  idToken: true;
  checks: ["pkce", "state"];
  allowDangerousEmailAccountLinking: true;
  profile: (profile: OidcProfile) => {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

export function discoveryWellKnown(discoveryUrl: string): string {
  const trimmed = discoveryUrl.trim();
  if (trimmed.includes(".well-known/openid-configuration")) return trimmed;
  return `${trimmed.replace(/\/$/, "")}/.well-known/openid-configuration`;
}

/**
 * Generic OpenID Connect client for next-auth's OAuth provider.
 * `wellKnown` is the discovery document next-auth fetches (ISC/MIT next-auth 4).
 */
export function teamsOidcProvider(input: {
  id: string;
  name: string;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
}): TeamsOidcProviderConfig {
  return {
    id: input.id,
    name: input.name,
    type: "oauth",
    wellKnown: discoveryWellKnown(input.discoveryUrl),
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    authorization: { params: { scope: input.scopes } },
    idToken: true,
    checks: ["pkce", "state"],
    allowDangerousEmailAccountLinking: true,
    profile(profile) {
      const email = typeof profile.email === "string" ? profile.email : "";
      const name =
        (typeof profile.name === "string" && profile.name) ||
        (typeof profile.preferred_username === "string" && profile.preferred_username) ||
        email;
      return {
        id: String(profile.sub ?? email),
        name,
        email,
        image: typeof profile.picture === "string" ? profile.picture : null,
      };
    },
  };
}
