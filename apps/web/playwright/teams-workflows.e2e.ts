import { prisma } from "@calcom/prisma";
import { expect } from "@playwright/test";

import { test } from "./lib/fixtures";

test.afterEach(async ({ users }) => {
  await users.deleteAll();
});

test("an event reminder is queued when a guest books, then sent by the cron", async ({ page, users }) => {
  test.setTimeout(240_000);
  const owner = await users.create({ name: "Reminder Owner" });
  const slug = `remind-${owner.id}`;
  const guestEmail = `remind-guest-${owner.id}@example.com`;

  await owner.login();
  await page.goto("/settings/teams");
  await page.getByTestId("team-name").fill("Nudge");
  await page.getByTestId("team-slug").fill(slug);
  await page.getByTestId("team-create").click();
  await expect(page.getByTestId("team-open").filter({ hasText: "Nudge" })).toBeVisible();

  await page.goto(`/settings/teams/${slug}`);
  await page.getByTestId("team-event-title").fill("Intro");
  await page.getByTestId("team-event-slug").fill("intro");
  await page.getByTestId("team-event-length").fill("30");
  await page.getByTestId("team-event-create").click();
  await expect(page.getByTestId("team-event-link").filter({ hasText: "Intro" })).toBeVisible();

  // Two rules: one hour before start to the guest, ten minutes after end to the hosts.
  const panel = page.getByTestId("team-reminders-intro");
  await panel.getByTestId("team-reminder-offset").fill("60");
  await panel.getByTestId("team-reminder-timing").selectOption("BEFORE_START");
  await panel.getByTestId("team-reminder-recipient").selectOption("ATTENDEE");
  await panel.getByTestId("team-reminder-subject").fill("See you soon, {{attendee_name}}");
  await panel.getByTestId("team-reminder-save").click();
  await expect(panel.getByTestId("team-reminder")).toHaveCount(1);
  await expect(panel.getByTestId("team-reminder").first()).toContainText("1 hour before start");

  await panel.getByTestId("team-reminder-offset").fill("10");
  await panel.getByTestId("team-reminder-timing").selectOption("AFTER_END");
  await panel.getByTestId("team-reminder-recipient").selectOption("HOSTS");
  await panel.getByTestId("team-reminder-subject").fill("How did {{event_title}} go?");
  await panel.getByTestId("team-reminder-save").click();
  await expect(panel.getByTestId("team-reminder")).toHaveCount(2);

  // An unknown placeholder is refused when saving.
  await panel.getByTestId("team-reminder-subject").fill("Hi {{attendee_nmae}}");
  await panel.getByTestId("team-reminder-save").click();
  await expect(panel.getByText("Unknown placeholder in the subject: attendee_nmae")).toBeVisible();
  await expect(panel.getByTestId("team-reminder")).toHaveCount(2);
  await owner.logout();

  await page.goto(`/team/${slug}/intro`);
  await page.getByTestId("team-slot-day").first().click();
  await page.getByTestId("team-slot-time").first().click();
  await page.getByTestId("team-book-name").fill("Guest Robin");
  await page.getByTestId("team-book-email").fill(guestEmail);
  await page.getByTestId("team-book-submit").click();
  await page.waitForURL((url) => url.pathname.startsWith("/booking/"));
  await expect(page.getByTestId("success-page")).toBeVisible();

  const booking = await prisma.booking.findFirstOrThrow({
    where: { attendees: { some: { email: guestEmail } } },
    select: { id: true, startTime: true, endTime: true },
  });
  const reminders = await prisma.teamsReminder.findMany({
    where: { bookingId: booking.id },
    select: { id: true, status: true, sendAt: true, workflow: { select: { timing: true, offsetMinutes: true } } },
    orderBy: { sendAt: "asc" },
  });
  console.log("queued reminders", JSON.stringify(reminders));
  expect(reminders).toHaveLength(2);
  expect(reminders.every((row) => row.status === "PENDING")).toBe(true);
  const before = reminders.find((row) => row.workflow.timing === "BEFORE_START");
  const after = reminders.find((row) => row.workflow.timing === "AFTER_END");
  // One hour before start, or the booking time when the slot is less than an hour away.
  expect(before?.sendAt.getTime()).toBeGreaterThanOrEqual(booking.startTime.getTime() - 60 * 60_000);
  expect(before?.sendAt.getTime()).toBeLessThan(booking.startTime.getTime());
  expect(after?.sendAt.getTime()).toBe(booking.endTime.getTime() + 10 * 60_000);

  // The cron refuses a missing key, sends nothing early, and sends a reminder once it is due.
  const cronKey = process.env.CRON_API_KEY || "";
  expect((await page.request.post("/api/cron/teams-reminders")).status()).toBe(401);
  if (before && before.sendAt.getTime() > Date.now()) {
    const early = await page.request.post("/api/cron/teams-reminders", { headers: { authorization: cronKey } });
    expect(early.status()).toBe(200);
    expect((await prisma.teamsReminder.findUniqueOrThrow({ where: { id: before.id } })).status).toBe("PENDING");
  }
  await prisma.teamsReminder.update({
    where: { id: before?.id ?? 0 },
    data: { sendAt: new Date(Date.now() - 60_000) },
  });
  const run = await page.request.post("/api/cron/teams-reminders", { headers: { authorization: cronKey } });
  expect(run.status()).toBe(200);
  expect((await run.json()).sent).toBeGreaterThanOrEqual(1);
  const sent = await prisma.teamsReminder.findUniqueOrThrow({ where: { id: before?.id ?? 0 } });
  expect(sent.status).toBe("SENT");
  expect(sent.sentAt).not.toBeNull();
  expect((await prisma.teamsReminder.findUniqueOrThrow({ where: { id: after?.id ?? 0 } })).status).toBe("PENDING");
});
