// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import process from "node:process";
import { prisma } from "@calcom/prisma";
import { assertTeamsAccess, TeamsRequestError, type TeamsRole } from "@seatrota/teams-core";
import { readHostedConfig, requireBillingConfig } from "./config";
import { asSubscriptionStatus, billableSeats, seatQuantityChange, subscriptionGrantsAccess, updateFromEvent } from "./seats";
import { type BillingGateway, stripeRestGateway } from "./stripe-gateway";
import { verifyWebhookSignature } from "./webhook-signature";

function asRole(role: string): TeamsRole {
  if (role === "OWNER" || role === "ADMIN" || role === "MEMBER") return role;
  throw new TeamsRequestError("BAD_REQUEST", "Unknown team role");
}

let gatewayOverride: BillingGateway | null = null;

/** Tests replace the Stripe adapter; production builds one from the environment. */
export function setBillingGateway(gateway: BillingGateway | null): void {
  gatewayOverride = gateway;
}

function gateway(secretKey: string): BillingGateway {
  return gatewayOverride ?? stripeRestGateway(secretKey);
}

async function teamForActor(slug: string, userId: number, procedure: "billingRead" | "billingManage") {
  const team = await prisma.teamsTeam.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (!team) throw new TeamsRequestError("NOT_FOUND", "Team not found");
  const membership = await prisma.teamsMembership.findUnique({
    where: { teamId_userId: { teamId: team.id, userId } },
    select: { role: true },
  });
  assertTeamsAccess({ procedure, isAuthenticated: true, role: membership ? asRole(membership.role) : null });
  return team;
}

export async function getBilling(input: { userId: number; slug: string }) {
  const team = await teamForActor(input.slug, input.userId, "billingRead");
  const config = readHostedConfig(process.env);
  const [members, subscription] = await Promise.all([
    prisma.teamsMembership.count({ where: { teamId: team.id } }),
    prisma.teamsSubscription.findUnique({ where: { teamId: team.id } }),
  ]);
  const status = asSubscriptionStatus(subscription?.status);
  return {
    enabled: config.billing.enabled,
    testMode: true,
    members,
    seatsNeeded: billableSeats(members),
    seatsBilled: subscription?.seats ?? 0,
    status,
    grantsAccess: subscriptionGrantsAccess(status),
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
  };
}

export async function startSeatCheckout(input: { userId: number; email: string; slug: string }) {
  const team = await teamForActor(input.slug, input.userId, "billingManage");
  let billing: ReturnType<typeof requireBillingConfig>;
  try {
    billing = requireBillingConfig(process.env);
  } catch (error) {
    throw new TeamsRequestError("BAD_REQUEST", error instanceof Error ? error.message : "Billing is not enabled");
  }
  const existing = await prisma.teamsSubscription.findUnique({ where: { teamId: team.id } });
  if (existing && subscriptionGrantsAccess(asSubscriptionStatus(existing.status))) {
    throw new TeamsRequestError("CONFLICT", "This team already has a subscription");
  }
  const seats = billableSeats(await prisma.teamsMembership.count({ where: { teamId: team.id } }));
  const base = (process.env.NEXT_PUBLIC_WEBAPP_URL || "http://localhost:3000").replace(/\/$/, "");
  const back = `${base}/settings/teams/${encodeURIComponent(team.slug)}`;
  const session = await gateway(billing.secretKey).createSeatCheckout({
    teamId: team.id,
    teamName: team.name,
    seats,
    priceId: billing.seatPriceId,
    customerEmail: input.email,
    successUrl: `${back}?billing=done`,
    cancelUrl: `${back}?billing=cancelled`,
    trialDays: billing.trialDays,
  });
  return { url: session.url, seats };
}

/**
 * Brings the Stripe seat quantity in line with the member count. Called after
 * a member joins or leaves; a failure is logged and never blocks the change.
 */
export async function syncTeamSeats(teamId: number): Promise<{ seats: number } | null> {
  const config = readHostedConfig(process.env);
  if (!config.billing.enabled) return null;
  const subscription = await prisma.teamsSubscription.findUnique({ where: { teamId } });
  if (!subscription?.stripeSubscriptionId) return null;
  if (!subscriptionGrantsAccess(asSubscriptionStatus(subscription.status))) return null;
  const members = await prisma.teamsMembership.count({ where: { teamId } });
  const seats = seatQuantityChange({ billedSeats: subscription.seats, memberCount: members });
  if (seats === null) return { seats: subscription.seats };
  await gateway(config.billing.secretKey).setSeatQuantity({
    subscriptionId: subscription.stripeSubscriptionId,
    priceId: config.billing.seatPriceId,
    seats,
  });
  await prisma.teamsSubscription.update({ where: { teamId }, data: { seats } });
  return { seats };
}

export async function syncTeamSeatsQuietly(teamId: number): Promise<void> {
  try {
    await syncTeamSeats(teamId);
  } catch (error) {
    console.error("teams billing: seat sync failed", error);
  }
}

/** Verifies and applies one Stripe webhook. Returns what happened, for the route's response. */
export async function handleStripeWebhook(input: { payload: string; signature: string | null }) {
  const billing = requireBillingConfig(process.env);
  verifyWebhookSignature({ payload: input.payload, header: input.signature, secret: billing.webhookSecret });
  const event = JSON.parse(input.payload) as { id?: string; type: string; data: { object: unknown } };
  const update = updateFromEvent(event, billing.seatPriceId);
  if (!update) return { handled: false, type: event.type };

  let teamId = update.teamId;
  if (!teamId && update.stripeSubscriptionId) {
    const known = await prisma.teamsSubscription.findUnique({
      where: { stripeSubscriptionId: update.stripeSubscriptionId },
      select: { teamId: true },
    });
    teamId = known?.teamId ?? null;
  }
  if (!teamId) return { handled: false, type: event.type, reason: "No team for this event" };
  const team = await prisma.teamsTeam.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) return { handled: false, type: event.type, reason: "Team not found" };

  const data = {
    ...(update.stripeCustomerId ? { stripeCustomerId: update.stripeCustomerId } : {}),
    ...(update.stripeSubscriptionId ? { stripeSubscriptionId: update.stripeSubscriptionId } : {}),
    ...(update.status ? { status: update.status } : {}),
    ...(update.seats !== undefined ? { seats: update.seats } : {}),
    ...(update.currentPeriodEnd !== undefined ? { currentPeriodEnd: update.currentPeriodEnd } : {}),
    ...(update.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: update.cancelAtPeriodEnd } : {}),
    lastEventId: event.id ?? null,
  };
  await prisma.teamsSubscription.upsert({
    where: { teamId },
    create: { teamId, status: update.status ?? "incomplete", seats: update.seats ?? 0, ...data },
    update: data,
  });
  return { handled: true, type: event.type, teamId };
}
