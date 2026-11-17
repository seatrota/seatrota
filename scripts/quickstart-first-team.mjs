// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors
//
// Drives the "First team" and "SSO" sections of docs/QUICKSTART.md against a
// freshly started stack with an empty database. Usage:
//   node scripts/quickstart-first-team.mjs http://localhost:3000
// Needs the `playwright` package and its Chromium (see the Quickstart CI job).
import { chromium } from "playwright";

const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const admin = {
  username: "firstadmin",
  fullName: "First Admin",
  email: "first-admin@example.com",
  // Strict mode on the setup form: more than 14 characters, upper, lower, digit.
  password: "Quickstart-Pass-2026",
};
const slug = "first-team";

function step(message) {
  console.log(`quickstart-first-team: ${message}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60_000);
try {
  await page.goto(`${base}/auth/login`);
  await page.waitForURL(/\/auth\/setup/);
  step(`an empty database sends /auth/login to ${new URL(page.url()).pathname}`);

  const form = page.locator("form#wizard-step-1");
  await form.locator('input[name="username"]').fill(admin.username);
  await form.locator('input[name="full_name"]').fill(admin.fullName);
  await form.locator('input[name="email_address"]').fill(admin.email);
  await form.locator('input[name="password"]').fill(admin.password);
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/setup"));
  step(`administrator created; setup finished at ${new URL(page.url()).pathname}`);

  await page.goto(`${base}/settings/teams`);
  await page.getByTestId("team-name").fill("First Team");
  await page.getByTestId("team-slug").fill(slug);
  await page.getByTestId("team-create").click();
  await page.getByTestId("team-open").filter({ hasText: "First Team" }).waitFor();
  step("team created from /settings/teams");

  await page.goto(`${base}/settings/teams/${slug}`);
  await page.getByTestId("team-member").filter({ hasText: admin.fullName }).waitFor();
  await page.getByTestId("team-invite-email").fill("invitee@example.com");
  await page.getByTestId("team-invite-submit").click();
  await page.getByText("Invite sent").waitFor();
  await page.getByText("invitee@example.com").first().waitFor();
  step("invite stored and listed without SMTP settings");

  await page.getByTestId("team-event-title").fill("Intro");
  await page.getByTestId("team-event-slug").fill("intro");
  await page.getByTestId("team-event-length").fill("30");
  await page.getByTestId("team-event-create").click();
  await page.getByTestId("team-event-link").filter({ hasText: "Intro" }).waitFor();
  await page.goto(`${base}/team/${slug}`);
  await page.getByTestId("team-event-link").filter({ hasText: "Intro" }).waitFor();
  step(`public booking page /team/${slug} lists the event`);

  await page.goto(`${base}/settings/teams/${slug}`);
  const sso = page.getByTestId("team-sso");
  await sso.waitFor();
  await sso.getByTestId("team-sso-scope").waitFor();
  await sso.getByTestId("team-sso-discovery").waitFor();
  await sso.getByTestId("team-sso-group-claim").waitFor();
  await sso.getByTestId("team-sso-enforce").waitFor();
  step("Single sign-on panel offers scope, discovery URL, group claim and enforce-SSO");

  const providers = await (await page.request.get(`${base}/api/auth/providers`)).json();
  step(`next-auth providers answer (${Object.keys(providers).length} configured before any SSO is saved)`);
} catch (error) {
  await page.screenshot({ path: process.env.QUICKSTART_SCREENSHOT || "quickstart-failure.png", fullPage: true }).catch(() => undefined);
  console.error(`quickstart-first-team: failed at ${page.url()}`);
  throw error;
} finally {
  await browser.close();
}
