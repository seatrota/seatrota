#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 SeatRota contributors
#
# Start the Cal.diy Postgres compose file, migrate, boot `yarn dev`, wait
# until the web app returns HTTP 200, then stop the dev server and Postgres.
# Used by the workflow_dispatch job in .github/workflows/seatrota.yml.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

COMPOSE=(docker compose -f packages/prisma/docker-compose.yml)
LOG="${DEV_BOOT_LOG:-/tmp/seatrota-dev-boot.log}"
DEV_PID=""

if ! command -v docker >/dev/null 2>&1; then
  echo "dev-boot-smoke: docker is required" >&2
  exit 1
fi

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$DEV_PID" ]]; then
    kill -- -"$DEV_PID" 2>/dev/null || kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
  "${COMPOSE[@]}" down || true
  exit "$status"
}
trap cleanup EXIT

echo "dev-boot-smoke: starting Postgres"
"${COMPOSE[@]}" up -d

ready=0
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" -ne 1 ]]; then
  echo "dev-boot-smoke: Postgres did not become ready" >&2
  exit 1
fi

# The compose file creates cal-saml. .env.example uses a calendso database
# on the same server.
if ! "${COMPOSE[@]}" exec -T postgres psql -U postgres -d cal-saml -tAc \
  "SELECT 1 FROM pg_database WHERE datname='calendso'" | grep -q 1; then
  "${COMPOSE[@]}" exec -T postgres psql -U postgres -d cal-saml -c "CREATE DATABASE calendso"
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
fi
if [[ ! -f .env.appStore ]]; then
  cp .env.appStore.example .env.appStore
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:@localhost:5450/calendso}"
export DATABASE_DIRECT_URL="${DATABASE_DIRECT_URL:-$DATABASE_URL}"
export NEXTAUTH_URL="${NEXTAUTH_URL:-http://localhost:3000}"
export NEXT_PUBLIC_WEBAPP_URL="${NEXT_PUBLIC_WEBAPP_URL:-http://localhost:3000}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$(openssl rand -base64 32)}"
export CALENDSO_ENCRYPTION_KEY="${CALENDSO_ENCRYPTION_KEY:-$(openssl rand -base64 24)}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"

if [[ ! -d node_modules ]]; then
  echo "dev-boot-smoke: installing dependencies"
  yarn install --immutable
fi

echo "dev-boot-smoke: migrating"
yarn workspace @calcom/prisma db-deploy

echo "dev-boot-smoke: starting yarn dev"
set -m
yarn dev >"$LOG" 2>&1 &
DEV_PID=$!
set +m

code="000"
for i in $(seq 1 180); do
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "dev-boot-smoke: yarn dev exited before HTTP 200" >&2
    tail -n 120 "$LOG" >&2 || true
    exit 1
  fi
  code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ || true)"
  if [[ "$code" == "200" ]]; then
    echo "dev-boot-smoke: HTTP 200"
    exit 0
  fi
  if (( i % 6 == 0 )); then
    echo "dev-boot-smoke: still waiting (last HTTP ${code})"
  fi
  sleep 10
done

echo "dev-boot-smoke: timed out waiting for HTTP 200 (last HTTP ${code})" >&2
tail -n 120 "$LOG" >&2 || true
exit 1
