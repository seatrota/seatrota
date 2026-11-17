# 051 NextAuth provider registry

`packages/features/auth/lib/next-auth-options.ts` calls `registerTeamsOidcProviders` once. That call appends the generic OIDC providers and wraps sign-in and JWT handling. The IdP list, discovery, and provisioning stay in `@seatrota/teams-sso`.

Password login calls `assertTeamsPasswordLoginAllowed` before the password check. The auth unit test mocks that function so existing credential cases stay unchanged.
