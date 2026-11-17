#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 SeatRota contributors
#
# Runs docs/QUICKSTART.md on a fresh clone, so the guide cannot drift from what
# works. Every fenced block whose language is listed in QUICKSTART_FENCES
# (default: sh) is extracted and run in document order, then the first-team
# steps are driven in a browser by scripts/quickstart-first-team.mjs.
#
# Usage: scripts/quickstart-smoke.sh [workdir]
#
# Two documented commands cannot run unchanged in CI, so they are wrapped:
#   - `git clone https://github.com/seatrota/seatrota.git` clones the commit
#     under test instead (the repository may be private).
#   - `docker compose ... up` without -d gets -d, so the script can go on.
#   - `docker pull <image>` is skipped when that image is already present
#     locally (CI tags its own build with the release name before a tag exists).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SHA="$(git -C "$ROOT" rev-parse HEAD)"
WORKDIR="${1:-$(mktemp -d)}"
FENCES="${QUICKSTART_FENCES:-sh}"
DOC="$ROOT/docs/QUICKSTART.md"
BASE_URL="http://localhost:3000"

SCRIPT="$WORKDIR/quickstart-steps.sh"
{
  echo "set -euo pipefail"
  for fence in $FENCES; do
    echo "# --- fenced \`$fence\` blocks from docs/QUICKSTART.md"
    awk -v fence="$fence" '
      $0 == "```" fence { inside = 1; next }
      inside && $0 == "```" { inside = 0; print ""; next }
      inside { print }
    ' "$DOC"
  done
} >"$SCRIPT"
echo "quickstart-smoke: commands taken from docs/QUICKSTART.md (fences: $FENCES):"
sed 's/^/  | /' "$SCRIPT"

git() {
  if [[ "${1:-}" == "clone" && "${2:-}" == "https://github.com/seatrota/seatrota.git" ]]; then
    command git clone -q "$ROOT" seatrota
    command git -C seatrota checkout -q "$SHA"
    echo "quickstart-smoke: cloned $SHA (in place of the GitHub URL)"
  else
    command git "$@"
  fi
}
docker() {
  if [[ "${1:-}" == "pull" ]] && command docker image inspect "${2:-}" >/dev/null 2>&1; then
    echo "quickstart-smoke: $2 is already present locally; pull skipped"
    return 0
  fi
  if [[ "${1:-}" == "compose" ]]; then
    local has_up=0
    for arg in "$@"; do [[ "$arg" == "up" ]] && has_up=1; done
    if [[ "$has_up" -eq 1 && " $* " != *" -d "* ]]; then
      command docker "$@" -d
      return
    fi
  fi
  command docker "$@"
}
export -f git docker
export ROOT SHA

cd "$WORKDIR"
bash "$SCRIPT"
cd "$WORKDIR/seatrota"

echo "quickstart-smoke: waiting for $BASE_URL/auth/login"
code=""
for _ in $(seq 1 120); do
  code="$(curl -sL -o /dev/null -w '%{http_code}' "$BASE_URL/auth/login" || true)"
  [[ "$code" == "200" ]] && break
  sleep 5
done
if [[ "$code" != "200" ]]; then
  echo "quickstart-smoke: the app did not answer 200 (last: $code)" >&2
  command docker compose -f docker/compose.yml logs --tail 200 seatrota || true
  exit 1
fi
echo "quickstart-smoke: login page answers 200, landing on $(curl -sL -o /dev/null -w '%{url_effective}' "$BASE_URL/auth/login")"

cron_key="$(sed -n 's/^CRON_API_KEY=//p' docker/seatrota.env)"
unauth="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/cron/teams-reminders")"
keyed="$(curl -s -X POST -H "authorization: $cron_key" "$BASE_URL/api/cron/teams-reminders")"
echo "quickstart-smoke: cron without key $unauth; with the generated key $keyed"
[[ "$unauth" == "401" ]]
[[ "$keyed" == *'"sent":'* ]]

# Run the browser check from the directory that has the playwright package.
NODE_DIR="${QUICKSTART_NODE_DIR:-$ROOT}"
cp "$ROOT/scripts/quickstart-first-team.mjs" "$NODE_DIR/quickstart-first-team.mjs" 2>/dev/null || true
node "$NODE_DIR/quickstart-first-team.mjs" "$BASE_URL"
echo "quickstart-smoke: pass"
