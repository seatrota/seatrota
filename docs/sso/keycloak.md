# Keycloak

Create a confidential OpenID Connect client in the realm that should sign people in. These steps follow the Keycloak server admin guide for OIDC clients and the container guide for a local realm.

1. Open the realm, then Clients, then Create client. Set the client type to OpenID Connect and pick a client id.
2. Turn on Client authentication and Standard flow. Leave Direct access grants off for a normal browser login.
3. Set the root URL to your SeatRota origin. Add a valid redirect URI:
   - Team provider: `https://<your-host>/api/auth/callback/teams-oidc-team-<teamId>`
   - Instance provider: `https://<your-host>/api/auth/callback/teams-oidc-instance`
4. Copy the client secret from the Credentials tab. Paste the discovery URL, client id, secret, and scopes into SeatRota. The discovery URL for a realm is `https://<keycloak>/realms/<realm>/.well-known/openid-configuration`. Use `openid email profile` as the scopes unless you add more.
5. To map groups to team roles, add a Group Membership mapper on the client. Set the token claim name to `groups`, turn off full group path, and add the claim to the ID token. Put `groups` in the Group claim field on the SeatRota settings page, then add a row for each group name and role.
6. Add the email domain, publish the TXT record the page shows, and verify it. People from that domain join the team the next time they sign in. Turn on "Refuse password login" when password sign-in for that domain should stop.

A local server can be started with `start-dev` as described in the Keycloak container guide. Do not use development mode for a public host.

Sources: [Keycloak server admin: OIDC clients](https://www.keycloak.org/docs/latest/server_admin/#_oidc_clients), [Running Keycloak in a container](https://www.keycloak.org/server/containers), [next-auth OAuth provider](https://next-auth.js.org/configuration/providers/oauth).
