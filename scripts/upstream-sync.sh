#!/usr/bin/env bash
# Sync this tree to a newer calcom/cal.diy commit.
# Usage: scripts/upstream-sync.sh [--dry-run] <new-sha>
#
# Builds the diff in a temporary clone created with
#   git clone --shallow-since=2026-04-16
# then applies it with git apply and re-applies patches/*.patch and patches/*.diff.
# --dry-run checks the diff and does not change the worktree or UPSTREAM.md.
#
# UPSTREAM_MIRROR, when set, uses that existing clone instead of cloning again.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

DRY_RUN=0
NEW_SHA=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h | --help)
      echo "usage: scripts/upstream-sync.sh [--dry-run] <new-sha>"
      exit 0
      ;;
    *)
      if [[ -n "$NEW_SHA" ]]; then
        echo "upstream-sync: unexpected argument $1" >&2
        exit 1
      fi
      NEW_SHA="$1"
      shift
      ;;
  esac
done

if [[ -z "$NEW_SHA" ]]; then
  echo "usage: scripts/upstream-sync.sh [--dry-run] <new-sha>" >&2
  exit 1
fi

if [[ ! -f UPSTREAM.md ]]; then
  echo "upstream-sync: UPSTREAM.md is missing" >&2
  exit 1
fi

CURRENT="$(sed -n 's/^- SHA: //p' UPSTREAM.md | head -n 1)"
SOURCE="$(sed -n 's/^- Source: //p' UPSTREAM.md | head -n 1)"
if [[ -z "$CURRENT" || -z "$SOURCE" ]]; then
  echo "upstream-sync: UPSTREAM.md is missing SHA or Source" >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

if [[ -n "${UPSTREAM_MIRROR:-}" ]]; then
  MIRROR="$UPSTREAM_MIRROR"
  echo "upstream-sync: using existing mirror $MIRROR"
else
  MIRROR="$WORKDIR/cal.diy"
  echo "upstream-sync: cloning ${SOURCE} --shallow-since=2026-04-16"
  git clone --shallow-since=2026-04-16 --single-branch --no-tags "$SOURCE.git" "$MIRROR"
fi

if ! git -C "$MIRROR" cat-file -e "${CURRENT}^{commit}" 2>/dev/null; then
  echo "upstream-sync: recorded SHA ${CURRENT} is not in the shallow mirror" >&2
  exit 1
fi
if ! git -C "$MIRROR" cat-file -e "${NEW_SHA}^{commit}" 2>/dev/null; then
  echo "upstream-sync: ${NEW_SHA} is not in the shallow mirror" >&2
  exit 1
fi

FULL="$(git -C "$MIRROR" rev-parse "${NEW_SHA}^{commit}")"
DATE="$(git -C "$MIRROR" log -1 --format=%cI "$FULL")"
DIFF="$WORKDIR/upstream.diff"
git -C "$MIRROR" diff --binary "$CURRENT" "$FULL" >"$DIFF"
echo "upstream-sync: diff ${CURRENT}..${FULL} ($(wc -c <"$DIFF") bytes) date ${DATE}"

shopt -s nullglob
PATCHES=(patches/*.patch patches/*.diff)
IFS=$'\n' PATCHES=($(printf '%s\n' "${PATCHES[@]}" | sort))
shopt -u nullglob

if [[ "$DRY_RUN" -eq 1 ]]; then
  if [[ -s "$DIFF" ]]; then
    git apply --check "$DIFF"
    echo "upstream-sync: dry-run apply check passed"
  else
    echo "upstream-sync: dry-run diff is empty"
  fi
  if [[ "${#PATCHES[@]}" -eq 0 ]]; then
    echo "upstream-sync: dry-run would re-apply no patch files"
  else
    for patch in "${PATCHES[@]}"; do
      echo "upstream-sync: dry-run would reverse and re-apply ${patch}"
    done
  fi
  echo "upstream-sync: dry-run would set SHA ${FULL} DATE ${DATE}"
  exit 0
fi

for patch in "${PATCHES[@]}"; do
  echo "upstream-sync: reversing ${patch}"
  git apply -R "$patch"
done

if [[ -s "$DIFF" ]]; then
  echo "upstream-sync: applying upstream diff"
  git apply "$DIFF"
else
  echo "upstream-sync: upstream diff is empty"
fi

for patch in "${PATCHES[@]}"; do
  echo "upstream-sync: re-applying ${patch}"
  git apply "$patch"
done

TMP_UPSTREAM="$(mktemp)"
awk -v sha="$FULL" -v date="$DATE" '
  /^- SHA: / { print "- SHA: " sha; next }
  /^- Date: / { print "- Date: " date; next }
  { print }
' UPSTREAM.md >"$TMP_UPSTREAM"
mv "$TMP_UPSTREAM" UPSTREAM.md
echo "upstream-sync: updated UPSTREAM.md to ${FULL} (${DATE})"
