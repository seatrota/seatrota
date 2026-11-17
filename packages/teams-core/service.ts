// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { prisma } from "@calcom/prisma";
import { sendTeamInviteEmail } from "@calcom/emails/organization-email-service";
import { getTranslation } from "@calcom/i18n/server";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { randomBytes } from "node:crypto";

import {
  assertMembershipChange,
  assertTeamsAccess,
  isManagerRole,
  TeamsRequestError,
  type TeamsProcedure,
  type TeamsRole,
} from "./permissions";
import { hostForSlot, unionHostSlots, type TeamSlot } from "./slots";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MEET_LINK = "https://example.com/team-meet";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(normalized)) {
    throw new TeamsRequestError("BAD_REQUEST", "Use a lowercase slug with letters, numbers, and hyphens");
  }
  return normalized;
}

function asRole(role: string): TeamsRole {
  if (role === "OWNER" || role === "ADMIN" || role === "MEMBER") {
    return role;
  }
  throw new TeamsRequestError("BAD_REQUEST", "Unknown team role");
}

async function teamBySlug(slug: string) {
  const team = await prisma.teamsTeam.findUnique({ where: { slug } });
  if (!team) {
    throw new TeamsRequestError("NOT_FOUND", "Team not found");
  }
  return team;
}

async function roleFor(teamId: number, userId: number): Promise<TeamsRole | null> {
  const membership = await prisma.teamsMembership.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  return membership ? asRole(membership.role) : null;
}

async function guard(procedure: TeamsProcedure, userId: number, slug: string): Promise<TeamsRole | null> {
  const team = await teamBySlug(slug);
  const role = await roleFor(team.id, userId);
  assertTeamsAccess({ procedure, isAuthenticated: true, role });
  return role;
}

export async function createTeam(input: { userId: number; name: string; slug: string }) {
  assertTeamsAccess({ procedure: "create", isAuthenticated: true, role: null });
  const name = input.name.trim();
  if (!name) {
    throw new TeamsRequestError("BAD_REQUEST", "Team name is required");
  }
  const slug = assertSlug(input.slug);
  const existing = await prisma.teamsTeam.findUnique({ where: { slug } });
  if (existing) {
    throw new TeamsRequestError("CONFLICT", "That team link is already in use");
  }
  const team = await prisma.teamsTeam.create({
    data: {
      name,
      slug,
      memberships: {
        create: { userId: input.userId, role: "OWNER" },
      },
    },
  });
  return { id: team.id, name: team.name, slug: team.slug, role: "OWNER" as const };
}

