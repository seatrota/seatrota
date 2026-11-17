# Upstream sync

SeatRota is a thin fork of a squashed Cal.diy snapshot. Every SeatRota edit to an upstream file lives in `patches/NNN-name.patch`, and SeatRota's own files are listed in `scripts/seatrota-owned.txt`. Moving to a newer Cal.diy commit means replaying those patches.

```sh
# Check only; changes nothing.
scripts/upstream-sync.sh --dry-run --report /tmp/sync.md <cal.diy SHA, tag or branch>

# Sync on a clean branch.
git switch -c upstream-sync/<short-sha>
scripts/upstream-sync.sh <cal.diy SHA>
yarn install
# lint, type-check, unit tests, e2e, scripts/cleanroom-check.sh, scripts/cleanroom-selftest.sh
git commit -m "chore: sync upstream to <short-sha>"
```

## Report lines

- `snapshot check`: whether the root commit has the same tree as the upstream SHA recorded in `UPSTREAM.md`.
- `queue check`: whether the patches reproduce the current branch. If it fails, an upstream file was edited without a patch. Record the edit as a patch and run again.
- `replay: … applied cleanly`, `… with a 3-way merge`, or `CONFLICT in …`.

## Exit status

| Status | Meaning |
| --- | --- |
| 0 | Success. |
| 1 | Usage error, or the ref is unknown. |
| 2 | The queue check failed. |
| 3 | At least one patch conflicts on the new upstream tree. |

## When a patch conflicts

1. Check out the new upstream commit in a scratch clone.
2. Apply the patches before the conflicting one.
3. Make the conflicting patch's change by hand.
4. Regenerate the patch with `git diff`.
5. Regenerate every later patch that touches the same files. Each patch must apply to the state the earlier ones leave behind.

Then run the dry run again. CI runs the dry run on every pull request, against the recorded SHA (it must pass) and against upstream `main` (report only, written to the job summary).
