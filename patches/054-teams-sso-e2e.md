# 054 Teams SSO Playwright test

`apps/web/playwright/teams-sso.e2e.ts` drives a real browser login through Keycloak. The team owner saves the OIDC provider and a group mapping in the settings panel, adds the email domain, and the test records the DNS proof. A new person then clicks "Sign in with <team> SSO" on `/auth/signin`, signs in on the Keycloak form, and lands back in SeatRota with a session and the mapped ADMIN role. After the owner turns on enforce-SSO, password login for that domain is refused on `/auth/login`, while other domains still log in.
