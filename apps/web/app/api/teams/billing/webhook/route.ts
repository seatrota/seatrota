import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { handleStripeWebhook } from "@seatrota/teams-billing/service";

// SeatRota per-seat billing: Stripe (test mode) posts subscription events here.
export async function POST(request: NextRequest) {
  const payload = await request.text();
  try {
    const result = await handleStripeWebhook({
      payload,
      signature: request.headers.get("stripe-signature"),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";
