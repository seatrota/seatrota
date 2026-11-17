# Upstream

- Source: https://github.com/calcom/cal.diy
- SHA: ae027bb70e694e2d2c44569f398d6cbcee0389b1
- Date: 2026-11-13T19:35:06Z

This tree started as a depth-1 export of that commit. The SeatRota git history does not contain calcom/cal.diy history.

## Sync method

Updates are built in a throwaway scratch repository. That repository borrows objects from this repository and from a shallow mirror of calcom/cal.diy (`git clone --shallow-since=2026-04-16`). Upstream history is never fetched into this repository; only the objects of the final tree are.

`scripts/upstream-sync.sh [--dry-run] [--report FILE] <upstream-ref>` does the following:

1. **Snapshot check.** Confirms that the import commit (`snapshot: calcom/cal.diy@<sha>`) has the tree of the SHA recorded above.
2. **Queue check.** Applies `patches/*.patch` in C-locale order to that upstream commit and confirms the result matches every file on the current branch, except the SeatRota-owned paths listed in `scripts/seatrota-owned.txt`.
3. **Replay.** Applies the same patches to `<upstream-ref>`. A patch that does not apply directly is retried as a 3-way merge. If that also fails, it is reported as a conflict.
4. **Sync** (without `--dry-run`, and only when nothing conflicts). Replaces the working tree with the patched upstream tree plus the owned paths, then updates the SHA and date in this file. Changes are staged and not committed.

CI runs a dry run on every pull request: against the recorded SHA, where it must pass, and against upstream `main`, as a report only. See `docs/upstream-sync.md`.
