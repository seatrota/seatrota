#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 SeatRota contributors
#
# Checks the environment, applies database migrations, then starts the web app.
set -eu
cd /app

node /app/.seatrota/check-env.js

if [ "${SEATROTA_SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "seatrota: applying database migrations"
  yarn workspace @calcom/prisma prisma migrate deploy
fi

echo "seatrota: starting on port ${PORT:-3000}"
exec yarn workspace @calcom/web next start -p "${PORT:-3000}"
