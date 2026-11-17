// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export interface RosterSignOn {
  readonly rosterId: string;
  readonly issuer: string;
  readonly enabled: boolean;
}

export function rosterSignOnLabel(signOn: RosterSignOn): string {
  if (!signOn.enabled) {
    return `${signOn.rosterId}:off`;
  }
  return `${signOn.rosterId}:${signOn.issuer}`;
}

export type { DnsTxtResolver } from "./domain";
export {
  assertDomain,
  emailDomain,
  txtRecordProvesDomain,
  verificationHost,
  verificationTokenText,
} from "./domain";
export { decidePasswordLogin } from "./enforce";
export { createSelfHostSsoPlan, ssoPlanEnabled } from "./plan";
export { mapGroupsToRole, readGroupClaim } from "./roles";
