# 040 Teams insights Playwright test

`apps/web/playwright/teams-insights.e2e.ts` creates a 3-member team and a round-robin event, then seeds 8 team bookings directly in the database: accepted, cancelled, rejected, a guest no-show, a host no-show, and one outside the default 30-day window. It checks the insights panel on the team settings page shows the expected totals, rates, per-member counts and round-robin distribution. It then widens the date range and checks the older booking is counted.
