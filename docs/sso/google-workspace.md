# Google Workspace

Google signs users in with the OpenID Connect endpoints on `accounts.google.com`. Create a web OAuth client in a Google Cloud project that the Workspace admin allows.

1. In Google Cloud Console, open APIs & Services, then Credentials, then Create credentials, then OAuth client ID. Choose Web application.
2. Add an authorized redirect URI:
   - Team provider: `https://<your-host>/api/auth/callback/teams-oidc-team-<teamId>`
   - Instance provider: `https://<your-host>/api/auth/callback/teams-oidc-instance`
3. Copy the client id and client secret into SeatRota. Set the discovery URL to `https://accounts.google.com/.well-known/openid-configuration`. Scopes are `openid email profile`.
4. On the OAuth consent screen, add the same scopes. A Workspace admin may need to mark the app as internal so only people in the organization can consent.
5. Verify the Workspace email domain with the TXT record. People with a verified address join the team when they sign in.

Google's ID token does not include Workspace group membership, and SeatRota does not call the Directory API or the Cloud Identity Groups API to look groups up. Leave the group claim empty unless an identity broker in front of Google (for example Keycloak or Authentik federating Google) adds a groups claim. New members then join as members, and an owner can change roles on the team page. The token's `hd` claim names the Workspace domain, but SeatRota decides team joins from the verified email domain, not from `hd`. Turn on "Refuse password login" when that domain must use Google.

Sources: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [next-auth OAuth provider](https://next-auth.js.org/configuration/providers/oauth).
