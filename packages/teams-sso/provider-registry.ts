// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import type { TeamsOidcProviderConfig } from "./oidc-provider";
import { isTeamsOidcProvider } from "./provider-id";

type SignInParams = {
  user?: { email?: string | null; name?: string | null } | null;
  account?: { provider?: string; providerAccountId?: string; type?: string } | null;
  profile?: unknown;
};

type JwtParams = {
  token: Record<string, unknown>;
  user?: { email?: string | null } | null;
  account?: { provider?: string; type?: string } | null;
};

type CallbackBag = {
  signIn?: (params: SignInParams) => unknown;
  jwt?: (params: JwtParams) => unknown;
};

let cachedProviders: TeamsOidcProviderConfig[] = [];

export function listTeamsOidcProviders(): TeamsOidcProviderConfig[] {
  return cachedProviders;
}

export async function refreshTeamsOidcProviders(): Promise<void> {
  const { listEnabledOidcProviders } = await import("./service");
  cachedProviders = await listEnabledOidcProviders();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Single registration point for the upstream NextAuth options object.
 * Providers come from the last refresh. Sign-in and JWT stay in this package
 * so the upstream file does not grow an IdP switch. The constraint stays loose
 * so the existing callback parameters keep their own types.
 */
export function registerTeamsOidcProviders<T extends { providers?: unknown[]; callbacks?: object }>(
  options: T
): T {
  const callbacks = options.callbacks as CallbackBag | undefined;
  const previousSignIn = callbacks?.signIn;
  const previousJwt = callbacks?.jwt;
  return {
    ...options,
    providers: [...(options.providers ?? []), ...cachedProviders],
    callbacks: {
      ...callbacks,
      signIn: async (params: SignInParams) => {
        if (isTeamsOidcProvider(params.account?.provider)) {
          const { completeOidcSignIn } = await import("./login");
          return completeOidcSignIn({
            user: params.user,
            account: params.account,
            profile: isRecord(params.profile) ? params.profile : {},
          });
        }
        if (!previousSignIn) return true;
        return previousSignIn(params);
      },
      jwt: async (params: JwtParams) => {
        if (params.account && isTeamsOidcProvider(params.account.provider)) {
          const { teamsOidcJwt } = await import("./login");
          return teamsOidcJwt(params);
        }
        if (!previousJwt) return params.token;
        return previousJwt(params);
      },
    },
  } as T;
}
