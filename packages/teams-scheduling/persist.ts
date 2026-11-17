// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { prisma } from "@calcom/prisma";
import { type HostCandidate, type HostPriority, onHostCancelled } from "./scheduler";

function priorityOf(value: "HIGH" | "MEDIUM" | "LOW"): HostPriority {
  if (value === "HIGH") {
    return "high";
  }
  if (value === "LOW") {
    return "low";
  }
  return "medium";
}

export async function reassignCancelledTeamHost(input: {
  bookingId: number;
  bookingUid: string;
  cancelledUserId: number | null;
}): Promise<void> {
  if (input.cancelledUserId == null) {
    return;
  }
  const assignment = await prisma.teamsAssignment.findFirst({
    where: { bookingId: input.bookingId, supersededAt: null },
    select: {
      id: true,
      assignedUserId: true,
      teamsEventTypeId: true,
      teamsEventType: {
        select: {
          schedulingType: true,
          hosts: {
            orderBy: { position: "asc" },
            select: {
              userId: true,
              priority: true,
              weight: true,
              isFixed: true,
              scheduleEventTypeId: true,
            },
          },
        },
      },
      booking: {
        select: { id: true, startTime: true, endTime: true },
      },
    },
  });
  if (!assignment || assignment.teamsEventType.schedulingType !== "ROUND_ROBIN") {
    return;
  }
  if (assignment.assignedUserId !== input.cancelledUserId) {
    return;
  }

  const start = assignment.booking.startTime;
  const end = assignment.booking.endTime;
  const time = start.toISOString();
  const hostIds = assignment.teamsEventType.hosts.map((host) => host.userId);
  const overlaps = await prisma.booking.findMany({
    where: {
      id: { not: assignment.booking.id },
      status: "ACCEPTED",
      userId: { in: hostIds },
      startTime: { lt: end },
      endTime: { gt: start },
    },
    select: { userId: true },
  });
  const busy = new Set<number>();
  for (const row of overlaps) {
    if (row.userId != null) {
      busy.add(row.userId);
    }
  }
  busy.add(input.cancelledUserId);

  try {
    const { getAvailableSlotsService } = await import("@calcom/features/di/containers/AvailableSlots");
    const slots = getAvailableSlotsService();
    const rangeStart = new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const rangeEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString();
    for (const host of assignment.teamsEventType.hosts) {
      if (busy.has(host.userId) || host.userId === input.cancelledUserId) {
        continue;
      }
      const result = await slots.getAvailableSlots({
        input: {
          startTime: rangeStart,
          endTime: rangeEnd,
          eventTypeId: host.scheduleEventTypeId,
          timeZone: "UTC",
          isTeamEvent: false,
          orgSlug: null,
        },
      });
      let open = false;
      for (const day of Object.values(result.slots)) {
        if (day.some((slot) => slot.time === time)) {
          open = true;
          break;
        }
      }
      if (!open) {
        busy.add(host.userId);
      }
    }
  } catch (error) {
    console.error("teams reassignment availability lookup failed", error);
  }

  const historyRows = await prisma.teamsAssignment.findMany({
    where: {
      teamsEventTypeId: assignment.teamsEventTypeId,
      supersededAt: null,
      id: { not: assignment.id },
      booking: { status: "ACCEPTED" },
    },
    select: {
      assignedUserId: true,
      booking: { select: { startTime: true } },
    },
  });
  const hosts: HostCandidate[] = assignment.teamsEventType.hosts.map((host) => ({
    userId: host.userId,
    priority: priorityOf(host.priority),
    weight: host.weight,
    fixed: host.isFixed,
    openTimes: busy.has(host.userId) ? [] : [time],
  }));
  const next = onHostCancelled({
    cancelledUserId: input.cancelledUserId,
    organizerUserId: assignment.assignedUserId,
    mode: "round-robin",
    time,
    hosts,
    history: historyRows.map((row) => ({
      userId: row.assignedUserId,
      bookedAt: row.booking.startTime.toISOString(),
    })),
  });
  if (!next) {
    return;
  }
  const nextHost = assignment.teamsEventType.hosts.find((host) => host.userId === next.organizerUserId);
  if (!nextHost) {
    return;
  }

  const now = new Date();
  await prisma.booking.update({
    where: { id: assignment.booking.id },
    data: {
      userId: next.organizerUserId,
      eventTypeId: nextHost.scheduleEventTypeId,
      status: "ACCEPTED",
      cancellationReason: null,
      cancelledBy: null,
    },
  });
  await prisma.teamsAssignment.update({
    where: { id: assignment.id },
    data: { supersededAt: now },
  });
  await prisma.teamsAssignment.create({
    data: {
      teamsEventTypeId: assignment.teamsEventTypeId,
      bookingId: assignment.booking.id,
      bookingUid: input.bookingUid,
      assignedUserId: next.organizerUserId,
      hostUserIds: next.hostUserIds,
      assignmentReason: `reassign:${next.assignmentReason}`,
    },
  });
}
