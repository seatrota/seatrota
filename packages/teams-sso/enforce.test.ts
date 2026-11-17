// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { describe, expect, test } from "vitest";
import { decidePasswordLogin } from "./enforce";
import { createSelfHostSsoPlan } from "./plan";

describe("enforce SSO", () => {
  test("refuses a password login for a verified domain when the plan allows SSO", () => {
    expect(
      decidePasswordLogin({
        email: "ada@sso.example.com",
        planEnabled: true,
        matches: [{ verified: true, enforceSso: true }],
      })
    ).toEqual({ allowed: false, reason: "sso-enforced" });
  });

  test("allows password login when the plan is off, the domain is unverified, or enforce is off", () => {
    expect(
      decidePasswordLogin({
        email: "ada@sso.example.com",
        planEnabled: false,
        matches: [{ verified: true, enforceSso: true }],
      }).allowed
    ).toBe(true);
    expect(
      decidePasswordLogin({
        email: "ada@sso.example.com",
        planEnabled: true,
        matches: [{ verified: false, enforceSso: true }],
      }).allowed
    ).toBe(true);
    expect(
      decidePasswordLogin({
        email: "ada@sso.example.com",
        planEnabled: true,
        matches: [{ verified: true, enforceSso: false }],
      }).allowed
    ).toBe(true);
    expect(
      decidePasswordLogin({
        email: "ada@other.example.com",
        planEnabled: true,
        matches: [],
      }).allowed
    ).toBe(true);
  });

  test("self-host plan defaults to on", () => {
    expect(createSelfHostSsoPlan({}).isEnabled()).toBe(true);
    expect(createSelfHostSsoPlan({ SEATROTA_SSO_ENABLED: "0" }).isEnabled()).toBe(false);
    expect(createSelfHostSsoPlan({ SEATROTA_SSO_ENABLED: "1" }).isEnabled()).toBe(true);
  });
});
