# 032 Teams reminders cron route

New route `apps/web/app/api/cron/teams-reminders/route.ts`. A scheduler calls it (GET or POST) with `CRON_API_KEY` in the `Authorization` header or the `apiKey` query value, the same convention as the snapshot's other cron routes. It sends every due `teams_reminder` row through `@seatrota/teams-workflows/cron` and returns the counts. Without the key it answers 401.
