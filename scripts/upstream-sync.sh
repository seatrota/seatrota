#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 SeatRota contributors
#
# Re-applies the SeatRota patch queue to a newer calcom/cal.diy commit.
#
# Usage: scripts/upstream-sync.sh [--dry-run] [--report FILE] <upstream-ref>
#
# <upstream-ref> is a commit SHA, branch or tag in calcom/cal.diy.
#
# What it does, all inside a throwaway scratch repository:
#   1. Snapshot check: the recorded upstream commit (UPSTREAM.md) has the same
#      tree as this repository's root snapshot commit.
#   2. Queue check: patches/*.patch, applied in C-locale order to the snapshot,
#      reproduce every non-owned file on the current branch byte for byte.
#      Owned paths are listed in scripts/seatrota-owned.txt.
#   3. Replay: the same patches are applied to <upstream-ref>. A patch that does
#      not apply cleanly is retried with a 3-way merge; if that also fails it
#      is reported as a conflict and skipped.
#
# --dry-run stops after the replay and changes nothing here. Without it, and
# only when every patch applied, the working tree becomes: the new upstream
# tree with patches applied, plus the owned paths unchanged. UPSTREAM.md is
# updated. Changes are staged, not committed, so they can be reviewed and
# tested first.
#
# Exit status: 0 success, 1 usage or setup error, 2 queue check failed,
# 3 at least one patch conflicted on the new upstream tree.
#
# UPSTREAM_MIRROR, when set, is an existing clone of calcom/cal.diy to use
# instead of a fresh shallow clone. Upstream history is never fetched into
# this repository; only the final tree's objects are.
set -euo pipefail

usage() {
  echo "usage: scripts/upstream-sync.sh [--dry-run] [--report FILE] <upstream-ref>"
}

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

DRY_RUN=0
REPORT=""
REF=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --report)
      REPORT="${2:-}"
      [[ -n "$REPORT" ]] || { usage >&2; exit 1; }
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      echo "upstream-sync: unknown option $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      [[ -z "$REF" ]] || { echo "upstream-sync: unexpected argument $1" >&2; exit 1; }
      REF="$1"
      shift
      ;;
  esac
done
[[ -n "$REF" ]] || { usage >&2; exit 1; }

[[ -f UPSTREAM.md ]] || { echo "upstream-sync: UPSTREAM.md is missing" >&2; exit 1; }
CURRENT="$(sed -n 's/^- SHA: //p' UPSTREAM.md | head -n 1)"
SOURCE="$(sed -n 's/^- Source: //p' UPSTREAM.md | head -n 1)"
[[ -n "$CURRENT" && -n "$SOURCE" ]] || { echo "upstream-sync: UPSTREAM.md is missing SHA or Source" >&2; exit 1; }
SNAPSHOT="$(git rev-list --max-parents=0 HEAD | tail -n 1)"
HEAD_SHA="$(git rev-parse HEAD)"

