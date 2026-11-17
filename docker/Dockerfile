# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 SeatRota contributors
#
# SeatRota container image: the Cal.diy web app with the SeatRota teams
# packages. Build from the repository root:
#   docker build -f docker/Dockerfile -t seatrota:local .
# All secrets are read at run time from the environment; see docker/seatrota.env.example.

FROM node:22-bookworm AS build
WORKDIR /app

# NEXT_PUBLIC_* values are compiled into the client bundle, so the public URL is a build argument.
ARG NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000
ENV NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL \
    NEXT_PUBLIC_WEBSITE_URL=$NEXT_PUBLIC_WEBAPP_URL \
    NEXTAUTH_URL=$NEXT_PUBLIC_WEBAPP_URL \
    NODE_OPTIONS=--max-old-space-size=8192 \
    NEXT_TELEMETRY_DISABLED=1 \
    CALCOM_TELEMETRY_DISABLED=1 \
    HUSKY=0 \
    DATABASE_URL="" \
    NEXTAUTH_SECRET=build-time-placeholder \
    CALENDSO_ENCRYPTION_KEY=build-time-placeholder-32-bytes!

COPY . .
RUN corepack enable \
 && yarn install --immutable \
 && yarn build \
 && node node_modules/typescript/bin/tsc packages/teams-billing/check-env.ts \
      --outDir /app/.seatrota --module commonjs --target es2020 --types node --skipLibCheck --esModuleInterop \
 && rm -rf node_modules/.cache apps/web/.next/cache .yarn/cache

FROM node:22-bookworm-slim AS run
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates wget \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    CALCOM_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY --from=build --chown=node:node /app /app
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/seatrota-entrypoint
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
  CMD wget -q --spider "http://127.0.0.1:${PORT}/auth/login" || exit 1
ENTRYPOINT ["seatrota-entrypoint"]
