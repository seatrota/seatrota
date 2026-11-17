# Single sign-on

SeatRota signs people in with a generic OpenID Connect provider. Each team can keep its own client, or one client can cover the whole instance. The client secret is encrypted with `CALENDSO_ENCRYPTION_KEY` before it is stored.

The discovery URL is the issuer's OpenID configuration document, or the issuer URL. SeatRota asks the provider for that document and uses the authorization, token, and key endpoints inside it.

After a domain is verified, a person who signs in with an email on that domain joins the team. If the provider sends a group claim, mappings on the team settings page choose owner, admin, or member. With the claim left blank, a new person joins as a member. Turn on "Refuse password login" to block password sign-in for verified domains.

Self-hosted installs keep SSO available. Set `SEATROTA_SSO_ENABLED=0` to turn the plan flag off.

The sign-in callback is `/api/auth/callback/teams-oidc-team-<teamId>` for a team provider and `/api/auth/callback/teams-oidc-instance` for the instance provider. The team settings page prints the matching sign-in link.

Domain proof is a DNS TXT record. The settings page shows the host and the value, in this shape:

```text
_seatrota.example.com.  TXT  "seatrota-verify=<token>"
```

Provider notes:

- [Keycloak](./keycloak.md)
- [Authentik](./authentik.md)
- [Google Workspace](./google-workspace.md)
- [Microsoft Entra ID](./entra-id.md)