export async function listTeams(userId: number) {
  assertTeamsAccess({ procedure: "list", isAuthenticated: true, role: null });
  const rows = await prisma.teamsMembership.findMany({
    where: { userId },
    include: { team: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => ({
    id: row.team.id,
    name: row.team.name,
    slug: row.team.slug,
    role: asRole(row.role),
  }));
}

export async function getTeam(input: { userId: number; slug: string }) {
  const team = await teamBySlug(input.slug);
  const viewerRole = await roleFor(team.id, input.userId);
  assertTeamsAccess({ procedure: "get", isAuthenticated: true, role: viewerRole });
  const [members, invites, eventTypes] = await Promise.all([
    prisma.teamsMembership.findMany({
      where: { teamId: team.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { id: "asc" },
    }),
    isManagerRole(viewerRole)
      ? prisma.teamsInvite.findMany({
          where: { teamId: team.id, acceptedAt: null },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
    prisma.teamsEventType.findMany({
      where: { teamId: team.id },
      include: {
        hosts: {
          orderBy: { position: "asc" },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    viewerRole,
    members: members.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      role: asRole(member.role),
    })),
    invites: invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: asRole(invite.role),
      expiresAt: invite.expiresAt.toISOString(),
    })),
    eventTypes: eventTypes.map((eventType) => ({
      id: eventType.id,
      title: eventType.title,
      slug: eventType.slug,
      description: eventType.description,
      length: eventType.length,
      hosts: eventType.hosts.map((host) => ({
        userId: host.user.id,
        name: host.user.name,
        email: host.user.email,
      })),
    })),
  };
}

export async function inviteToTeam(input: {
  actorId: number;
  actorName: string | null;
  actorEmail: string;
  locale: string | null;
  slug: string;
  email: string;
  role?: TeamsRole;
}) {
  await guard("invite", input.actorId, input.slug);
  const team = await teamBySlug(input.slug);
  const email = normalizeEmail(input.email);
  const role = input.role ?? "MEMBER";
  if (role === "OWNER") {
    throw new TeamsRequestError("BAD_REQUEST", "Invite someone as an admin or a member");
  }
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    const already = await roleFor(team.id, existingUser.id);
    if (already) {
      throw new TeamsRequestError("CONFLICT", "That person is already on the team");
    }
  }
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const pending = await prisma.teamsInvite.findFirst({
    where: { teamId: team.id, email, acceptedAt: null },
  });
  const invite = pending
    ? await prisma.teamsInvite.update({
        where: { id: pending.id },
        data: { token, role, expiresAt },
      })
    : await prisma.teamsInvite.create({
        data: { teamId: team.id, email, token, role, expiresAt },
      });

  try {
    const language = await getTranslation(input.locale || "en", "common");
    await sendTeamInviteEmail({
      language,
      from: input.actorName || input.actorEmail,
      to: email,
      teamName: team.name,
      joinLink: `${WEBAPP_URL}/teams/invite/${token}`,
      isCalcomMember: Boolean(existingUser),
      isAutoJoin: false,
      isOrg: false,
      parentTeamName: undefined,
      isExistingUserMovedToOrg: false,
      prevLink: null,
      newLink: null,
    });
  } catch (error) {
    console.error("teams invite email failed", error);
  }

  return { id: invite.id, email: invite.email, role: asRole(invite.role), token: invite.token };
}

export async function acceptInvite(input: { userId: number; email: string; token: string }) {
  const invite = await prisma.teamsInvite.findUnique({ where: { token: input.token } });
  if (!invite) {
    throw new TeamsRequestError("NOT_FOUND", "Invite not found");
  }
  const email = normalizeEmail(input.email);
  assertTeamsAccess({
    procedure: "acceptInvite",
    isAuthenticated: true,
    role: null,
    isInvitee: invite.email === email,
  });
  if (invite.acceptedAt) {
    throw new TeamsRequestError("BAD_REQUEST", "This invite was already accepted");
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    throw new TeamsRequestError("BAD_REQUEST", "This invite has expired");
  }
  await prisma.teamsMembership.upsert({
    where: { teamId_userId: { teamId: invite.teamId, userId: input.userId } },
    create: { teamId: invite.teamId, userId: input.userId, role: invite.role },
    update: {},
  });
  await prisma.teamsInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });
  const team = await prisma.teamsTeam.findUniqueOrThrow({ where: { id: invite.teamId } });
  return { slug: team.slug, name: team.name, role: asRole(invite.role) };
}

export async function changeMemberRole(input: {
  actorId: number;
  slug: string;
  userId: number;
  role: TeamsRole;
}) {
  const team = await teamBySlug(input.slug);
  const actorRole = await roleFor(team.id, input.actorId);
  if (!actorRole) {
    assertTeamsAccess({ procedure: "changeRole", isAuthenticated: true, role: null });
  }
  const target = await prisma.teamsMembership.findUnique({
    where: { teamId_userId: { teamId: team.id, userId: input.userId } },
  });
  if (!target || !actorRole) {
    throw new TeamsRequestError("NOT_FOUND", "Member not found");
  }
  const ownerCount = await prisma.teamsMembership.count({ where: { teamId: team.id, role: "OWNER" } });
  assertMembershipChange({
    actorRole,
    action: "changeRole",
    targetRole: asRole(target.role),
    nextRole: input.role,
    ownerCount,
  });
  await prisma.teamsMembership.update({
    where: { id: target.id },
    data: { role: input.role },
  });
  return { userId: input.userId, role: input.role };
}

export async function removeMember(input: { actorId: number; slug: string; userId: number }) {
  const team = await teamBySlug(input.slug);
  const actorRole = await roleFor(team.id, input.actorId);
  const target = await prisma.teamsMembership.findUnique({
    where: { teamId_userId: { teamId: team.id, userId: input.userId } },
  });
  if (!target || !actorRole) {
    assertTeamsAccess({ procedure: "removeMember", isAuthenticated: true, role: actorRole });
    throw new TeamsRequestError("NOT_FOUND", "Member not found");
  }
  const ownerCount = await prisma.teamsMembership.count({ where: { teamId: team.id, role: "OWNER" } });
  assertMembershipChange({
    actorRole,
    action: "remove",
    targetRole: asRole(target.role),
    ownerCount,
  });
  await prisma.teamsMembership.delete({ where: { id: target.id } });
  return { userId: input.userId };
}

async function scheduleIdFor(userId: number): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      defaultScheduleId: true,
      schedules: { select: { id: true }, orderBy: { id: "asc" }, take: 1 },
    },
  });
  return user?.defaultScheduleId ?? user?.schedules[0]?.id ?? null;
}

