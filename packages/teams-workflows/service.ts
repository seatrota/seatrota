// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { WEBAPP_URL } from "@calcom/lib/constants";
import { prisma } from "@calcom/prisma";
import { assertTeamsAccess, TeamsRequestError, type TeamsRole } from "@seatrota/teams-core";
import {
  assertOffset,
  type BookingState,
  decideReminder,
  describeRule,
  planReminders,
  type ReminderRecipient,
  type ReminderTiming,
  statusAfterFailure,
} from "./schedule";
import { formatInstant, renderReminderBody, renderTemplate, unknownTemplateVariables } from "./templates";

export interface ReminderMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type DeliverReminder = (message: ReminderMessage) => Promise<void>;

const SUBJECT_MAX = 200;
const BODY_MAX = 5000;
const BACKFILL_LIMIT = 500;

function asRole(role: string): TeamsRole {
  if (role === "OWNER" || role === "ADMIN" || role === "MEMBER") return role;
  throw new TeamsRequestError("BAD_REQUEST", "Unknown team role");
}

async function eventTypeForActor(input: {
  userId: number;
  slug: string;
  eventSlug: string;
  procedure: "workflowRead" | "workflowManage";
}) {
  const team = await prisma.teamsTeam.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (!team) throw new TeamsRequestError("NOT_FOUND", "Team not found");
  const membership = await prisma.teamsMembership.findUnique({
    where: { teamId_userId: { teamId: team.id, userId: input.userId } },
    select: { role: true },
  });
  assertTeamsAccess({
    procedure: input.procedure,
    isAuthenticated: true,
    role: membership ? asRole(membership.role) : null,
  });
  const eventType = await prisma.teamsEventType.findUnique({
    where: { teamId_slug: { teamId: team.id, slug: input.eventSlug } },
    select: { id: true },
  });
  if (!eventType) throw new TeamsRequestError("NOT_FOUND", "Event type not found");
  return eventType;
}

const workflowSelect = {
  id: true,
  timing: true,
  offsetMinutes: true,
  recipient: true,
  subject: true,
  body: true,
  enabled: true,
} as const;

function viewWorkflow(row: {
  id: number;
  timing: string;
  offsetMinutes: number;
  recipient: string;
  subject: string;
  body: string;
  enabled: boolean;
}) {
  const timing = row.timing as ReminderTiming;
  return {
    id: row.id,
    timing,
    offsetMinutes: row.offsetMinutes,
    recipient: row.recipient as ReminderRecipient,
    subject: row.subject,
    body: row.body,
    enabled: row.enabled,
    label: describeRule({ timing, offsetMinutes: row.offsetMinutes }),
  };
}

export async function listWorkflows(input: { userId: number; slug: string; eventSlug: string }) {
  const eventType = await eventTypeForActor({ ...input, procedure: "workflowRead" });
  const rows = await prisma.teamsWorkflow.findMany({
    where: { teamsEventTypeId: eventType.id },
    select: workflowSelect,
    orderBy: { id: "asc" },
  });
  return rows.map(viewWorkflow);
}

function cleanTemplate(field: "subject" | "body", value: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new TeamsRequestError("BAD_REQUEST", `The ${field} is required`);
  if (trimmed.length > max) throw new TeamsRequestError("BAD_REQUEST", `The ${field} is longer than ${max} characters`);
  const unknown = unknownTemplateVariables(trimmed);
  if (unknown.length > 0) {
    throw new TeamsRequestError("BAD_REQUEST", `Unknown placeholder in the ${field}: ${unknown.join(", ")}`);
  }
  return trimmed;
}

export async function saveWorkflow(input: {
  userId: number;
  slug: string;
  eventSlug: string;
  id?: number;
  timing: ReminderTiming;
  offsetMinutes: number;
  recipient: ReminderRecipient;
  subject: string;
  body: string;
  enabled: boolean;
}) {
  const eventType = await eventTypeForActor({ ...input, procedure: "workflowManage" });
  try {
    assertOffset(input.offsetMinutes);
  } catch (error) {
    throw new TeamsRequestError("BAD_REQUEST", error instanceof Error ? error.message : "Invalid offset");
  }
  const data = {
    timing: input.timing,
    offsetMinutes: input.offsetMinutes,
    recipient: input.recipient,
    subject: cleanTemplate("subject", input.subject, SUBJECT_MAX),
    body: cleanTemplate("body", input.body, BODY_MAX),
    enabled: input.enabled,
  };
  let saved: { id: number };
  if (input.id) {
    const existing = await prisma.teamsWorkflow.findFirst({
      where: { id: input.id, teamsEventTypeId: eventType.id },
      select: { id: true },
    });
    if (!existing) throw new TeamsRequestError("NOT_FOUND", "Reminder not found");
    saved = await prisma.teamsWorkflow.update({ where: { id: existing.id }, data, select: { id: true } });
    // Timing may have moved, so pending rows are planned again below.
    await prisma.teamsReminder.deleteMany({ where: { workflowId: saved.id, status: "PENDING" } });
  } else {
    saved = await prisma.teamsWorkflow.create({
      data: { ...data, teamsEventTypeId: eventType.id },
      select: { id: true },
    });
  }
  const queued = data.enabled ? await backfillWorkflow(saved.id, eventType.id, new Date()) : 0;
  const row = await prisma.teamsWorkflow.findUniqueOrThrow({ where: { id: saved.id }, select: workflowSelect });
  return { ...viewWorkflow(row), queued };
}

