// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a `Stripe-Signature` header as described in Stripe's public webhook
 * docs: the header carries `t=<unix seconds>` and one or more `v1=<hex>` values,
 * where each v1 is HMAC-SHA256 of `${t}.${rawBody}` keyed by the endpoint secret.
 */
export const DEFAULT_TOLERANCE_SECONDS = 300;

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

export function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } {
  let timestamp = Number.NaN;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((piece) => piece.trim());
    if (key === "t" && value) timestamp = Number.parseInt(value, 10);
    if (key === "v1" && value) signatures.push(value);
  }
  return { timestamp, signatures };
}

export function signPayload(payload: string, secret: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

/** Builds a header for tests and local tooling. */
export function signatureHeader(payload: string, secret: string, timestamp: number): string {
  return `t=${timestamp},v1=${signPayload(payload, secret, timestamp)}`;
}

function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length || !/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function verifyWebhookSignature(input: {
  payload: string;
  header: string | null | undefined;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): void {
  if (!input.header) throw new WebhookSignatureError("Missing Stripe-Signature header");
  const { timestamp, signatures } = parseSignatureHeader(input.header);
  if (!Number.isFinite(timestamp)) throw new WebhookSignatureError("Signature header has no timestamp");
  if (signatures.length === 0) throw new WebhookSignatureError("Signature header has no v1 signature");
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) throw new WebhookSignatureError("Signature timestamp is outside the tolerance");
  const expected = signPayload(input.payload, input.secret, timestamp);
  if (!signatures.some((signature) => sameHex(signature, expected))) {
    throw new WebhookSignatureError("No signature matches the payload");
  }
}
