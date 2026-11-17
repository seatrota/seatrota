# Authentik

Create an OAuth2/OpenID provider and an application that uses it. Authentik publishes a discovery document for each provider.

1. In Authentik, create an OAuth2/OpenID Provider. Choose a confidential client, and set the redirect URI:
   - Team provider: `https://<your-host>/api/auth/callback/teams-oidc-team-<teamId>`
   - Instance provider: `https://<your-host>/api/auth/callback/teams-oidc-instance`
2. Copy the client id and client secret. Create an application that uses this provider and note the provider slug.
3. In SeatRota, set the discovery URL to `https://<authentik>/application/o/<slug>/.well-known/openid-configuration`. Scopes are `openid email profile`. Add `groups` as well when you want group names in the token. Authentik documents a `groups` scope that adds the user's groups to the token.
4. Set the Group claim to `groups` and add one mapping per group name. Leave the claim blank if everyone on the verified domain should join as a member.
5. Verify the email domain with the TXT record on the settings page. Turn on "Refuse password login" when that domain must use Authentik.

Sources: [Authentik OAuth2 provider](https://docs.goauthentik.io/docs/providers/oauth2/), [next-auth OAuth provider](https://next-auth.js.org/configuration/providers/oauth).
