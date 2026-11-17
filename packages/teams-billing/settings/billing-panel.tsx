"use client";
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { trpc } from "@calcom/trpc/react";
import { cardStyle, rowStyle } from "@seatrota/teams-booking/ui";

const STATUS_LABELS: Record<string, string> = {
  none: "No subscription",
  incomplete: "Checkout not finished",
  trialing: "Trial",
  active: "Active",
  past_due: "Payment past due",
  unpaid: "Unpaid",
  canceled: "Canceled",
  incomplete_expired: "Checkout expired",
  paused: "Paused",
};

export default function TeamBillingPanel({ slug, canManage }: { slug: string; canManage: boolean }) {
  const billing = trpc.viewer.teams.billingGet.useQuery({ slug }, { enabled: Boolean(slug), refetchOnWindowFocus: false });
  const checkout = trpc.viewer.teams.billingCheckout.useMutation({
    onSuccess: (result) => {
      window.location.assign(result.url);
    },
  });
  const data = billing.data;
  if (!data || !data.enabled) return null;

  return (
    <section style={cardStyle} data-testid="team-billing">
      <h2>Billing</h2>
      <p style={{ margin: 0, fontSize: 12, color: "#71717a" }}>Stripe test mode. No real card is charged.</p>
      <div style={rowStyle}>
        <span>
          Status: <strong data-testid="team-billing-status">{STATUS_LABELS[data.status] ?? data.status}</strong>
        </span>
        <span>
          Seats billed: <strong data-testid="team-billing-seats">{data.seatsBilled}</strong>
        </span>
        <span>
          Members: <strong data-testid="team-billing-members">{data.members}</strong>
        </span>
        {data.currentPeriodEnd ? (
          <span>
            {data.cancelAtPeriodEnd ? "Ends" : "Renews"} {new Date(data.currentPeriodEnd).toLocaleDateString()}
          </span>
        ) : null}
      </div>
      {canManage && !data.grantsAccess ? (
        <button
          type="button"
          data-testid="team-billing-checkout"
          disabled={checkout.isPending}
          onClick={() => checkout.mutate({ slug })}>
          Subscribe for {data.seatsNeeded} {data.seatsNeeded === 1 ? "seat" : "seats"}
        </button>
      ) : null}
      {checkout.error ? <p>{checkout.error.message}</p> : null}
    </section>
  );
}
