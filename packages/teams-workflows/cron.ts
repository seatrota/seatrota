// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { timingSafeEqual } from "node:crypto";
import process from "node:process";

/** The cron caller sends CRON_API_KEY as the Authorization header or an `apiKey` query value. */
export function cronKeyMatches(provided: string | null | undefined, expected = process.env.CRON_API_KEY): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function runTeamsReminderCron(): Promise<{
  sent: number;
  cancelled: number;
  failed: number;
  retried: number;
}> {
  const { sendDueReminders } = await import("./service");
  return sendDueReminders();
}
