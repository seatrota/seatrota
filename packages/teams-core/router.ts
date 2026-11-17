// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import authedProcedure from "@calcom/trpc/server/procedures/authedProcedure";
import publicProcedure from "@calcom/trpc/server/procedures/publicProcedure";
import { mergeRouters, router } from "@calcom/trpc/server/trpc";
import { teamsSsoRouter } from "@seatrota/teams-sso/router";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { TeamsAccessError, TeamsRequestError, type TeamsRole } from "./permissions";
import * as service from "./service";

const roleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

function rethrow(error: unknown): never {
  if (error instanceof TeamsAccessError || error instanceof TeamsRequestError) {
    throw new TRPCError({ code: error.code, message: error.message });
  }
  if (error instanceof Error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Team request failed" });
}

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    rethrow(error);
  }
}

const teamsCoreRouter = router({
  create: authedProcedure
    .input(z.object({ name: z.string().min(1).max(80), slug: z.string().min(1).max(60) }))
    .mutation(({ ctx, input }) => run(() => service.createTeam({ userId: ctx.user.id, ...input }))),
  list: authedProcedure.query(({ ctx }) => run(() => service.listTeams(ctx.user.id))),
  get: authedProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx, input }) => run(() => service.getTeam({ userId: ctx.user.id, slug: input.slug }))),
  invite: authedProcedure
    .input(
      z.object({
        slug: z.string(),
        email: z.string().email(),
        role: roleSchema.optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      run(() =>
        service.inviteToTeam({
          actorId: ctx.user.id,
          actorName: ctx.user.name,
          actorEmail: ctx.user.email,
          locale: ctx.user.locale,
          slug: input.slug,
          email: input.email,
          role: input.role as TeamsRole | undefined,
        })
      )
    ),
  acceptInvite: authedProcedure
    .input(z.object({ token: z.string().min(16) }))
    .mutation(({ ctx, input }) =>
      run(() => service.acceptInvite({ userId: ctx.user.id, email: ctx.user.email, token: input.token }))
    ),
  changeRole: authedProcedure
    .input(z.object({ slug: z.string(), userId: z.number().int(), role: roleSchema }))
    .mutation(({ ctx, input }) =>
      run(() =>
        service.changeMemberRole({
          actorId: ctx.user.id,
          slug: input.slug,
          userId: input.userId,
          role: input.role,
        })
      )
    ),
  removeMember: authedProcedure
    .input(z.object({ slug: z.string(), userId: z.number().int() }))
    .mutation(({ ctx, input }) =>
      run(() => service.removeMember({ actorId: ctx.user.id, slug: input.slug, userId: input.userId }))
    ),
  createEventType: authedProcedure
    .input(
      z.object({
        slug: z.string(),
        title: z.string().min(1).max(120),
        eventSlug: z.string().min(1).max(60),
        description: z.string().max(2000).nullish(),
        length: z.number().int(),
        hostUserIds: z.array(z.number().int()).min(1),
      })
    )
    .mutation(({ ctx, input }) => run(() => service.createTeamEventType({ actorId: ctx.user.id, ...input }))),
  updateEventType: authedProcedure
    .input(
      z.object({
        slug: z.string(),
        eventSlug: z.string(),
        title: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).nullish(),
        length: z.number().int().optional(),
        hostUserIds: z.array(z.number().int()).min(1).optional(),
      })
    )
    .mutation(({ ctx, input }) => run(() => service.updateTeamEventType({ actorId: ctx.user.id, ...input }))),
  deleteEventType: authedProcedure
    .input(z.object({ slug: z.string(), eventSlug: z.string() }))
    .mutation(({ ctx, input }) => run(() => service.deleteTeamEventType({ actorId: ctx.user.id, ...input }))),
  publicTeam: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) => run(() => service.publicTeam(input.slug))),
  slots: publicProcedure
    .input(
      z.object({
        slug: z.string(),
        eventSlug: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        timeZone: z.string(),
      })
    )
    .query(({ input }) => run(() => service.teamEventSlots(input))),
  book: publicProcedure
    .input(
      z.object({
        slug: z.string(),
        eventSlug: z.string(),
        start: z.string(),
        timeZone: z.string(),
        name: z.string().min(1),
        email: z.string().email(),
        language: z.string().optional(),
      })
    )
    .mutation(({ input }) => run(() => service.bookTeamEvent(input))),
});

export const teamsRouter = mergeRouters(teamsCoreRouter, teamsSsoRouter);