export async function deleteWorkflow(input: { userId: number; slug: string; eventSlug: string; id: number }) {
  const eventType = await eventTypeForActor({ ...input, procedure: "workflowManage" });
  const removed = await prisma.teamsWorkflow.deleteMany({
    where: { id: input.id, teamsEventTypeId: eventType.id },
  });
  if (removed.count === 0) throw new TeamsRequestError("NOT_FOUND", "Reminder not found");
  return { id: input.id };
}

async function queueRows(
  rules: { id: number; timing: string; offsetMinutes: number; enabled: boolean }[],
  booking: { id: number; uid: string; startTime: Date; endTime: Date },
  now: Date
): Promise<number> {
  const planned = planReminders(
    rules.map((rule) => ({ ...rule, timing: rule.timing as ReminderTiming })),
    { start: booking.startTime, end: booking.endTime },
    now
  );
  if (planned.length === 0) return 0;
  const created = await prisma.teamsReminder.createMany({
    data: planned.map((item) => ({
      workflowId: item.workflowId,
      bookingId: booking.id,
      bookingUid: booking.uid,
      sendAt: item.sendAt,
    })),
    skipDuplicates: true,
  });
  return created.count;
}

/** Plans reminders for future bookings of the event type when a rule is added or changed. */
async function backfillWorkflow(workflowId: number, teamsEventTypeId: number, now: Date): Promise<number> {
  const rule = await prisma.teamsWorkflow.findUniqueOrThrow({
    where: { id: workflowId },
    select: { id: true, timing: true, offsetMinutes: true, enabled: true },
  });
  const assignments = await prisma.teamsAssignment.findMany({
    where: {
      teamsEventTypeId,
      supersededAt: null,
      booking: { status: "ACCEPTED", endTime: { gt: now } },
    },
    select: { booking: { select: { id: true, uid: true, startTime: true, endTime: true } } },
    take: BACKFILL_LIMIT,
    orderBy: { id: "asc" },
  });
  let queued = 0;
  for (const assignment of assignments) {
    queued += await queueRows([rule], assignment.booking, now);
  }
  return queued;
}

/** Called after a team booking is recorded. Returns how many reminders were queued. */
export async function queueRemindersForBooking(bookingId: number, now = new Date()): Promise<number> {
  const assignment = await prisma.teamsAssignment.findFirst({
    where: { bookingId, supersededAt: null },
    select: {
      teamsEventTypeId: true,
      booking: { select: { id: true, uid: true, startTime: true, endTime: true } },
    },
  });
  if (!assignment) return 0;
  const rules = await prisma.teamsWorkflow.findMany({
    where: { teamsEventTypeId: assignment.teamsEventTypeId, enabled: true },
    select: { id: true, timing: true, offsetMinutes: true, enabled: true },
  });
  return queueRows(rules, assignment.booking, now);
}

function bookingState(status: string | undefined): BookingState {
  switch (status) {
    case "ACCEPTED":
    case "PENDING":
    case "CANCELLED":
    case "REJECTED":
    case "AWAITING_HOST":
      return status;
    default:
      return "MISSING";
  }
}

interface Person {
  email: string;
  name: string;
  timeZone: string;
  locale: string;
}

async function recipientsFor(
  recipient: ReminderRecipient,
  booking: { id: number; attendees: { email: string; name: string; timeZone: string; locale: string | null }[] },
  fallbackTimeZone: string
): Promise<{ people: Person[]; guest: Person | null }> {
  const assignment = await prisma.teamsAssignment.findFirst({
    where: { bookingId: booking.id, supersededAt: null },
    select: { hostUserIds: true, assignedUserId: true },
    orderBy: { id: "desc" },
  });
  // Arrays only: the upstream tRPC build compiles this file without downlevel iteration.
  const hostIds = assignment
    ? [assignment.assignedUserId, ...assignment.hostUserIds].filter((id, index, all) => all.indexOf(id) === index)
    : [];
  const hosts = hostIds.length
    ? await prisma.user.findMany({
        where: { id: { in: hostIds } },
        select: { email: true, name: true, timeZone: true, locale: true },
      })
    : [];
  // Collective bookings list the other hosts as attendees; they are not guests.
  const hostEmails = new Set(hosts.map((host) => host.email.toLowerCase()));
  const guests: Person[] = booking.attendees
    .filter((attendee) => !hostEmails.has(attendee.email.toLowerCase()))
    .map((attendee) => ({
      email: attendee.email,
      name: attendee.name || attendee.email,
      timeZone: attendee.timeZone || fallbackTimeZone,
      locale: attendee.locale || "en",
    }));
  const guest = guests[0] ?? null;
  if (recipient === "HOSTS") {
    const people = hosts.map((host) => ({
      email: host.email,
      name: host.name || host.email,
      timeZone: host.timeZone || fallbackTimeZone,
      locale: host.locale || "en",
    }));
    return { people, guest };
  }
  return { people: guests, guest };
}

