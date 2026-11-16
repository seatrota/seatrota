#!/usr/bin/env bash
# Scan SeatRota changes against the Cal.diy snapshot for clean-room violations.
# Usage: scripts/cleanroom-check.sh [base-ref]
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BASE_REF="${1:-}"
if [[ -z "$BASE_REF" ]]; then
  BASE_REF="$(git log --format=%H --grep='^snapshot: calcom/cal.diy@' -n 1)"
fi
if [[ -z "$BASE_REF" ]]; then
  echo "cleanroom-check: no base ref and no snapshot commit found" >&2
  exit 1
fi
if ! git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null; then
  echo "cleanroom-check: base ref not found: $BASE_REF" >&2
  exit 1
fi

# Scan patterns live here. Fixed-string search, not a regex.
SCAN_PATTERNS=(
  '@calcom/ee'
  'features/ee'
  '/ee/'
  'packages/ee'
  'LicenseRef-'
  'Commercial License'
  'licenseKey'
  'checkLicense'
)

# This script and the self-test (which plants a fixture containing the patterns)
# are excluded so the pattern list and the planted import string are not self-hits.
EXCLUDE_PATHS=(
  'scripts/cleanroom-check.sh'
  'scripts/cleanroom-selftest.sh'
)

is_excluded() {
  local path="$1"
  local excluded
  for excluded in "${EXCLUDE_PATHS[@]}"; do
    if [[ "$path" == "$excluded" ]]; then
      return 0
    fi
  done
  return 1
}

FAILURES=0
note_failure() {
  FAILURES=$((FAILURES + 1))
  echo "cleanroom-check: $*" >&2
}

mapfile -t CHANGED < <(
  {
    git diff --name-only --diff-filter=ACMR "$BASE_REF" --
    git ls-files --others --exclude-standard
  } | sed '/^$/d' | sort -u
)

echo "cleanroom-check: base ${BASE_REF}"

