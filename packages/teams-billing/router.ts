// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import authedProcedure from "@calcom/trpc/server/procedures/authedProcedure";
import { router } from "@calcom/trpc/server/trpc";
import { TeamsAccessError, TeamsRequestError } from "@seatrota/teams-core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as service from "./service";

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof TeamsAccessError || error instanceof TeamsRequestError) {
      throw new TRPCError({ code: error.code, message: error.message });
    }
    if (error instanceof Error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Billing request failed" });
  }
}

export const teamsBillingRouter = router({
  billingGet: authedProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx, input }) => run(() => service.getBilling({ userId: ctx.user.id, slug: input.slug }))),
  billingCheckout: authedProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(({ ctx, input }) =>
      run(() => service.startSeatCheckout({ userId: ctx.user.id, email: ctx.user.email, slug: input.slug }))
    ),
});
