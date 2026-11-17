import { prisma } from "@calcom/prisma";
import { expect } from "@playwright/test";
import { signatureHeader } from "@seatrota/teams-billing";

import { test } from "./lib/fixtures";

test.afterEach(async ({ users }) => {
  await users.deleteAll();
});

const secret = process.env.SEATROTA_STRIPE_WEBHOOK_SECRET || "";
const priceId = process.env.SEATROTA_STRIPE_SEAT_PRICE_ID || "";

function signed(body: unknown) {
  const payload = JSON.stringify(body);
  return { payload, header: signatureHeader(payload, secret, Math.floor(Date.now() / 1000)) };
}

test("signed Stripe test-mode webhooks drive a team's per-seat subscription", async ({ page, users }) => {
  test.setTimeout(180_000);
  const owner = await users.create({ name: "Billing Owner" });
  const member = await users.create({ name: "Billing Member" });
  const slug = `bill-${owner.id}`;

  await owner.login();
  await page.goto("/settings/teams");
  await page.getByTestId("team-name").fill("Ledger");
  await page.getByTestId("team-slug").fill(slug);
  await page.getByTestId("team-create").click();
  await expect(page.getByTestId("team-open").filter({ hasText: "Ledger" })).toBeVisible();
  const team = await prisma.teamsTeam.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  await prisma.teamsMembership.create({ data: { teamId: team.id, userId: member.id, role: "MEMBER" } });

  await page.goto(`/settings/teams/${slug}`);
  const panel = page.getByTestId("team-billing");
  await expect(panel.getByTestId("team-billing-status")).toHaveText("No subscription");
  await expect(panel.getByTestId("team-billing-members")).toHaveText("2");
  await expect(panel.getByTestId("team-billing-checkout")).toHaveText("Subscribe for 2 seats");

  // A request without a valid signature changes nothing.
  const forged = await page.request.post("/api/teams/billing/webhook", {
    data: JSON.stringify({ type: "checkout.session.completed", data: { object: {} } }),
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=00" },
  });
  expect(forged.status()).toBe(400);

  const completed = signed({
    id: "evt_checkout",
    type: "checkout.session.completed",
    data: {
      object: { mode: "subscription", client_reference_id: String(team.id), customer: "cus_e2e", subscription: `sub_e2e_${team.id}` },
    },
  });
  const linked = await page.request.post("/api/teams/billing/webhook", {
    data: completed.payload,
    headers: { "content-type": "application/json", "stripe-signature": completed.header },
  });
  expect(linked.status()).toBe(200);
  expect((await linked.json()).handled).toBe(true);

  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const updated = signed({
    id: "evt_sub_updated",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: `sub_e2e_${team.id}`,
        customer: "cus_e2e",
        status: "active",
        current_period_end: periodEnd,
        items: { data: [{ quantity: 2, price: { id: priceId } }] },
      },
    },
  });
  const active = await page.request.post("/api/teams/billing/webhook", {
    data: updated.payload,
    headers: { "content-type": "application/json", "stripe-signature": updated.header },
  });
  expect(active.status()).toBe(200);

  const row = await prisma.teamsSubscription.findUniqueOrThrow({ where: { teamId: team.id } });
  expect(row).toMatchObject({ status: "active", seats: 2, stripeCustomerId: "cus_e2e", stripeSubscriptionId: `sub_e2e_${team.id}` });

  await page.reload();
  await expect(panel.getByTestId("team-billing-status")).toHaveText("Active");
  await expect(panel.getByTestId("team-billing-seats")).toHaveText("2");
  await expect(panel.getByTestId("team-billing-checkout")).toHaveCount(0);

  const deleted = signed({
    id: "evt_sub_deleted",
    type: "customer.subscription.deleted",
    data: { object: { id: `sub_e2e_${team.id}`, customer: "cus_e2e", status: "canceled" } },
  });
  await page.request.post("/api/teams/billing/webhook", {
    data: deleted.payload,
    headers: { "content-type": "application/json", "stripe-signature": deleted.header },
  });
  await page.reload();
  await expect(panel.getByTestId("team-billing-status")).toHaveText("Canceled");
  await expect(panel.getByTestId("team-billing-checkout")).toBeVisible();
});
