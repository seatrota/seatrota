// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { describe, expect, test } from "vitest";
import { readHostedConfig, requireBillingConfig } from "./config";
import {
  billableSeats,
  seatBillMinorUnits,
  seatQuantityChange,
  subscriptionGrantsAccess,
  updateFromEvent,
} from "./seats";

const base = {
  DATABASE_URL: "postgresql://localhost/seatrota",
  NEXTAUTH_SECRET: "secret",
  CALENDSO_ENCRYPTION_KEY: "abcdefghijklmnopqrstuvwxyz123456",
  NEXT_PUBLIC_WEBAPP_URL: "http://localhost:3000",
};
const billing = {
  SEATROTA_BILLING_ENABLED: "1",
  STRIPE_SECRET_KEY: "sk_test_abc123",
  SEATROTA_STRIPE_WEBHOOK_SECRET: "whsec_abc",
  SEATROTA_STRIPE_SEAT_PRICE_ID: "price_seat",
};

describe("hosted configuration", () => {
  test("a self-hosted instance needs no billing variables", () => {
    const config = readHostedConfig(base);
    expect(config.problems).toEqual([]);
    expect(config.hosted).toBe(false);
    expect(config.billing).toEqual({ enabled: false });
  });

  test("missing core variables and a short encryption key are reported together", () => {
    const config = readHostedConfig({ CALENDSO_ENCRYPTION_KEY: "short" });
    expect(config.problems).toEqual([
      "DATABASE_URL is not set",
      "NEXTAUTH_SECRET is not set",
      "NEXT_PUBLIC_WEBAPP_URL is not set",
      "CALENDSO_ENCRYPTION_KEY must be exactly 32 bytes (AES-256)",
    ]);
  });

  test("a hosted instance needs https outside localhost and a cron key", () => {
    const config = readHostedConfig({ ...base, SEATROTA_HOSTED: "1", NEXT_PUBLIC_WEBAPP_URL: "http://seatrota.example" });
    expect(config.problems).toContain("A hosted instance must serve NEXT_PUBLIC_WEBAPP_URL over https");
    expect(config.problems).toContain("CRON_API_KEY is not set (reminders cannot be sent)");
    expect(readHostedConfig({ ...base, SEATROTA_HOSTED: "1", CRON_API_KEY: "k" }).problems).toEqual([]);
  });

  test("billing turns on with a test key, a webhook secret and a seat price", () => {
    const config = readHostedConfig({ ...base, ...billing, SEATROTA_BILLING_TRIAL_DAYS: "14" });
    expect(config.problems).toEqual([]);
    expect(config.billing).toEqual({
      enabled: true,
      secretKey: "sk_test_abc123",
      webhookSecret: "whsec_abc",
      seatPriceId: "price_seat",
      trialDays: 14,
    });
  });

  test("a live Stripe key is refused and billing stays off", () => {
    for (const key of ["sk_live_abc", "rk_live_abc"]) {
      const config = readHostedConfig({ ...base, ...billing, STRIPE_SECRET_KEY: key });
      expect(config.billing).toEqual({ enabled: false });
      expect(config.problems).toContain(
        "STRIPE_SECRET_KEY is a live key; SeatRota billing runs in Stripe test mode only"
      );
    }
    expect(() => requireBillingConfig({ ...base, ...billing, STRIPE_SECRET_KEY: "sk_live_abc" })).toThrow(/live key/);
  });

  test("malformed billing values are each reported", () => {
    const config = readHostedConfig({
      ...base,
      SEATROTA_BILLING_ENABLED: "1",
      STRIPE_SECRET_KEY: "pk_test_abc",
      SEATROTA_STRIPE_WEBHOOK_SECRET: "nope",
      SEATROTA_STRIPE_SEAT_PRICE_ID: "prod_x",
      SEATROTA_BILLING_TRIAL_DAYS: "120",
    });
    expect(config.billing).toEqual({ enabled: false });
    expect(config.problems).toEqual([
      "STRIPE_SECRET_KEY must be a Stripe test key (sk_test_...)",
      "SEATROTA_STRIPE_WEBHOOK_SECRET must start with whsec_",
      "SEATROTA_STRIPE_SEAT_PRICE_ID must be a Stripe price id (price_...)",
      "SEATROTA_BILLING_TRIAL_DAYS must be a whole number from 0 to 90",
    ]);
  });

  test("requireBillingConfig explains why billing is off", () => {
    expect(() => requireBillingConfig(base)).toThrow("Billing is not enabled (set SEATROTA_BILLING_ENABLED=1)");
  });
});

describe("per-seat quantities", () => {
  test("a seat is a member, with a floor of one", () => {
    expect(billableSeats(0)).toBe(1);
    expect(billableSeats(5)).toBe(5);
    expect(seatQuantityChange({ billedSeats: 3, memberCount: 4 })).toBe(4);
    expect(seatQuantityChange({ billedSeats: 4, memberCount: 4 })).toBeNull();
    expect(seatQuantityChange({ billedSeats: 1, memberCount: 0 })).toBeNull();
    expect(seatBillMinorUnits({ seats: 4, minorUnitsPerSeat: 600 })).toBe(2400);
  });

  test("active, trialing and past-due subscriptions grant access", () => {
    expect(subscriptionGrantsAccess("active")).toBe(true);
    expect(subscriptionGrantsAccess("trialing")).toBe(true);
    expect(subscriptionGrantsAccess("past_due")).toBe(true);
    expect(subscriptionGrantsAccess("canceled")).toBe(false);
    expect(subscriptionGrantsAccess("none")).toBe(false);
  });
});

describe("Stripe events", () => {
  test("a completed subscription checkout links the team to the subscription", () => {
    expect(
      updateFromEvent(
        {
          type: "checkout.session.completed",
          data: { object: { mode: "subscription", client_reference_id: "7", customer: "cus_1", subscription: "sub_1" } },
        },
        "price_seat"
      )
    ).toEqual({ teamId: 7, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" });
  });

  test("a one-time checkout or one without a team is ignored", () => {
    expect(
      updateFromEvent({ type: "checkout.session.completed", data: { object: { mode: "payment" } } }, "price_seat")
    ).toBeNull();
    expect(
      updateFromEvent(
        { type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1" } } },
        "price_seat"
      )
    ).toBeNull();
  });

  test("a subscription update records status, seat quantity and period end", () => {
    expect(
      updateFromEvent(
        {
          type: "customer.subscription.updated",
          data: {
            object: {
              id: "sub_1",
              customer: "cus_1",
              status: "active",
              current_period_end: 1_800_000_000,
              metadata: { seatrotaTeamId: "7" },
              items: { data: [{ quantity: 1, price: { id: "price_other" } }, { quantity: 4, price: { id: "price_seat" } }] },
            },
          },
        },
        "price_seat"
      )
    ).toEqual({
      teamId: 7,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "active",
      seats: 4,
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
      cancelAtPeriodEnd: false,
    });
  });

  test("a deleted subscription is canceled, and unknown events are ignored", () => {
    const update = updateFromEvent(
      { type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1", status: "active" } } },
      "price_seat"
    );
    expect(update?.status).toBe("canceled");
    expect(update?.teamId).toBeNull();
    expect(updateFromEvent({ type: "invoice.paid", data: { object: {} } }, "price_seat")).toBeNull();
  });
});