# (a) Import and path scan of added lines, plus full contents of untracked files.
for file in "${CHANGED[@]}"; do
  if is_excluded "$file"; then
    continue
  fi
  if [[ ! -f "$file" ]]; then
    continue
  fi
  hits=""
  if git cat-file -e "$BASE_REF:$file" 2>/dev/null; then
    # Modified upstream file: scan only lines we added.
    added="$(git diff -U0 --no-color "$BASE_REF" -- "$file" | grep -E '^\+' | grep -v '^+++' || true)"
    if [[ -n "$added" ]]; then
      hits="$(printf '%s\n' "$added" | grep -F -n "${SCAN_PATTERNS[@]/#/-e}" || true)"
    fi
  else
    hits="$(grep -F -I -n "${SCAN_PATTERNS[@]/#/-e}" -- "$file" || true)"
  fi
  if [[ -n "$hits" ]]; then
    note_failure "forbidden marker in ${file}"
    printf '%s\n' "$hits" >&2
  fi
done

# (b) Header scan of new files only.
mapfile -t NEW_FILES < <(
  {
    git diff --name-only --diff-filter=A "$BASE_REF" --
    git ls-files --others --exclude-standard
  } | sed '/^$/d' | sort -u
)

for file in "${NEW_FILES[@]}"; do
  if is_excluded "$file"; then
    continue
  fi
  if [[ ! -f "$file" ]]; then
    continue
  fi
  if grep -F -I -q 'Cal.com, Inc.' -- "$file"; then
    note_failure "new file ${file} contains a Cal.com copyright header"
  fi
  case "$file" in
    packages/teams-*.ts | packages/teams-*.tsx | packages/teams-*.js | packages/teams-*/*)
      case "$file" in
        *.ts | *.tsx | *.js)
          if ! grep -F -q '// SPDX-License-Identifier: AGPL-3.0-only' -- "$file"; then
            note_failure "new teams source ${file} is missing the AGPL SPDX header"
          fi
          ;;
      esac
      ;;
  esac
done

# (c) jscpd of packages/teams-* against the rest of the tree (the upstream MIT sources).
resolve_bin() {
  local name="$1"
  local bundled="/tmp/cleanroom-tools/node_modules/.bin/${name}"
  if [[ -x "$bundled" ]]; then
    echo "$bundled"
    return
  fi
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return
  fi
  mkdir -p /tmp/cleanroom-tools
  npm install --prefix /tmp/cleanroom-tools jscpd@5.4.3 license-checker@25.0.1 >/dev/null
  echo "/tmp/cleanroom-tools/node_modules/.bin/${name}"
}

JSCPD="$(resolve_bin jscpd)"
LICENSE_CHECKER="$(resolve_bin license-checker)"
JSCPD_OUT="$(mktemp -d)"
"$JSCPD" \
  --min-tokens 40 \
  --reporters json,silent \
  --output "$JSCPD_OUT" \
  --silent \
  --absolute \
  --no-tips \
  --format typescript,javascript,tsx,jsx \
  --ignore '**/node_modules/**,**/.yarn/**,**/.next/**,**/dist/**,**/.git/**,**/coverage/**,**/*.lock' \
  "$ROOT" >/dev/null

node - "$JSCPD_OUT/jscpd-report.json" <<'EOF' || note_failure "jscpd reported teams clones against the upstream tree (see above)"
const fs = require("node:fs");
const reportPath = process.argv[2];
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const marker = "/packages/teams-";
const hits = [];
for (const dup of report.duplicates || []) {
  const first = dup.firstFile?.name || "";
  const second = dup.secondFile?.name || "";
  const firstTeams = first.includes(marker);
  const secondTeams = second.includes(marker);
  if (firstTeams === secondTeams) continue;
  if ((dup.tokens || 0) < 40) continue;
  hits.push({ tokens: dup.tokens, lines: dup.lines, first, second });
}
if (hits.length === 0) {
  console.log("cleanroom-check: jscpd found no teams clones (min 40 tokens)");
  process.exit(0);
}
console.error(`cleanroom-check: jscpd hits ${hits.length}`);
for (const hit of hits) {
  console.error(`  tokens=${hit.tokens} lines=${hit.lines}`);
  console.error(`    ${hit.first}`);
  console.error(`    ${hit.second}`);
}
process.exit(1);
EOF

# (d) license-checker on dependencies added since the snapshot.
DEP_LIST="$(mktemp)"
set +e
node - "$BASE_REF" "$DEP_LIST" <<'EOF'
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const base = process.argv[2];
const outPath = process.argv[3];

function show(path) {
  try {
    return execFileSync("git", ["show", `${base}:${path}`], { encoding: "utf8" });
  } catch {
    return null;
  }
}

function listPackageJsons(ref) {
  const listing = execFileSync("git", ["ls-tree", "-r", "--name-only", ref], { encoding: "utf8" });
  return listing.split("\n").filter((path) => path === "package.json" || path.endsWith("/package.json"));
}

function readDeps(pkg) {
  const names = new Map();
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const block = pkg[field] || {};
    for (const [name, version] of Object.entries(block)) {
      names.set(name, String(version));
    }
  }
  return names;
}

const snapshotDeps = new Set();
const snapshotNames = new Set();
for (const path of listPackageJsons(base)) {
  const raw = show(path);
  if (!raw) continue;
  const pkg = JSON.parse(raw);
  if (pkg.name) snapshotNames.add(pkg.name);
  for (const name of readDeps(pkg).keys()) snapshotDeps.add(name);
}

function currentPackageJsons() {
  const tracked = execFileSync("git", ["ls-files", "-z", "*.json"], { encoding: "utf8" })
    .split("\0")
    .filter((path) => path === "package.json" || path.endsWith("/package.json"));
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter((path) => path === "package.json" || path.endsWith("/package.json"));
  return [...new Set([...tracked, ...untracked])];
}

const added = [];
for (const path of currentPackageJsons()) {
  if (!fs.existsSync(path)) continue;
  const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
  for (const [name, version] of readDeps(pkg)) {
    if (snapshotDeps.has(name)) continue;
    added.push({ name, version, path });
  }
}

const calcomMissing = added.filter(
  (dep) => dep.name.startsWith("@calcom/") && !snapshotNames.has(dep.name)
);
if (calcomMissing.length > 0) {
  for (const dep of calcomMissing) {
    console.error(
      `cleanroom-check: added @calcom package not in the snapshot: ${dep.name}@${dep.version} (${dep.path})`
    );
  }
  process.exit(2);
}

const lines = added.map((dep) => `${dep.name}\t${dep.version}\t${dep.path}`);
fs.writeFileSync(outPath, lines.join("\n") + (lines.length ? "\n" : ""));
console.log(`cleanroom-check: added dependencies ${added.length}`);
EOF
dep_status=$?
set -e
if [[ "$dep_status" -ne 0 ]]; then
  note_failure "dependency scan failed"
fi

ALLOW='MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD;AGPL-3.0'
if [[ ! -s "$DEP_LIST" ]]; then
  EMPTY_DIR="$(mktemp -d)"
  printf '%s\n' '{"name":"seatrota-added-deps","version":"0.0.0","license":"MIT"}' >"$EMPTY_DIR/package.json"
  mkdir -p "$EMPTY_DIR/node_modules"
  if ! "$LICENSE_CHECKER" --start "$EMPTY_DIR" --onlyAllow "$ALLOW"; then
    note_failure "license-checker --onlyAllow rejected the added-dependency set"
  fi
else
  PKG_ARGS=""
  while IFS=$'\t' read -r name version path; do
    [[ -z "$name" ]] && continue
    if [[ "$version" == workspace:* ]]; then
      license="$(node -e 'const fs=require("fs"); const path=require("path"); const roots=["packages","apps","example-apps"]; let found=""; function walk(dir){ if(!fs.existsSync(dir)) return; for (const entry of fs.readdirSync(dir)){ const full=path.join(dir, entry, "package.json"); if(fs.existsSync(full)){ const pkg=JSON.parse(fs.readFileSync(full,"utf8")); if(pkg.name===process.argv[1]) found=pkg.license||""; } } } for (const root of roots) walk(root); if(!found) process.exit(3); process.stdout.write(found);' "$name")" || {
        note_failure "could not read license for workspace dependency ${name} from ${path}"
        continue
      }
      case ";${ALLOW};" in
        *";${license};"*) ;;
        *) note_failure "workspace dependency ${name} license ${license} is not allowed" ;;
      esac
      continue
    fi
    spec="${name}@${version}"
    if [[ -n "$PKG_ARGS" ]]; then
      PKG_ARGS="${PKG_ARGS};${spec}"
    else
      PKG_ARGS="$spec"
    fi
  done <"$DEP_LIST"
  if [[ -n "$PKG_ARGS" ]]; then
    if ! "$LICENSE_CHECKER" --start "$ROOT" --onlyAllow "$ALLOW" --packages "$PKG_ARGS"; then
      note_failure "license-checker --onlyAllow rejected added dependencies"
    fi
  fi
fi

if [[ "$FAILURES" -ne 0 ]]; then
  echo "cleanroom-check: ${FAILURES} failure(s)" >&2
  exit 1
fi

echo "cleanroom-check: pass"