OWNED=()
REMOVE=()
while IFS= read -r line; do
  line="${line%%#*}"
  line="$(printf '%s' "$line" | sed 's/[[:space:]]*$//')"
  [[ -n "$line" ]] || continue
  if [[ "$line" == remove:* ]]; then
    REMOVE+=("$(printf '%s' "${line#remove:}" | sed 's/^[[:space:]]*//')")
  else
    OWNED+=("$line")
  fi
done <scripts/seatrota-owned.txt
EXCLUDES=()
for path in "${OWNED[@]}"; do EXCLUDES+=(":(exclude)$path"); done

shopt -s nullglob
PATCHES=(patches/*.patch patches/*.diff)
shopt -u nullglob
mapfile -t PATCHES < <(printf '%s\n' "${PATCHES[@]}" | LC_ALL=C sort)

WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

if [[ -n "${UPSTREAM_MIRROR:-}" ]]; then
  MIRROR="$UPSTREAM_MIRROR"
  echo "upstream-sync: using mirror $MIRROR"
else
  MIRROR="$WORK/mirror"
  echo "upstream-sync: cloning $SOURCE (shallow, since 2026-04-16)"
  git clone -q --shallow-since=2026-04-16 --no-tags "$SOURCE.git" "$MIRROR"
fi
git -C "$MIRROR" fetch -q --no-tags origin "$REF" 2>/dev/null || true
NEW="$(git -C "$MIRROR" rev-parse --verify -q "$REF^{commit}" || git -C "$MIRROR" rev-parse --verify -q "origin/$REF^{commit}" || true)"
[[ -n "$NEW" ]] || { echo "upstream-sync: $REF is not in the mirror" >&2; exit 1; }
git -C "$MIRROR" cat-file -e "$CURRENT^{commit}" 2>/dev/null || {
  echo "upstream-sync: recorded SHA $CURRENT is not in the mirror" >&2
  exit 1
}
NEW_DATE="$(git -C "$MIRROR" log -1 --format=%cI "$NEW")"

SCRATCH="$WORK/scratch"
git init -q "$SCRATCH"
sgit() { git -C "$SCRATCH" -c user.name=upstream-sync -c user.email=sync@localhost -c core.autocrlf=false "$@"; }
# Borrow objects from this repository and the mirror instead of fetching them.
ROOT_OBJECTS="$(git rev-parse --path-format=absolute --git-common-dir)/objects"
MIRROR_OBJECTS="$(git -C "$MIRROR" rev-parse --path-format=absolute --git-common-dir)/objects"
{
  echo "$ROOT_OBJECTS"
  echo "$MIRROR_OBJECTS"
} >"$SCRATCH/.git/objects/info/alternates"

RESULTS=()
note() { RESULTS+=("$1"); echo "upstream-sync: $1"; }

write_report() {
  [[ -n "$REPORT" ]] || return 0
  {
    echo "# Upstream sync report"
    echo
    echo "- Current upstream: \`$CURRENT\`"
    echo "- Target upstream: \`$NEW\` ($NEW_DATE, from \`$REF\`)"
    echo "- Branch head: \`$HEAD_SHA\`"
    echo "- Patches: ${#PATCHES[@]}"
    echo
    for line in "${RESULTS[@]}"; do echo "- $line"; done
  } >"$REPORT"
}

# 1. Snapshot check.
if sgit diff --quiet "$CURRENT^{tree}" "$SNAPSHOT^{tree}"; then
  note "snapshot check: root commit ${SNAPSHOT:0:12} has the tree of upstream ${CURRENT:0:12}"
else
  note "snapshot check: root commit differs from upstream ${CURRENT:0:12} in $(sgit diff --name-only "$CURRENT" "$SNAPSHOT" | wc -l | tr -d ' ') files"
fi

# 2. Queue check on the snapshot.
sgit checkout -q --detach "$SNAPSHOT"
for patch in "${PATCHES[@]}"; do
  if ! sgit apply --index --whitespace=nowarn "$ROOT/$patch"; then
    note "queue check: FAILED, $patch does not apply to the snapshot"
    write_report
    exit 2
  fi
  sgit commit -q --allow-empty -m "replay $patch"
done
for path in "${REMOVE[@]}"; do sgit rm -q --cached --ignore-unmatch -- "$path" >/dev/null; done
sgit commit -q --allow-empty -m "replay removals"
MISMATCH="$(sgit diff --name-only HEAD "$HEAD_SHA" -- . "${EXCLUDES[@]}")"
if [[ -n "$MISMATCH" ]]; then
  note "queue check: FAILED, the queue does not reproduce $(printf '%s\n' "$MISMATCH" | wc -l | tr -d ' ') non-owned files"
  printf '%s\n' "$MISMATCH" | sed 's/^/upstream-sync:   /' | head -n 50
  RESULTS+=("unreproduced files: $(printf '%s ' $MISMATCH | head -c 2000)")
  write_report
  exit 2
fi
note "queue check: ${#PATCHES[@]} patches reproduce every non-owned file on ${HEAD_SHA:0:12}"

# 3. Replay on the target upstream commit.
sgit checkout -q -f --detach "$NEW"
sgit clean -qfdx
CONFLICTS=0
for patch in "${PATCHES[@]}"; do
  if sgit apply --index --whitespace=nowarn "$ROOT/$patch" 2>/dev/null; then
    note "replay: $patch applied cleanly"
  elif sgit apply --index --3way --whitespace=nowarn "$ROOT/$patch" >/dev/null 2>&1; then
    note "replay: $patch applied with a 3-way merge"
  else
    files="$(sgit diff --name-only --diff-filter=U | tr '\n' ' ')"
    note "replay: CONFLICT in $patch ${files:+(files: $files)}"
    CONFLICTS=$((CONFLICTS + 1))
    sgit reset -q --hard
    sgit clean -qfd
    continue
  fi
  sgit commit -q --allow-empty -m "replay $patch"
done
for path in "${REMOVE[@]}"; do sgit rm -q -r --ignore-unmatch -- "$path" >/dev/null; done

if [[ "$CONFLICTS" -gt 0 ]]; then
  note "result: $CONFLICTS of ${#PATCHES[@]} patches conflict on ${NEW:0:12}; resolve them before syncing"
  write_report
  exit 3
fi
note "result: all ${#PATCHES[@]} patches apply to ${NEW:0:12}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  note "dry run: no changes made"
  write_report
  exit 0
fi

# Build the final tree: patched upstream plus SeatRota's owned paths, then
# bring only that tree (not upstream history) into this repository.
[[ -z "$(git status --porcelain)" ]] || { echo "upstream-sync: the working tree is not clean" >&2; exit 1; }
sgit commit -q --allow-empty -m "removals"
sgit rm -q -r --cached --ignore-unmatch -- "${OWNED[@]}" >/dev/null
for path in "${OWNED[@]}"; do sgit checkout "$HEAD_SHA" -- "$path" 2>/dev/null || true; done
TREE="$(sgit write-tree)"
RESULT="$(sgit commit-tree "$TREE" -m "upstream-sync result for ${NEW:0:12}")"
git fetch -q --no-tags "$SCRATCH" "$RESULT"
git restore --source="$RESULT" --staged --worktree -- :/

TMP="$(mktemp)"
awk -v sha="$NEW" -v date="$NEW_DATE" '
  /^- SHA: / { print "- SHA: " sha; next }
  /^- Date: / { print "- Date: " date; next }
  { print }
' UPSTREAM.md >"$TMP"
mv "$TMP" UPSTREAM.md
git add UPSTREAM.md
note "synced: working tree now holds upstream ${NEW:0:12} with the patch queue; UPSTREAM.md updated"
note "next: yarn install (refreshes yarn.lock), then lint, type-check, tests, both clean-room scripts, and commit on a branch"
write_report
