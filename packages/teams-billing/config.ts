// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

/**
 * Environment configuration for a hosted SeatRota instance. Self-hosting needs
 * none of the billing variables. Billing runs only against Stripe TEST mode:
 * a live key is refused, so a misconfigured instance cannot charge anyone.
 */
export interface BillingConfig {
  enabled: true;
  secretKey: string;
  webhookSecret: string;
  seatPriceId: string;
  /** Days of free trial on a new subscription; 0 means none. */
  trialDays: number;
}

export interface HostedConfig {
  hosted: boolean;
  webappUrl: string;
  billing: BillingConfig | { enabled: false };
  problems: string[];
}

type Env = Record<string, string | undefined>;

function flag(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function isLiveStripeKey(key: string): boolean {
  return /^(sk|rk)_live_/.test(key);
}

export function isTestStripeKey(key: string): boolean {
  return /^(sk|rk)_test_[A-Za-z0-9]+/.test(key);
}

/** Reads and checks the environment. Never throws; problems are listed so a startup check can print them all. */
export function readHostedConfig(env: Env): HostedConfig {
  const problems: string[] = [];
  const hosted = flag(env.SEATROTA_HOSTED);
  const webappUrl = (env.NEXT_PUBLIC_WEBAPP_URL || "").replace(/\/$/, "");

  const required = ["DATABASE_URL", "NEXTAUTH_SECRET", "CALENDSO_ENCRYPTION_KEY", "NEXT_PUBLIC_WEBAPP_URL"];
  for (const name of required) {
    if (!env[name]) problems.push(`${name} is not set`);
  }
  const encryptionKey = env.CALENDSO_ENCRYPTION_KEY || "";
  if (encryptionKey && Buffer.byteLength(encryptionKey) !== 32) {
    problems.push("CALENDSO_ENCRYPTION_KEY must be exactly 32 bytes (AES-256)");
  }
  if (webappUrl && !/^https?:\/\/[^/]+/.test(webappUrl)) {
    problems.push("NEXT_PUBLIC_WEBAPP_URL must be an http or https URL");
  }
  if (hosted && webappUrl.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(webappUrl)) {
    problems.push("A hosted instance must serve NEXT_PUBLIC_WEBAPP_URL over https");
  }
  if (hosted && !env.CRON_API_KEY) problems.push("CRON_API_KEY is not set (reminders cannot be sent)");

  if (!flag(env.SEATROTA_BILLING_ENABLED)) {
    return { hosted, webappUrl, billing: { enabled: false }, problems };
  }

  const secretKey = env.STRIPE_SECRET_KEY || "";
  const webhookSecret = env.SEATROTA_STRIPE_WEBHOOK_SECRET || "";
  const seatPriceId = env.SEATROTA_STRIPE_SEAT_PRICE_ID || "";
  const trialDays = Number.parseInt(env.SEATROTA_BILLING_TRIAL_DAYS || "0", 10);
  if (!secretKey) problems.push("STRIPE_SECRET_KEY is not set");
  else if (isLiveStripeKey(secretKey)) {
    problems.push("STRIPE_SECRET_KEY is a live key; SeatRota billing runs in Stripe test mode only");
  } else if (!isTestStripeKey(secretKey)) problems.push("STRIPE_SECRET_KEY must be a Stripe test key (sk_test_...)");
  if (!webhookSecret.startsWith("whsec_")) problems.push("SEATROTA_STRIPE_WEBHOOK_SECRET must start with whsec_");
  if (!seatPriceId.startsWith("price_")) problems.push("SEATROTA_STRIPE_SEAT_PRICE_ID must be a Stripe price id (price_...)");
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 90) {
    problems.push("SEATROTA_BILLING_TRIAL_DAYS must be a whole number from 0 to 90");
  }
  const billingOk = isTestStripeKey(secretKey) && webhookSecret.startsWith("whsec_") && seatPriceId.startsWith("price_");
  return {
    hosted,
    webappUrl,
    billing: billingOk
      ? { enabled: true, secretKey, webhookSecret, seatPriceId, trialDays: Math.max(0, Math.min(90, trialDays || 0)) }
      : { enabled: false },
    problems,
  };
}

/** Billing config, or an error naming the first problem. For request paths that need billing. */
export function requireBillingConfig(env: Env): BillingConfig {
  const config = readHostedConfig(env);
  if (!config.billing.enabled) {
    const billingProblem = config.problems.find((problem) => /STRIPE|BILLING/.test(problem));
    throw new Error(billingProblem ?? "Billing is not enabled (set SEATROTA_BILLING_ENABLED=1)");
  }
  return config.billing;
}
