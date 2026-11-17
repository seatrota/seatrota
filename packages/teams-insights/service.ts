// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { prisma } from "@calcom/prisma";
import { assertTeamsAccess, TeamsRequestError, type TeamsRole } from "@seatrota/teams-core";
import { buildInsights, type InsightBooking, resolveRange, type SchedulingKind } from "./insights";

function asRole(role: string): TeamsRole {
  if (role === "OWNER" || role === "ADMIN" || role === "MEMBER") return role;
  throw new TeamsRequestError("BAD_REQUEST", "Unknown team role");
}

/**
 * Dashboard numbers for one team. Bookings are picked by start time in
 * [from, to), using the current (not superseded) assignment for each booking.
 */
export async function teamInsights(input: { userId: number; slug: string; from?: string; to?: string }) {
  const team = await prisma.teamsTeam.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (!team) throw new TeamsRequestError("NOT_FOUND", "Team not found");
  const membership = await prisma.teamsMembership.findUnique({
    where: { teamId_userId: { teamId: team.id, userId: input.userId } },
    select: { role: true },
  });
  assertTeamsAccess({
    procedure: "insightsRead",
    isAuthenticated: true,
    role: membership ? asRole(membership.role) : null,
  });
  let range: { from: Date; to: Date };
  try {
    range = resolveRange({ from: input.from, to: input.to }, new Date());
  } catch (error) {
    throw new TeamsRequestError("BAD_REQUEST", error instanceof Error ? error.message : "Choose valid dates");
  }

  const [members, eventTypes, assignments] = await Promise.all([
    prisma.teamsMembership.findMany({
      where: { teamId: team.id },
      select: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.teamsEventType.findMany({
      where: { teamId: team.id },
      select: { id: true, title: true, schedulingType: true, hosts: { select: { userId: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.teamsAssignment.findMany({
      where: {
        supersededAt: null,
        teamsEventType: { teamId: team.id },
        booking: { startTime: { gte: range.from, lt: range.to } },
      },
      select: {
        bookingId: true,
        teamsEventTypeId: true,
        assignedUserId: true,
        hostUserIds: true,
        booking: {
          select: {
            status: true,
            noShowHost: true,
            attendees: { select: { email: true, noShow: true } },
          },
        },
      },
    }),
  ]);

  const memberEmails = new Set(members.map((member) => member.user.email.toLowerCase()));
  // A booking can have more than one current assignment only by mistake; count it once.
  const seen = new Set<number>();
  const bookings: InsightBooking[] = [];
  for (const row of assignments) {
    if (seen.has(row.bookingId)) continue;
    seen.add(row.bookingId);
    bookings.push({
      bookingId: row.bookingId,
      eventTypeId: row.teamsEventTypeId,
      assignedUserId: row.assignedUserId,
      hostUserIds: row.hostUserIds,
      status: row.booking.status,
      noShowHost: row.booking.noShowHost === true,
      guestNoShow: row.booking.attendees.some(
        (attendee) => attendee.noShow === true && !memberEmails.has(attendee.email.toLowerCase())
      ),
    });
  }

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    ...buildInsights({
      bookings,
      members: members.map((member) => ({
        userId: member.user.id,
        name: member.user.name || member.user.email,
      })),
      eventTypes: eventTypes.map((eventType) => ({
        id: eventType.id,
        title: eventType.title,
        schedulingType: eventType.schedulingType as SchedulingKind,
        hostUserIds: eventType.hosts.map((host) => host.userId),
      })),
    }),
  };
}