async function createShadowEventType(input: {
  hostUserId: number;
  title: string;
  description: string | null;
  length: number;
  slug: string;
}) {
  const scheduleId = await scheduleIdFor(input.hostUserId);
  return prisma.eventType.create({
    data: {
      title: input.title,
      slug: input.slug,
      description: input.description,
      length: input.length,
      hidden: true,
      userId: input.hostUserId,
      scheduleId,
      locations: [{ type: "link", link: MEET_LINK }],
      users: { connect: { id: input.hostUserId } },
    },
  });
}

function assertLength(length: number): number {
  if (!Number.isInteger(length) || length < 5 || length > 240) {
    throw new TeamsRequestError("BAD_REQUEST", "Length must be between 5 and 240 minutes");
  }
  return length;
}

async function assertHostsAreMembers(teamId: number, hostUserIds: number[]) {
  if (hostUserIds.length === 0) {
    throw new TeamsRequestError("BAD_REQUEST", "Choose at least one host");
  }
  const seen = new Set<number>();
  const unique: number[] = [];
  for (let index = 0; index < hostUserIds.length; index += 1) {
    const hostUserId = hostUserIds[index];
    if (hostUserId === undefined || seen.has(hostUserId)) {
      continue;
    }
    seen.add(hostUserId);
    unique.push(hostUserId);
  }
  const members = await prisma.teamsMembership.findMany({
    where: { teamId, userId: { in: unique } },
    select: { userId: true },
  });
  if (members.length !== unique.length) {
    throw new TeamsRequestError("BAD_REQUEST", "Hosts must be members of the team");
  }
  return unique;
}

export async function createTeamEventType(input: {
  actorId: number;
  slug: string;
  title: string;
  eventSlug: string;
  description?: string | null;
  length: number;
  hostUserIds: number[];
}) {
  await guard("createEventType", input.actorId, input.slug);
  const team = await teamBySlug(input.slug);
  const title = input.title.trim();
  if (!title) {
    throw new TeamsRequestError("BAD_REQUEST", "Event title is required");
  }
  const eventSlug = assertSlug(input.eventSlug);
  const length = assertLength(input.length);
  const hostUserIds = await assertHostsAreMembers(team.id, input.hostUserIds);
  const duplicate = await prisma.teamsEventType.findUnique({
    where: { teamId_slug: { teamId: team.id, slug: eventSlug } },
  });
  if (duplicate) {
    throw new TeamsRequestError("CONFLICT", "That event link is already in use");
  }
  const description = input.description?.trim() || null;
  const canonical = await prisma.eventType.create({
    data: {
      title,
      slug: `teams-${team.id}-${eventSlug}`,
      description,
      length,
      hidden: true,
      locations: [{ type: "link", link: MEET_LINK }],
    },
  });
  const eventType = await prisma.teamsEventType.create({
    data: {
      teamId: team.id,
      slug: eventSlug,
      title,
      description,
      length,
      eventTypeId: canonical.id,
    },
  });
  for (let position = 0; position < hostUserIds.length; position += 1) {
    const hostUserId = hostUserIds[position];
    if (hostUserId === undefined) {
      continue;
    }
    const shadow = await createShadowEventType({
      hostUserId,
      title,
      description,
      length,
      slug: `teams-${team.id}-${eventType.id}-host-${hostUserId}`,
    });
    await prisma.teamsHost.create({
      data: {
        teamsEventTypeId: eventType.id,
        userId: hostUserId,
        scheduleEventTypeId: shadow.id,
        position,
      },
    });
  }
  return { id: eventType.id, slug: eventType.slug, title: eventType.title, length: eventType.length };
}

