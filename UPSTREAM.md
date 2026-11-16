# Upstream

- Source: https://github.com/calcom/cal.diy
- SHA: ae027bb70e694e2d2c44569f398d6cbcee0389b1
- Date: 2026-11-13T19:35:06Z

This tree started as a depth-1 export of that commit. The SeatRota git history does not contain calcom/cal.diy history.

## Sync method

Future updates are produced in a separate mirror, never by fetching the full upstream history into this repository.

1. Clone https://github.com/calcom/cal.diy with `git clone --shallow-since=2026-04-16` into a temporary directory.
2. In that mirror, run `git diff <recorded SHA> <new SHA>` (with `--binary`).
3. Apply that diff to this working tree with `git apply`.
4. Re-apply the patch queue under `patches/`: any `patches/*.patch` and `patches/*.diff`, in sorted order. `patches/*.md` files document seams and are not applied.
5. Write the new full SHA and its committer date into this file.

`scripts/upstream-sync.sh` implements those steps. Pass `--dry-run` to build the diff and run `git apply --check` without changing this tree or this file.

Local patch files are reversed with `git apply -R` before the upstream diff, then applied again afterwards, so a seam can be replayed on the new upstream tree. With an empty patch queue that reverse step is a no-op.
