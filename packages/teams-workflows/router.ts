// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import authedProcedure from "@calcom/trpc/server/procedures/authedProcedure";
import { router } from "@calcom/trpc/server/trpc";
import { TeamsAccessError, TeamsRequestError } from "@seatrota/teams-core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MAX_OFFSET_MINUTES } from "./schedule";
import * as service from "./service";

function rethrow(error: unknown): never {
  if (error instanceof TeamsAccessError || error instanceof TeamsRequestError) {
    throw new TRPCError({ code: error.code, message: error.message });
  }
  if (error instanceof Error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Reminder request failed" });
}

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    rethrow(error);
  }
}

const eventInput = z.object({ slug: z.string(), eventSlug: z.string() });

export const teamsWorkflowsRouter = router({
  workflowList: authedProcedure
    .input(eventInput)
    .query(({ ctx, input }) => run(() => service.listWorkflows({ userId: ctx.user.id, ...input }))),
  workflowSave: authedProcedure
    .input(
      eventInput.extend({
        id: z.number().int().optional(),
        timing: z.enum(["BEFORE_START", "AFTER_END"]),
        offsetMinutes: z.number().int().min(0).max(MAX_OFFSET_MINUTES),
        recipient: z.enum(["ATTENDEE", "HOSTS"]),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(5000),
        enabled: z.boolean(),
      })
    )
    .mutation(({ ctx, input }) => run(() => service.saveWorkflow({ userId: ctx.user.id, ...input }))),
  workflowDelete: authedProcedure
    .input(eventInput.extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => run(() => service.deleteWorkflow({ userId: ctx.user.id, ...input }))),
});
