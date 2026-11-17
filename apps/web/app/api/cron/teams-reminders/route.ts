import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { cronKeyMatches, runTeamsReminderCron } from "@seatrota/teams-workflows/cron";

// SeatRota team reminders: sends queued teams_reminder rows that are due.
async function handler(request: NextRequest) {
  const provided = request.headers.get("authorization") || request.nextUrl.searchParams.get("apiKey");
  if (!cronKeyMatches(provided)) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json(await runTeamsReminderCron());
}

export const dynamic = "force-dynamic";
export const GET = handler;
export const POST = handler;
