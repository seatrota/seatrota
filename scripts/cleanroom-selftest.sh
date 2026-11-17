#!/usr/bin/env bash
# Plants two fixtures and expects scripts/cleanroom-check.sh to fail on each,
# then pass once both are gone.
#
# 1. An untracked file under packages/teams-*, which the diff scan sees.
# 2. A gitignored file outside that diff, which only the whole-tree scan sees.
#
# The scanner also rejects the marker "Commercial License"; that string stays
# in this fixture script, which is on the documented exception list.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

DIFF_PLANT="$ROOT/packages/teams-core/cleanroom-planted-import.ts"
# gitignored, not hidden, and not on the whole-tree exception list.
TREE_PLANT="$ROOT/lint-results/cleanroom-outside-diff.txt"

cleanup() {
  rm -f "$DIFF_PLANT" "$TREE_PLANT"
}
trap cleanup EXIT

mkdir -p "$ROOT/packages/teams-core" "$ROOT/lint-results"

cat >"$DIFF_PLANT" <<'EOF'
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors
import "@calcom/ee/x";
EOF

set +e
diff_out="$(bash "$ROOT/scripts/cleanroom-check.sh" 2>&1)"
diff_status=$?
set -e

if [[ "$diff_status" -eq 0 ]]; then
  echo "cleanroom-selftest: expected failure on planted diff file" >&2
  printf '%s\n' "$diff_out" >&2
  exit 1
fi
if ! grep -F "packages/teams-core/cleanroom-planted-import.ts" <<<"$diff_out" >/dev/null; then
  echo "cleanroom-selftest: diff plant was not reported" >&2
  printf '%s\n' "$diff_out" >&2
  exit 1
fi
echo "cleanroom-selftest: cleanroom-check failed on the planted diff file (status ${diff_status})"
rm -f "$DIFF_PLANT"

printf '%s\n' 'import "@calcom/ee/outside-diff";' >"$TREE_PLANT"
if git ls-files --others --exclude-standard -- "$TREE_PLANT" | grep -q .; then
  echo "cleanroom-selftest: whole-tree plant is visible to the diff scan" >&2
  exit 1
fi
if git diff --name-only -- "$TREE_PLANT" | grep -q .; then
  echo "cleanroom-selftest: whole-tree plant is in the git diff" >&2
  exit 1
fi

set +e
tree_out="$(bash "$ROOT/scripts/cleanroom-check.sh" 2>&1)"
tree_status=$?
set -e

if [[ "$tree_status" -eq 0 ]]; then
  echo "cleanroom-selftest: expected failure on planted whole-tree file" >&2
  printf '%s\n' "$tree_out" >&2
  exit 1
fi
if ! grep -F "whole-tree hit lint-results/cleanroom-outside-diff.txt" <<<"$tree_out" >/dev/null; then
  echo "cleanroom-selftest: whole-tree plant was not reported by the whole-tree scan" >&2
  printf '%s\n' "$tree_out" >&2
  exit 1
fi
echo "cleanroom-selftest: cleanroom-check failed on the planted whole-tree file outside the diff (status ${tree_status})"
rm -f "$TREE_PLANT"
trap - EXIT

bash "$ROOT/scripts/cleanroom-check.sh"
echo "cleanroom-selftest: cleanroom-check passed after both planted files were removed"
