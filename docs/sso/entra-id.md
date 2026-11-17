# Microsoft Entra ID

Register an application in the Entra tenant and use the tenant's v2 OpenID configuration document.

1. In the Entra admin center, open App registrations and create a new registration. Set the platform to Web and the redirect URI:
   - Team provider: `https://<your-host>/api/auth/callback/teams-oidc-team-<teamId>`
   - Instance provider: `https://<your-host>/api/auth/callback/teams-oidc-instance`
2. Under Certificates & secrets, create a client secret. Copy the secret value immediately. In SeatRota, paste the application (client) id, the secret, and this discovery URL, replacing the tenant id: `https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration`. Scopes are `openid email profile`.
3. Optional group mapping: open Token configuration, add a groups claim, and include it in the ID token. Entra puts group object ids in the `groups` claim unless you change the group claim format. Map those ids (or the names, if you emit names) on the SeatRota settings page. Set the Group claim field to `groups`.
4. Verify the email domain with the TXT record. Turn on "Refuse password login" when that domain must use Entra.

Sources: [Microsoft identity platform OpenID Connect](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc), [Optional claims](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims), [next-auth OAuth provider](https://next-auth.js.org/configuration/providers/oauth).
