// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export type ReminderTiming = "BEFORE_START" | "AFTER_END";
export type ReminderRecipient = "ATTENDEE" | "HOSTS";

/** Longest offset a reminder may use: 30 days. */
export const MAX_OFFSET_MINUTES = 30 * 24 * 60;
/** A send is tried this many times before the reminder is marked FAILED. */
export const MAX_SEND_ATTEMPTS = 3;

export interface ReminderRule {
  id: number;
  timing: ReminderTiming;
  offsetMinutes: number;
  enabled: boolean;
}

export interface BookingWindow {
  start: Date;
  end: Date;
}

export interface PlannedReminder {
  workflowId: number;
  sendAt: Date;
}

const MINUTE = 60_000;

export function assertOffset(offsetMinutes: number): void {
  if (!Number.isInteger(offsetMinutes) || offsetMinutes < 0 || offsetMinutes > MAX_OFFSET_MINUTES) {
    throw new RangeError(`Offset must be a whole number of minutes from 0 to ${MAX_OFFSET_MINUTES}`);
  }
}

/**
 * When a rule fires for one booking.
 * Before-start reminders that would already be late fire right away, as long as
 * the meeting has not started; a booking made 10 minutes ahead still gets its
 * "1 hour before" note. Returns null when the reminder no longer makes sense.
 */
export function reminderSendAt(rule: ReminderRule, booking: BookingWindow, now: Date): Date | null {
  assertOffset(rule.offsetMinutes);
  if (rule.timing === "AFTER_END") {
    return new Date(booking.end.getTime() + rule.offsetMinutes * MINUTE);
  }
  if (booking.start.getTime() <= now.getTime()) return null;
  const ideal = booking.start.getTime() - rule.offsetMinutes * MINUTE;
  return new Date(Math.max(ideal, now.getTime()));
}

export function planReminders(
  rules: readonly ReminderRule[],
  booking: BookingWindow,
  now: Date
): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const sendAt = reminderSendAt(rule, booking, now);
    if (sendAt) planned.push({ workflowId: rule.id, sendAt });
  }
  return planned.sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime() || a.workflowId - b.workflowId);
}

export type BookingState = "ACCEPTED" | "PENDING" | "CANCELLED" | "REJECTED" | "AWAITING_HOST" | "MISSING";

export type ReminderDecision =
  | { action: "wait" }
  | { action: "send" }
  | { action: "cancel"; reason: string };

/** What the sender does with one pending reminder at `now`. */
export function decideReminder(input: {
  timing: ReminderTiming;
  sendAt: Date;
  workflowEnabled: boolean;
  booking: { state: BookingState; start: Date };
  now: Date;
}): ReminderDecision {
  if (input.booking.state === "MISSING") return { action: "cancel", reason: "Booking no longer exists" };
  if (input.booking.state === "CANCELLED" || input.booking.state === "REJECTED") {
    return { action: "cancel", reason: "Booking was cancelled" };
  }
  if (!input.workflowEnabled) return { action: "cancel", reason: "Reminder was turned off" };
  if (input.sendAt.getTime() > input.now.getTime()) return { action: "wait" };
  if (input.timing === "BEFORE_START" && input.booking.start.getTime() <= input.now.getTime()) {
    return { action: "cancel", reason: "Booking started before the reminder was sent" };
  }
  return { action: "send" };
}

/** Status after a failed send: try again until the attempt limit, then give up. */
export function statusAfterFailure(attemptsSoFar: number): "PENDING" | "FAILED" {
  return attemptsSoFar + 1 >= MAX_SEND_ATTEMPTS ? "FAILED" : "PENDING";
}

/** Human label such as "1 hour 30 minutes before start". */
export function describeRule(rule: Pick<ReminderRule, "timing" | "offsetMinutes">): string {
  const days = Math.floor(rule.offsetMinutes / 1440);
  const hours = Math.floor((rule.offsetMinutes % 1440) / 60);
  const minutes = rule.offsetMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  const when = rule.timing === "BEFORE_START" ? "before start" : "after end";
  if (parts.length === 0) return rule.timing === "BEFORE_START" ? "at start" : "at end";
  return `${parts.join(" ")} ${when}`;
}
