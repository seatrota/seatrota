// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { describe, expect, test } from "vitest";
import {
  assertDomain,
  type DnsTxtResolver,
  emailDomain,
  txtRecordProvesDomain,
  verificationHost,
  verificationTokenText,
} from "./domain";

function resolver(records: Record<string, readonly string[] | Error>): DnsTxtResolver {
  return {
    async resolveTxt(hostname: string) {
      const found = records[hostname];
      if (!found) throw new Error("ENOTFOUND");
      if (found instanceof Error) throw found;
      return found;
    },
  };
}

describe("domain verification", () => {
  test("builds the TXT host and token text", () => {
    expect(verificationHost("SSO.Example.com.")).toBe("_seatrota.sso.example.com");
    expect(verificationTokenText("abc")).toBe("seatrota-verify=abc");
    expect(emailDomain("Ada@SSO.Example.com")).toBe("sso.example.com");
    expect(assertDomain("sso.example.com")).toBe("sso.example.com");
    expect(() => assertDomain("not a domain")).toThrow(/domain name/);
  });

  test("accepts a matching TXT record from the resolver", async () => {
    const proved = await txtRecordProvesDomain({
      domain: "sso.example.com",
      token: "abc",
      resolver: resolver({
        "_seatrota.sso.example.com": ["seatrota-verify=abc"],
      }),
    });
    expect(proved).toBe(true);
  });

  test("rejects a missing record, a wrong token, and a resolver failure", async () => {
    const wrong = await txtRecordProvesDomain({
      domain: "sso.example.com",
      token: "abc",
      resolver: resolver({ "_seatrota.sso.example.com": ["seatrota-verify=nope"] }),
    });
    const missing = await txtRecordProvesDomain({
      domain: "sso.example.com",
      token: "abc",
      resolver: resolver({}),
    });
    const failed = await txtRecordProvesDomain({
      domain: "sso.example.com",
      token: "abc",
      resolver: resolver({ "_seatrota.sso.example.com": new Error("SERVFAIL") }),
    });
    expect(wrong).toBe(false);
    expect(missing).toBe(false);
    expect(failed).toBe(false);
  });
});
