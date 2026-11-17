// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { describe, expect, test } from "vitest";
import { formEncode, stripeRestGateway } from "./stripe-gateway";
import { signatureHeader, verifyWebhookSignature, WebhookSignatureError } from "./webhook-signature";

describe("webhook signatures", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });
  const now = 1_800_000_000;

  test("a correctly signed payload inside the tolerance is accepted", () => {
    expect(() =>
      verifyWebhookSignature({ payload, header: signatureHeader(payload, secret, now - 10), secret, nowSeconds: now })
    ).not.toThrow();
  });

  test("any one matching v1 signature is enough", () => {
    const good = signatureHeader(payload, secret, now).split(",")[1];
    expect(() =>
      verifyWebhookSignature({ payload, header: `t=${now},v1=${"0".repeat(64)},${good}`, secret, nowSeconds: now })
    ).not.toThrow();
  });

  test("a changed body, wrong secret, old timestamp or missing header is refused", () => {
    const header = signatureHeader(payload, secret, now);
    expect(() => verifyWebhookSignature({ payload: `${payload} `, header, secret, nowSeconds: now })).toThrow(
      WebhookSignatureError
    );
    expect(() => verifyWebhookSignature({ payload, header, secret: "whsec_other", nowSeconds: now })).toThrow(
      "No signature matches the payload"
    );
    expect(() => verifyWebhookSignature({ payload, header, secret, nowSeconds: now + 301 })).toThrow(
      "Signature timestamp is outside the tolerance"
    );
    expect(() => verifyWebhookSignature({ payload, header: null, secret })).toThrow("Missing Stripe-Signature header");
    expect(() => verifyWebhookSignature({ payload, header: "v1=abc", secret })).toThrow("Signature header has no timestamp");
  });
});

describe("Stripe REST gateway", () => {
  test("form encoding nests objects and arrays the way Stripe expects", () => {
    expect(
      decodeURIComponent(
        formEncode({ mode: "subscription", line_items: [{ price: "price_1", quantity: 3 }], metadata: { a: "1" } }).join("&")
      )
    ).toBe("mode=subscription&line_items[0][price]=price_1&line_items[0][quantity]=3&metadata[a]=1");
  });

  test("a live key is refused before any request", () => {
    expect(() => stripeRestGateway("sk_live_abc", async () => ({ ok: true, status: 200, json: async () => ({}) }))).toThrow(
      "SeatRota billing only talks to Stripe in test mode"
    );
  });

  test("checkout asks for one line of seats with the team on the subscription", async () => {
    const calls: { url: string; body?: string; auth?: string }[] = [];
    const gateway = stripeRestGateway("sk_test_abc", async (url, init) => {
      calls.push({ url, body: init.body, auth: init.headers.authorization });
      return { ok: true, status: 200, json: async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }) };
    });
    const session = await gateway.createSeatCheckout({
      teamId: 7,
      teamName: "Desk",
      seats: 4,
      priceId: "price_seat",
      customerEmail: "owner@example.com",
      successUrl: "http://localhost:3000/settings/teams/desk?billing=done",
      cancelUrl: "http://localhost:3000/settings/teams/desk",
      trialDays: 14,
    });
    expect(session.id).toBe("cs_test_1");
    expect(calls[0]?.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(calls[0]?.auth).toBe("Bearer sk_test_abc");
    const body = decodeURIComponent(calls[0]?.body ?? "");
    expect(body).toContain("mode=subscription");
    expect(body).toContain("client_reference_id=7");
    expect(body).toContain("line_items[0][price]=price_seat&line_items[0][quantity]=4");
    expect(body).toContain("subscription_data[metadata][seatrotaTeamId]=7");
    expect(body).toContain("subscription_data[trial_period_days]=14");
  });

  test("changing seats updates the seat item's quantity with proration", async () => {
    const calls: { method: string; url: string; body?: string }[] = [];
    const gateway = stripeRestGateway("sk_test_abc", async (url, init) => {
      calls.push({ method: init.method, url, body: init.body });
      if (init.method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: { data: [{ id: "si_other", price: { id: "price_x" } }, { id: "si_seat", price: { id: "price_seat" } }] } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ id: "si_seat", quantity: 5 }) };
    });
    await gateway.setSeatQuantity({ subscriptionId: "sub_1", priceId: "price_seat", seats: 5 });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://api.stripe.com/v1/subscriptions/sub_1",
      "POST https://api.stripe.com/v1/subscription_items/si_seat",
    ]);
    expect(calls[1]?.body).toBe("quantity=5&proration_behavior=create_prorations");
  });

  test("a Stripe error message is passed on", async () => {
    const gateway = stripeRestGateway("sk_test_abc", async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "No such price: 'price_seat'" } }),
    }));
    await expect(
      gateway.createSeatCheckout({
        teamId: 1,
        teamName: "x",
        seats: 1,
        priceId: "price_seat",
        customerEmail: "a@example.com",
        successUrl: "http://localhost:3000",
        cancelUrl: "http://localhost:3000",
        trialDays: 0,
      })
    ).rejects.toThrow("No such price: 'price_seat'");
  });
});
