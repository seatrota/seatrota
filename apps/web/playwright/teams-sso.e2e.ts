import { prisma } from "@calcom/prisma";
import { expect } from "@playwright/test";
import { importSeatRotaRealm, waitForKeycloak } from "@seatrota/teams-sso/e2e/keycloak-admin";

import { test } from "./lib/fixtures";

const keycloakUrl = (process.env.KEYCLOAK_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const ssoEmail = "ada@sso.example.com";
const ssoDomain = "sso.example.com";

async function removeSsoUser() {
  await prisma.user.deleteMany({ where: { email: ssoEmail } });
}

test.beforeEach(removeSsoUser);

test.afterEach(async ({ users }) => {
  await removeSsoUser();
  await users.deleteAll();
});

test("a person signs in through Keycloak, joins with the mapped role, and enforce-SSO refuses their password", async ({
  page,
  users,
}) => {
  test.setTimeout(300_000);
  await waitForKeycloak(keycloakUrl);
  const realm = await importSeatRotaRealm(keycloakUrl);

  const owner = await users.create({ name: "SSO Owner" });
  const slug = `sso-${owner.id}`;
  await owner.login();
  await page.goto("/settings/teams");
  await page.getByTestId("team-name").fill("Quill");
  await page.getByTestId("team-slug").fill(slug);
  await page.getByTestId("team-create").click();
  await expect(page.getByTestId("team-open").filter({ hasText: "Quill" })).toBeVisible();

  // Owner sets up the team provider in the settings panel.
  await page.goto(`/settings/teams/${slug}`);
  const panel = page.getByTestId("team-sso");
  await expect(panel).toBeVisible();
  await panel.getByTestId("team-sso-discovery").fill(`${keycloakUrl}/realms/${realm.realm}`);
  await panel.getByTestId("team-sso-client-id").fill(realm.clientId);
  await panel.getByTestId("team-sso-client-secret").fill(realm.clientSecret);
  await panel.getByTestId("team-sso-group-claim").fill("groups");
  await panel.getByTestId("team-sso-add-mapping").click();
  await panel.getByTestId("team-sso-group-0").fill(realm.group);
  await panel.getByTestId("team-sso-role-0").selectOption("ADMIN");
  await panel.getByTestId("team-sso-save").click();
  await expect(panel.getByText("SSO provider saved.")).toBeVisible();

  await panel.getByTestId("team-sso-domain-input").fill(ssoDomain);
  await panel.getByTestId("team-sso-add-domain").click();
  await expect(panel.getByTestId("team-sso-domain").filter({ hasText: ssoDomain })).toContainText(
    "(unverified)"
  );
  // CI has no DNS zone for the TXT proof, so the test records the proof the Verify
  // button would have found. The DNS lookup itself is covered by domain.test.ts.
  await prisma.teamsSsoDomain.update({ where: { domain: ssoDomain }, data: { verifiedAt: new Date() } });
  await page.reload();
  await expect(panel.getByTestId("team-sso-domain").filter({ hasText: ssoDomain })).toContainText(
    "(verified)"
  );
  await owner.logout();

  // A new person signs in through the Keycloak login form in the browser.
  await page.goto("/auth/signin");
  await page.getByRole("button", { name: "Sign in with Quill SSO" }).click();
  await page.waitForURL((url) => url.href.startsWith(`${keycloakUrl}/realms/${realm.realm}/`));
  await page.locator("#username").fill(realm.username);
  await page.locator("#password").fill(realm.password);
  await page.locator("#kc-login").click();
  await page.waitForURL((url) => !url.href.startsWith(keycloakUrl) && !url.pathname.startsWith("/auth/"));

  const session = await (await page.request.get("/api/auth/session")).json();
  expect(session?.user?.email).toBe(ssoEmail);

  const team = await prisma.teamsTeam.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  const ssoUser = await prisma.user.findFirstOrThrow({ where: { email: ssoEmail }, select: { id: true } });
  const membership = await prisma.teamsMembership.findUniqueOrThrow({
    where: { teamId_userId: { teamId: team.id, userId: ssoUser.id } },
    select: { role: true },
  });
  expect(membership.role).toBe("ADMIN");

  // Owner turns on enforce-SSO for the verified domain.
  await page.context().clearCookies();
  await owner.login();
  await page.goto(`/settings/teams/${slug}`);
  await expect(panel.getByTestId("team-sso-client-id")).toHaveValue(realm.clientId);
  await panel.getByTestId("team-sso-enforce").check();
  await panel.getByTestId("team-sso-save").click();
  await expect(panel.getByText("SSO provider saved.")).toBeVisible();
  await owner.logout();

  // Password login for the SSO domain is refused on the login page.
  await page.goto("/auth/login");
  const form = page.getByTestId("login-form");
  await form.locator("#email").fill(ssoEmail);
  await form.locator("#password").fill("Not-the-password-1");
  const refused = page.waitForResponse(/\/api\/auth\/callback\/credentials/);
  await form.locator('[type="submit"]').click();
  await refused;
  await expect(page.getByText("Your account was created using an Identity Provider.")).toBeVisible();
  expect((await (await page.request.get("/api/auth/session")).json())?.user).toBeUndefined();

  // Other domains keep password login.
  await owner.login();
  await expect(page).not.toHaveURL(/\/auth\/login/);
});
