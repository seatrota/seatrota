// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { isTestStripeKey } from "./config";

/** The Stripe calls SeatRota makes, behind an interface so tests never reach the network. */
export interface BillingGateway {
  createSeatCheckout(input: {
    teamId: number;
    teamName: string;
    seats: number;
    priceId: string;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
    trialDays: number;
  }): Promise<{ id: string; url: string }>;
  setSeatQuantity(input: { subscriptionId: string; priceId: string; seats: number }): Promise<{ seats: number }>;
}

/** Flattens nested params into Stripe's form encoding (`a[b][0]=c`). */
export function formEncode(params: Record<string, unknown>, prefix = ""): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) parts.push(...formEncode(item as Record<string, unknown>, `${name}[${index}]`));
        else parts.push(`${encodeURIComponent(`${name}[${index}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === "object") {
      parts.push(...formEncode(value as Record<string, unknown>, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/**
 * Stripe REST adapter (https://docs.stripe.com/api). It refuses anything but a
 * test-mode secret key, so it cannot create a real charge.
 */
export function stripeRestGateway(secretKey: string, fetchImpl: Fetch = fetch as unknown as Fetch): BillingGateway {
  if (!isTestStripeKey(secretKey)) throw new Error("SeatRota billing only talks to Stripe in test mode");
  async function call<T>(method: "GET" | "POST", path: string, params?: Record<string, unknown>): Promise<T> {
    const response = await fetchImpl(`https://api.stripe.com/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params ? formEncode(params).join("&") : undefined,
    });
    const payload = (await response.json()) as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? `Stripe request failed (${response.status})`);
    return payload;
  }

  return {
    async createSeatCheckout(input) {
      const session = await call<{ id: string; url: string }>("POST", "/checkout/sessions", {
        mode: "subscription",
        client_reference_id: String(input.teamId),
        customer_email: input.customerEmail,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        line_items: [{ price: input.priceId, quantity: input.seats }],
        metadata: { seatrotaTeamId: String(input.teamId) },
        subscription_data: {
          metadata: { seatrotaTeamId: String(input.teamId), seatrotaTeamName: input.teamName },
          ...(input.trialDays > 0 ? { trial_period_days: input.trialDays } : {}),
        },
      });
      return { id: session.id, url: session.url };
    },
    async setSeatQuantity(input) {
      const subscription = await call<{ items: { data: { id: string; price: { id: string } }[] } }>(
        "GET",
        `/subscriptions/${encodeURIComponent(input.subscriptionId)}`
      );
      const item = subscription.items.data.find((entry) => entry.price.id === input.priceId);
      if (!item) throw new Error("The subscription has no seat item");
      await call("POST", `/subscription_items/${encodeURIComponent(item.id)}`, {
        quantity: input.seats,
        proration_behavior: "create_prorations",
      });
      return { seats: input.seats };
    },
  };
}
