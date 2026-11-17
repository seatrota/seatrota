// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

// Startup check for the container image: prints every configuration problem
// and exits non-zero when there is one, before the server starts.
import process from "node:process";
import { readHostedConfig } from "./config";

const config = readHostedConfig(process.env);
const mode = config.hosted ? "hosted" : "self-hosted";
const billing = config.billing.enabled ? "on (Stripe test mode)" : "off";
console.log(`seatrota: ${mode} instance at ${config.webappUrl || "(no URL)"}; billing ${billing}`);
for (const problem of config.problems) console.error(`seatrota: config problem: ${problem}`);
if (config.problems.length > 0 && process.env.SEATROTA_SKIP_ENV_CHECK !== "1") process.exit(1);
