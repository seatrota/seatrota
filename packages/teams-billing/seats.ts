// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

/** Subscription states SeatRota stores, taken from Stripe's subscription status. */
export type SubscriptionStatus =
  | "none"
  | "incomplete"
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete_expired"
  | "paused";

const KNOWN: readonly SubscriptionStatus[] = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete_expired",
  "paused",
];

export function asSubscriptionStatus(value: string | null | undefined): SubscriptionStatus {
  return KNOWN.includes(value as SubscriptionStatus) ? (value as SubscriptionStatus) : "none";
}

/** Whether a team's paid features should be on. Past-due keeps access while Stripe retries the card. */
export function subscriptionGrantsAccess(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

/** A seat is one member of the team. A team is always billed for at least one seat. */
export function billableSeats(memberCount: number): number {
  if (!Number.isFinite(memberCount) || memberCount < 1) return 1;
  return Math.floor(memberCount);
}

export function seatQuantityChange(input: { billedSeats: number; memberCount: number }): number | null {
  const wanted = billableSeats(input.memberCount);
  return wanted === input.billedSeats ? null : wanted;
}

/** Per-seat amount in the price's minor unit (cents), for display. */
export function seatBillMinorUnits(input: { seats: number; minorUnitsPerSeat: number }): number {
  if (input.seats < 0 || input.minorUnitsPerSeat < 0) return 0;
  return input.seats * input.minorUnitsPerSeat;
}

/** The parts of Stripe's public API objects the billing state needs. */
export interface CheckoutSessionObject {
  mode?: string;
  client_reference_id?: string | null;
  customer?: string | null;
  subscription?: string | null;
  metadata?: Record<string, string> | null;
}

export interface SubscriptionObject {
  id: string;
  customer: string;
  status: string;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string> | null;
  items?: { data?: { quantity?: number | null; price?: { id?: string } | null }[] };
}

export type BillingEvent =
  | { type: "checkout.session.completed"; data: { object: CheckoutSessionObject } }
  | {
      type: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted";
      data: { object: SubscriptionObject };
    };

export interface SubscriptionUpdate {
  teamId: number | null;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status?: SubscriptionStatus;
  seats?: number;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}

function teamIdFrom(value: string | null | undefined): number | null {
  if (!value || !/^[0-9]+$/.test(value)) return null;
  const id = Number.parseInt(value, 10);
  return id > 0 ? id : null;
}

/**
 * Turns one Stripe event into the row update SeatRota stores, or null for an
 * event SeatRota ignores. Pure, so the webhook route stays a thin adapter.
 */
export function updateFromEvent(event: { type: string; data: { object: unknown } }, seatPriceId: string): SubscriptionUpdate | null {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as CheckoutSessionObject;
    if (session.mode !== "subscription") return null;
    const teamId = teamIdFrom(session.client_reference_id) ?? teamIdFrom(session.metadata?.seatrotaTeamId);
    if (!teamId || !session.subscription) return null;
    return {
      teamId,
      stripeCustomerId: session.customer ?? undefined,
      stripeSubscriptionId: session.subscription,
    };
  }
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as SubscriptionObject;
    const seatItem = subscription.items?.data?.find((item) => item.price?.id === seatPriceId);
    return {
      teamId: teamIdFrom(subscription.metadata?.seatrotaTeamId),
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      status: event.type === "customer.subscription.deleted" ? "canceled" : asSubscriptionStatus(subscription.status),
      seats: seatItem?.quantity ?? undefined,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    };
  }
  return null;
}
