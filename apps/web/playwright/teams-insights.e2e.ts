import { randomUUID } from "node:crypto";

import { prisma } from "@calcom/prisma";
import { expect } from "@playwright/test";

import { test } from "./lib/fixtures";

test.afterEach(async ({ users }) => {
  await users.deleteAll();
});

const DAY = 24 * 60 * 60 * 1000;

test("the insights panel shows the right counts for seeded team bookings", async ({ page, users }) => {
  test.setTimeout(180_000);
  const owner = await users.create({ name: "Ana Owner" });
  const first = await users.create({ name: "Ben First" });
  const second = await users.create({ name: "Cy Second" });
  const slug = `insight-${owner.id}`;

  await owner.login();
  await page.goto("/settings/teams");
  await page.getByTestId("team-name").fill("Gauge");
  await page.getByTestId("team-slug").fill(slug);
  await page.getByTestId("team-create").click();
  await expect(page.getByTestId("team-open").filter({ hasText: "Gauge" })).toBeVisible();

  // Seed: members join directly, then the owner creates a round-robin event for all three.
  const team = await prisma.teamsTeam.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  await prisma.teamsMembership.createMany({
    data: [
      { teamId: team.id, userId: first.id, role: "MEMBER" },
      { teamId: team.id, userId: second.id, role: "MEMBER" },
    ],
  });
  await page.goto(`/settings/teams/${slug}`);
  await expect(page.getByTestId("team-member")).toHaveCount(3);
  await page.getByTestId("team-event-title").fill("Intro");
  await page.getByTestId("team-event-slug").fill("intro");
  await page.getByTestId("team-event-length").fill("30");
  await page.getByTestId("team-event-create").click();
  await expect(page.getByTestId("team-event-link").filter({ hasText: "Intro" })).toBeVisible();
  const eventType = await prisma.teamsEventType.findFirstOrThrow({
    where: { teamId: team.id, slug: "intro" },
    select: { id: true },
  });

  const seeds: {
    host: number;
    days: number;
    status?: "ACCEPTED" | "CANCELLED" | "REJECTED";
    guestNoShow?: boolean;
    hostNoShow?: boolean;
  }[] = [
    { host: owner.id, days: 1 },
    { host: owner.id, days: 2, guestNoShow: true },
    { host: owner.id, days: 3 },
    { host: first.id, days: 1 },
    { host: first.id, days: 2, status: "CANCELLED" },
    { host: second.id, days: 1, hostNoShow: true },
    { host: second.id, days: 2, status: "REJECTED", guestNoShow: true },
    // Outside the default 30-day window.
    { host: owner.id, days: -60 },
  ];
  for (const [index, seed] of seeds.entries()) {
    const start = new Date(Math.floor(Date.now() / DAY) * DAY + seed.days * DAY + 10 * 60 * 60 * 1000);
    const uid = randomUUID();
    const booking = await prisma.booking.create({
      data: {
        uid,
        title: `Intro ${index}`,
        startTime: start,
        endTime: new Date(start.getTime() + 30 * 60 * 1000),
        status: seed.status ?? "ACCEPTED",
        // The snapshot's idempotency-key extension reads the host from user.connect.
        user: { connect: { id: seed.host } },
        noShowHost: seed.hostNoShow ?? false,
        attendees: {
          create: {
            email: `insight-guest-${index}-${owner.id}@example.com`,
            name: `Guest ${index}`,
            timeZone: "UTC",
            noShow: seed.guestNoShow ?? false,
          },
        },
      },
      select: { id: true },
    });
    await prisma.teamsAssignment.create({
      data: {
        teamsEventTypeId: eventType.id,
        bookingId: booking.id,
        bookingUid: uid,
        assignedUserId: seed.host,
        hostUserIds: [seed.host],
        assignmentReason: "seeded for the insights e2e",
      },
    });
  }

  await page.reload();
  const panel = page.getByTestId("team-insights");
  await expect(panel.getByTestId("insights-bookings")).toHaveText("7");
  await expect(panel.getByTestId("insights-cancelled")).toHaveText("2");
  await expect(panel.getByTestId("insights-no-shows")).toHaveText("2");
  await expect(panel.getByTestId("insights-cancellation-rate")).toHaveText("28.6%");
  await expect(panel.getByTestId("insights-no-show-rate")).toHaveText("40%");

  const member = (userId: number) => panel.getByTestId(`insights-member-${userId}`);
  await expect(member(owner.id).getByTestId("insights-member-bookings")).toHaveText("3");
  await expect(member(owner.id).getByTestId("insights-member-no-shows")).toHaveText("1");
  await expect(member(first.id).getByTestId("insights-member-bookings")).toHaveText("2");
  await expect(member(first.id).getByTestId("insights-member-cancelled")).toHaveText("1");
  await expect(member(second.id).getByTestId("insights-member-cancelled")).toHaveText("1");
  await expect(member(second.id).getByTestId("insights-member-no-shows")).toHaveText("1");

  const distribution = panel.getByTestId(`insights-rr-${eventType.id}`);
  await expect(distribution).toContainText("5 active");
  await expect(distribution.getByTestId(`insights-rr-row-${owner.id}`)).toContainText("3 (60%)");
  await expect(distribution.getByTestId(`insights-rr-row-${first.id}`)).toContainText("1 (20%)");
  await expect(distribution.getByTestId(`insights-rr-row-${second.id}`)).toContainText("1 (20%)");

  // Widening the range picks up the older booking.
  await panel.getByTestId("insights-from").fill(new Date(Date.now() - 70 * DAY).toISOString().slice(0, 10));
  await expect(panel.getByTestId("insights-bookings")).toHaveText("8");
  await expect(distribution.getByTestId(`insights-rr-row-${owner.id}`)).toContainText("4 (66.7%)");
});