export interface SendSummary {
  sent: number;
  cancelled: number;
  failed: number;
  retried: number;
}

/**
 * Sends every due reminder. Each row is claimed by moving it from PENDING to
 * SENDING first, so two overlapping cron runs never send the same email twice.
 */
export async function sendDueReminders(
  options: { now?: Date; limit?: number; deliver?: DeliverReminder } = {}
): Promise<SendSummary> {
  const now = options.now ?? new Date();
  const deliver = options.deliver ?? (await import("./email")).deliverReminderEmail;
  const summary: SendSummary = { sent: 0, cancelled: 0, failed: 0, retried: 0 };
  const due = await prisma.teamsReminder.findMany({
    where: { status: "PENDING", sendAt: { lte: now } },
    select: { id: true },
    orderBy: { sendAt: "asc" },
    take: options.limit ?? 100,
  });
  for (const { id } of due) {
    const claimed = await prisma.teamsReminder.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    if (claimed.count !== 1) continue;
    const reminder = await prisma.teamsReminder.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        bookingId: true,
        sendAt: true,
        attempts: true,
        workflow: {
          select: {
            timing: true,
            recipient: true,
            subject: true,
            body: true,
            enabled: true,
            teamsEventType: { select: { title: true, team: { select: { name: true } } } },
          },
        },
      },
    });
    const booking = await prisma.booking.findUnique({
      where: { id: reminder.bookingId },
      select: {
        id: true,
        uid: true,
        status: true,
        startTime: true,
        endTime: true,
        user: { select: { name: true, timeZone: true } },
        attendees: { select: { email: true, name: true, timeZone: true, locale: true } },
      },
    });
    const decision = decideReminder({
      timing: reminder.workflow.timing as ReminderTiming,
      sendAt: reminder.sendAt,
      workflowEnabled: reminder.workflow.enabled,
      booking: { state: bookingState(booking?.status), start: booking?.startTime ?? now },
      now,
    });
    if (decision.action === "wait") {
      await prisma.teamsReminder.update({ where: { id }, data: { status: "PENDING" } });
      continue;
    }
    if (decision.action === "cancel" || !booking) {
      await prisma.teamsReminder.update({
        where: { id },
        data: { status: "CANCELLED", lastError: decision.action === "cancel" ? decision.reason : "Booking missing" },
      });
      summary.cancelled += 1;
      continue;
    }
    const hostTimeZone = booking.user?.timeZone || "UTC";
    try {
      const { people, guest } = await recipientsFor(
        reminder.workflow.recipient as ReminderRecipient,
        booking,
        hostTimeZone
      );
      if (people.length === 0) throw new Error("No recipient for this reminder");
      for (const person of people) {
        const values = {
          attendee_name: guest?.name ?? "",
          attendee_email: guest?.email ?? "",
          event_title: reminder.workflow.teamsEventType.title,
          team_name: reminder.workflow.teamsEventType.team.name,
          host_name: booking.user?.name ?? "",
          start_time: formatInstant(booking.startTime, person.timeZone, person.locale),
          end_time: formatInstant(booking.endTime, person.timeZone, person.locale),
          time_zone: person.timeZone,
          booking_url: `${WEBAPP_URL}/booking/${booking.uid}`,
        };
        const body = renderReminderBody(reminder.workflow.body, values);
        await deliver({
          to: person.email,
          subject: renderTemplate(reminder.workflow.subject, values),
          text: body.text,
          html: body.html,
        });
      }
      await prisma.teamsReminder.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date(), attempts: reminder.attempts + 1, lastError: null },
      });
      summary.sent += 1;
    } catch (error) {
      const status = statusAfterFailure(reminder.attempts);
      await prisma.teamsReminder.update({
        where: { id },
        data: {
          status,
          attempts: reminder.attempts + 1,
          lastError: error instanceof Error ? error.message.slice(0, 500) : "Send failed",
        },
      });
      if (status === "FAILED") summary.failed += 1;
      else summary.retried += 1;
    }
  }
  return summary;
}
