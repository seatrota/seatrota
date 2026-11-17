// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

/**
 * Plan gate for SSO. Self-host builds keep it on unless SEATROTA_SSO_ENABLED=0.
 * A hosted billing adapter can replace the flag without changing the SSO flow.
 */
import process from "node:process";
export interface SsoPlanFlag {
  isEnabled(): boolean;
}

export function createSelfHostSsoPlan(env: NodeJS.ProcessEnv = process.env): SsoPlanFlag {
  return {
    isEnabled() {
      return env.SEATROTA_SSO_ENABLED !== "0";
    },
  };
}

let currentPlan: SsoPlanFlag = createSelfHostSsoPlan();

export function ssoPlanEnabled(): boolean {
  return currentPlan.isEnabled();
}

export function setSsoPlanFlag(plan: SsoPlanFlag): void {
  currentPlan = plan;
}
