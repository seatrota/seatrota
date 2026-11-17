// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import authedProcedure from "@calcom/trpc/server/procedures/authedProcedure";
import { router } from "@calcom/trpc/server/trpc";
import { TeamsAccessError, TeamsRequestError } from "@seatrota/teams-core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { teamInsights } from "./service";

export const teamsInsightsRouter = router({
  insights: authedProcedure
    .input(z.object({ slug: z.string(), from: z.string().max(40).optional(), to: z.string().max(40).optional() }))
    .query(async ({ ctx, input }) => {
      try {
        return await teamInsights({ userId: ctx.user.id, ...input });
      } catch (error) {
        if (error instanceof TeamsAccessError || error instanceof TeamsRequestError) {
          throw new TRPCError({ code: error.code, message: error.message });
        }
        throw error;
      }
    }),
});
