# 063 Teams billing Playwright test

`apps/web/playwright/teams-billing.e2e.ts` runs with billing on and Stripe test-mode placeholder values. It never contacts Stripe. The test checks that:

- the billing panel offers a 2-seat subscription to a 2-member team;
- an unsigned webhook is refused;
- signed `checkout.session.completed` and `customer.subscription.updated` events make the subscription active with 2 seats, in the database and on the panel;
- a signed `customer.subscription.deleted` event cancels it and brings the subscribe button back.
