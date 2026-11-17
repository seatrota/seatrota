# 054 SSO CI

Both SeatRota jobs check out with `fetch-depth: 0` so `scripts/cleanroom-check.sh` can find the snapshot commit.

The Keycloak job starts Postgres as a service container. GitHub Actions service containers cannot pass Keycloak's `start-dev` command, so the job starts `quay.io/keycloak/keycloak:26.0.7` with `docker run ... start-dev` and the e2e imports `packages/teams-sso/e2e/realm-seatrota.json` through the admin API.
