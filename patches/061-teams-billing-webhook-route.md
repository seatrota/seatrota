# 061 Teams billing webhook route

New route `apps/web/app/api/teams/billing/webhook/route.ts`. It reads the raw request body, which signature checks need, and passes it to `@seatrota/teams-billing/service`. That service verifies the `Stripe-Signature` header and applies `checkout.session.completed` and `customer.subscription.*` events to `teams_subscription`. A bad signature, or billing that is turned off, answers 400.
