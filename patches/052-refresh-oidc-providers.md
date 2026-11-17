# 052 Refresh OIDC providers

`apps/web/pages/api/auth/[...nextauth].ts` awaits `refreshTeamsOidcProviders` before building the NextAuth options. The provider list is read from the database on each auth request, so a team can save a client without restarting the server.
