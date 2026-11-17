// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export interface DnsTxtResolver {
  resolveTxt(hostname: string): Promise<readonly string[]>;
}

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, "");
}

export function assertDomain(domain: string): string {
  const normalized = normalizeDomain(domain);
  if (!DOMAIN_PATTERN.test(normalized)) {
    throw new Error("Enter a domain name such as example.com");
  }
  return normalized;
}

export function emailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 1 || at === normalized.length - 1) return null;
  const domain = normalized.slice(at + 1);
  return DOMAIN_PATTERN.test(domain) ? domain : null;
}

export function verificationHost(domain: string): string {
  return `_seatrota.${normalizeDomain(domain)}`;
}

export function verificationTokenText(token: string): string {
  return `seatrota-verify=${token}`;
}

export async function txtRecordProvesDomain(input: {
  domain: string;
  token: string;
  resolver: DnsTxtResolver;
}): Promise<boolean> {
  const expected = verificationTokenText(input.token);
  let records: readonly string[];
  try {
    records = await input.resolver.resolveTxt(verificationHost(input.domain));
  } catch {
    return false;
  }
  return records.some((record) => record.split(/\s+/).includes(expected));
}