export async function updateTeamEventType(input: {
  actorId: number;
  slug: string;
  eventSlug: string;
  title?: string;
  description?: string | null;
  length?: number;
  hostUserIds?: number[];
}) {
  await guard("updateEventType", input.actorId, input.slug);
  const team = await teamBySlug(input.slug);
  const eventType = await prisma.teamsEventType.findUnique({
    where: { teamId_slug: { teamId: team.id, slug: input.eventSlug } },
    include: { hosts: true },
  });
  if (!eventType) {
    throw new TeamsRequestError("NOT_FOUND", "Event type not found");
  }
  const title = input.title?.trim() || eventType.title;
  const description = input.description === undefined ? eventType.description : input.description?.trim() || null;
  const length = input.length === undefined ? eventType.length : assertLength(input.length);
  await prisma.teamsEventType.update({
    where: { id: eventType.id },
    data: { title, description, length },
  });
  if (eventType.eventTypeId) {
    await prisma.eventType.update({
      where: { id: eventType.eventTypeId },
      data: { title, description, length },
    });
  }
  for (const host of eventType.hosts) {
    await prisma.eventType.update({
      where: { id: host.scheduleEventTypeId },
      data: { title, description, length },
    });
  }
  if (input.hostUserIds) {
    const hostUserIds = await assertHostsAreMembers(team.id, input.hostUserIds);
    const keep = new Set(hostUserIds);
    for (const host of eventType.hosts) {
      if (!keep.has(host.userId)) {
        await prisma.teamsHost.delete({ where: { id: host.id } });
        await prisma.eventType.delete({ where: { id: host.scheduleEventTypeId } });
      }
    }
    for (let position = 0; position < hostUserIds.length; position += 1) {
      const hostUserId = hostUserIds[position];
      if (hostUserId === undefined) {
        continue;
      }
      const existing = eventType.hosts.find((host) => host.userId === hostUserId);
      if (existing) {
        await prisma.teamsHost.update({ where: { id: existing.id }, data: { position } });
        continue;
      }
      const shadow = await createShadowEventType({
        hostUserId,
        title,
        description,
        length,
        slug: `teams-${team.id}-${eventType.id}-host-${hostUserId}`,
      });
      await prisma.teamsHost.create({
        data: {
          teamsEventTypeId: eventType.id,
          userId: hostUserId,
          scheduleEventTypeId: shadow.id,
          position,
        },
      });
    }
  }
  return { id: eventType.id, slug: eventType.slug, title, length };
}

export async function deleteTeamEventType(input: { actorId: number; slug: string; eventSlug: string }) {
  await guard("deleteEventType", input.actorId, input.slug);
  const team = await teamBySlug(input.slug);
  const eventType = await prisma.teamsEventType.findUnique({
    where: { teamId_slug: { teamId: team.id, slug: input.eventSlug } },
    include: { hosts: true },
  });
  if (!eventType) {
    throw new TeamsRequestError("NOT_FOUND", "Event type not found");
  }
  const eventTypeIds = [
    eventType.eventTypeId,
    ...eventType.hosts.map((host) => host.scheduleEventTypeId),
  ].filter((id): id is number => typeof id === "number");
  await prisma.teamsEventType.delete({ where: { id: eventType.id } });
  if (eventTypeIds.length > 0) {
    await prisma.eventType.deleteMany({ where: { id: { in: eventTypeIds } } });
  }
  return { slug: eventType.slug };
}

