#!/usr/bin/env bash
# Plants a temporary import of '@calcom/ee/x' and expects scripts/cleanroom-check.sh to fail.
# The scanner also rejects the marker "Commercial License"; that string stays in this fixture script.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

PLANT="$ROOT/packages/teams-core/cleanroom-planted-import.ts"
cleanup() {
  rm -f "$PLANT"
}
trap cleanup EXIT

cat >"$PLANT" <<'EOF'
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors
import "@calcom/ee/x";
EOF

set +e
bash "$ROOT/scripts/cleanroom-check.sh"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  echo "cleanroom-selftest: expected failure on planted @calcom/ee/x import" >&2
  exit 1
fi
echo "cleanroom-selftest: cleanroom-check failed on the planted @calcom/ee/x import (status ${status})"

rm -f "$PLANT"
trap - EXIT

bash "$ROOT/scripts/cleanroom-check.sh"
echo "cleanroom-selftest: cleanroom-check passed after the planted import was removed"
