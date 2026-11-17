// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import type { DnsTxtResolver } from "./domain";

export function nodeDnsTxtResolver(): DnsTxtResolver {
  return {
    async resolveTxt(hostname: string) {
      const dns = await import("node:dns/promises");
      const rows = await dns.resolveTxt(hostname);
      return rows.map((chunks) => chunks.join(""));
    },
  };
}
