# 033 Teams reminder workflows Playwright test

`apps/web/playwright/teams-workflows.e2e.ts` adds two reminder rules to a team event in the settings panel, checks an unknown placeholder is refused, books the event as a guest, and checks both reminders are queued with the right send times. It then calls the cron route without a key (401), moves the before-start reminder's send time into the past, calls the cron route with the key, and checks that reminder is SENT while the after-end one stays PENDING.
