// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { emailDomain } from "./domain";

export interface EnforcedDomain {
  readonly verified: boolean;
  readonly enforceSso: boolean;
}

export type PasswordLoginDecision = { allowed: true } | { allowed: false; reason: "sso-enforced" };

/**
 * Password login is refused only when the plan allows SSO, the address is on a
 * verified domain, and that domain's connection has enforce-SSO turned on.
 */
export function decidePasswordLogin(input: {
  email: string;
  planEnabled: boolean;
  matches: readonly EnforcedDomain[];
}): PasswordLoginDecision {
  if (!input.planEnabled) return { allowed: true };
  if (!emailDomain(input.email)) return { allowed: true };
  const blocked = input.matches.some((match) => match.verified && match.enforceSso);
  if (!blocked) return { allowed: true };
  return { allowed: false, reason: "sso-enforced" };
}
