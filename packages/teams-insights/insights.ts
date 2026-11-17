// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export type SchedulingKind = "ROUND_ROBIN" | "COLLECTIVE";

/** One team booking as the dashboard sees it. */
export interface InsightBooking {
  bookingId: number;
  eventTypeId: number;
  assignedUserId: number;
  hostUserIds: readonly number[];
  status: string;
  noShowHost: boolean;
  /** True when at least one guest (an attendee who is not a host) was marked as a no-show. */
  guestNoShow: boolean;
}

export interface InsightMember {
  userId: number;
  name: string;
}

export interface InsightEventType {
  id: number;
  title: string;
  schedulingType: SchedulingKind;
  hostUserIds: readonly number[];
}

export interface Tally {
  bookings: number;
  active: number;
  cancelled: number;
  noShows: number;
}

export interface MemberTally extends Tally {
  userId: number;
  name: string;
  /** Bookings this member hosted, including collective ones they joined without organizing. */
  hosted: number;
}

export interface DistributionRow {
  userId: number;
  name: string;
  bookings: number;
  /** Percentage of the event type's active bookings, one decimal place. */
  share: number;
}

export interface TeamInsights {
  totals: Tally & {
    guestNoShows: number;
    hostNoShows: number;
    cancellationRate: number;
    noShowRate: number;
  };
  members: MemberTally[];
  eventTypes: (Tally & { id: number; title: string; schedulingType: SchedulingKind })[];
  roundRobin: { eventTypeId: number; title: string; total: number; rows: DistributionRow[] }[];
}

// Arrays and Array.from only: the upstream tRPC build compiles this file without downlevel iteration.
const CANCELLED = new Set(["CANCELLED", "REJECTED"]);

export function isCancelled(status: string): boolean {
  return CANCELLED.has(status);
}

/** A cancelled booking cannot also be a no-show. */
export function isNoShow(booking: Pick<InsightBooking, "status" | "noShowHost" | "guestNoShow">): boolean {
  return !isCancelled(booking.status) && (booking.noShowHost || booking.guestNoShow);
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function emptyTally(): Tally {
  return { bookings: 0, active: 0, cancelled: 0, noShows: 0 };
}

function count(tally: Tally, booking: InsightBooking): void {
  tally.bookings += 1;
  if (isCancelled(booking.status)) tally.cancelled += 1;
  else tally.active += 1;
  if (isNoShow(booking)) tally.noShows += 1;
}

export function buildInsights(input: {
  bookings: readonly InsightBooking[];
  members: readonly InsightMember[];
  eventTypes: readonly InsightEventType[];
}): TeamInsights {
  const totals = { ...emptyTally(), guestNoShows: 0, hostNoShows: 0, cancellationRate: 0, noShowRate: 0 };
  const names = new Map(input.members.map((member) => [member.userId, member.name]));
  const members = new Map<number, MemberTally>(
    input.members.map((member) => [member.userId, { ...emptyTally(), userId: member.userId, name: member.name, hosted: 0 }])
  );
  const eventTypes = new Map(
    input.eventTypes.map((eventType) => [
      eventType.id,
      { ...emptyTally(), id: eventType.id, title: eventType.title, schedulingType: eventType.schedulingType },
    ])
  );

  for (const booking of input.bookings) {
    count(totals, booking);
    if (!isCancelled(booking.status)) {
      if (booking.guestNoShow) totals.guestNoShows += 1;
      if (booking.noShowHost) totals.hostNoShows += 1;
    }
    const organizer = members.get(booking.assignedUserId);
    if (organizer) count(organizer, booking);
    const hostIds = [booking.assignedUserId, ...booking.hostUserIds].filter((id, index, all) => all.indexOf(id) === index);
    for (const hostId of hostIds) {
      const host = members.get(hostId);
      if (host && !isCancelled(booking.status)) host.hosted += 1;
    }
    const eventType = eventTypes.get(booking.eventTypeId);
    if (eventType) count(eventType, booking);
  }
  totals.cancellationRate = percent(totals.cancelled, totals.bookings);
  totals.noShowRate = percent(totals.noShows, totals.active);

  const roundRobin = input.eventTypes
    .filter((eventType) => eventType.schedulingType === "ROUND_ROBIN")
    .map((eventType) => {
      const perHost = new Map<number, number>(eventType.hostUserIds.map((userId) => [userId, 0]));
      for (const booking of input.bookings) {
        if (booking.eventTypeId !== eventType.id || isCancelled(booking.status)) continue;
        perHost.set(booking.assignedUserId, (perHost.get(booking.assignedUserId) ?? 0) + 1);
      }
      const total = Array.from(perHost.values()).reduce((sum, value) => sum + value, 0);
      const rows = Array.from(perHost.entries())
        .map(([userId, bookings]) => ({
          userId,
          name: names.get(userId) ?? `User ${userId}`,
          bookings,
          share: percent(bookings, total),
        }))
        .sort((a, b) => b.bookings - a.bookings || a.userId - b.userId);
      return { eventTypeId: eventType.id, title: eventType.title, total, rows };
    });

  return {
    totals,
    members: Array.from(members.values()).sort((a, b) => b.bookings - a.bookings || a.userId - b.userId),
    eventTypes: Array.from(eventTypes.values()),
    roundRobin,
  };
}

export const MAX_RANGE_DAYS = 366;

/** Validates a dashboard range. `to` is exclusive. */
export function resolveRange(input: { from?: string; to?: string }, now: Date): { from: Date; to: Date } {
  const day = 24 * 60 * 60 * 1000;
  const from = input.from ? new Date(input.from) : new Date(now.getTime() - 30 * day);
  const to = input.to ? new Date(input.to) : new Date(now.getTime() + 30 * day);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new RangeError("Choose valid dates");
  if (to.getTime() <= from.getTime()) throw new RangeError("The end date must be after the start date");
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * day) {
    throw new RangeError(`Choose a range of at most ${MAX_RANGE_DAYS} days`);
  }
  return { from, to };
}