export async function publicTeam(slug: string) {
  assertTeamsAccess({ procedure: "publicTeam", isAuthenticated: false, role: null });
  const team = await prisma.teamsTeam.findUnique({
    where: { slug },
    include: {
      eventTypes: { orderBy: { id: "asc" } },
    },
  });
  if (!team) {
    throw new TeamsRequestError("NOT_FOUND", "Team not found");
  }
  return {
    name: team.name,
    slug: team.slug,
    eventTypes: team.eventTypes.map((eventType) => ({
      title: eventType.title,
      slug: eventType.slug,
      description: eventType.description,
      length: eventType.length,
    })),
  };
}

async function loadHosts(slug: string, eventSlug: string) {
  const team = await teamBySlug(slug);
  const eventType = await prisma.teamsEventType.findUnique({
    where: { teamId_slug: { teamId: team.id, slug: eventSlug } },
    include: { hosts: { orderBy: { position: "asc" } } },
  });
  if (!eventType) {
    throw new TeamsRequestError("NOT_FOUND", "Event type not found");
  }
  return { team, eventType };
}

export async function teamEventSlots(input: {
  slug: string;
  eventSlug: string;
  startTime: string;
  endTime: string;
  timeZone: string;
}): Promise<{ length: number; title: string; slots: Record<string, TeamSlot[]> }> {
  assertTeamsAccess({ procedure: "slots", isAuthenticated: false, role: null });
  const { eventType } = await loadHosts(input.slug, input.eventSlug);
  const { getAvailableSlotsService } = await import("@calcom/features/di/containers/AvailableSlots");
  const service = getAvailableSlotsService();
  const groups = [];
  for (const host of eventType.hosts) {
    const result = await service.getAvailableSlots({
      input: {
        startTime: input.startTime,
        endTime: input.endTime,
        eventTypeId: host.scheduleEventTypeId,
        timeZone: input.timeZone,
        isTeamEvent: false,
        orgSlug: null,
      },
    });
    groups.push({ userId: host.userId, slots: result.slots });
  }
  return {
    length: eventType.length,
    title: eventType.title,
    slots: unionHostSlots(groups),
  };
}

export async function bookTeamEvent(input: {
  slug: string;
  eventSlug: string;
  start: string;
  timeZone: string;
  name: string;
  email: string;
  language?: string;
}) {
  assertTeamsAccess({ procedure: "book", isAuthenticated: false, role: null });
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (!name || !email) {
    throw new TeamsRequestError("BAD_REQUEST", "Name and email are required");
  }
  const { eventType } = await loadHosts(input.slug, input.eventSlug);
  const startDate = new Date(input.start);
  if (Number.isNaN(startDate.getTime())) {
    throw new TeamsRequestError("BAD_REQUEST", "Choose a valid time");
  }
  const rangeStart = new Date(startDate);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
  const rangeEnd = new Date(startDate);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  const available = await teamEventSlots({
    slug: input.slug,
    eventSlug: input.eventSlug,
    startTime: rangeStart.toISOString(),
    endTime: rangeEnd.toISOString(),
    timeZone: input.timeZone,
  });
  const hostUserId = hostForSlot(available.slots, startDate.toISOString());
  if (!hostUserId) {
    throw new TeamsRequestError("BAD_REQUEST", "That time is not available");
  }
  const host = eventType.hosts.find((row) => row.userId === hostUserId);
  if (!host) {
    throw new TeamsRequestError("BAD_REQUEST", "That time is not available");
  }
  const hostUser = await prisma.user.findUnique({
    where: { id: host.userId },
    select: { username: true },
  });
  const end = new Date(startDate.getTime() + eventType.length * 60_000).toISOString();
  const { getRegularBookingService } = await import("@calcom/features/bookings/di/RegularBookingService.container");
  const bookingService = getRegularBookingService();
  const bookingData = {
    eventTypeId: host.scheduleEventTypeId,
    start: startDate.toISOString(),
    end,
    timeZone: input.timeZone,
    language: input.language || "en",
    metadata: {},
    user: hostUser?.username ?? undefined,
    responses: {
      name,
      email,
    },
  };
  const booking = await bookingService.createBooking({
    bookingData: bookingData as unknown as Parameters<typeof bookingService.createBooking>[0]["bookingData"],
    bookingMeta: {
      userId: -1,
    },
  });
  return { uid: booking.uid, hostUserId };
}
