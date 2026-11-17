// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import authedProcedure from "@calcom/trpc/server/procedures/authedProcedure";
import { router } from "@calcom/trpc/server/trpc";
import { TeamsAccessError, TeamsRequestError } from "@seatrota/teams-core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as service from "./service";

const scopeSchema = z.enum(["team", "instance"]);
const roleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
const roleMapsSchema = z.array(z.object({ group: z.string().min(1).max(200), role: roleSchema })).max(50);

function rethrow(error: unknown): never {
  if (error instanceof TeamsAccessError || error instanceof TeamsRequestError) {
    throw new TRPCError({ code: error.code, message: error.message });
  }
  if (error instanceof Error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "SSO request failed" });
}

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    rethrow(error);
  }
}

export const teamsSsoRouter = router({
  ssoGet: authedProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx, input }) => run(() => service.getSsoSettings({ userId: ctx.user.id, slug: input.slug }))),
  ssoSave: authedProcedure
    .input(
      z.object({
        slug: z.string(),
        scope: scopeSchema,
        discoveryUrl: z.string().min(8).max(500),
        clientId: z.string().min(1).max(200),
        clientSecret: z.string().max(500).optional(),
        scopes: z.string().min(1).max(300),
        enforceSso: z.boolean(),
        groupClaim: z.string().max(100),
        enabled: z.boolean(),
        roleMaps: roleMapsSchema,
      })
    )
    .mutation(({ ctx, input }) => run(() => service.saveSsoConnection({ userId: ctx.user.id, ...input }))),
  ssoAddDomain: authedProcedure
    .input(z.object({ slug: z.string(), scope: scopeSchema, domain: z.string().min(3).max(253) }))
    .mutation(({ ctx, input }) => run(() => service.addSsoDomain({ userId: ctx.user.id, ...input }))),
  ssoVerifyDomain: authedProcedure
    .input(z.object({ slug: z.string(), domain: z.string().min(3).max(253) }))
    .mutation(({ ctx, input }) => run(() => service.verifySsoDomain({ userId: ctx.user.id, ...input }))),
  ssoRemoveDomain: authedProcedure
    .input(z.object({ slug: z.string(), domain: z.string().min(3).max(253) }))
    .mutation(({ ctx, input }) => run(() => service.removeSsoDomain({ userId: ctx.user.id, ...input }))),
});
