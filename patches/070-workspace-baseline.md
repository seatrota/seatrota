# 070 Workspace baseline

These are the M0 workspace edits to upstream files, recorded so that `scripts/upstream-sync.sh` can replay them:

- `package.json`: `build` also builds the `@seatrota/*` packages.
- `turbo.json`: build and type-check tasks for each `@seatrota/teams-*` package.
- `yarn.lock`: the `@seatrota/teams-*` workspace entries. After a sync, `yarn install` refreshes the lockfile.
- `.github/CODEOWNERS`: the SeatRota organization admin owns the repository.

`packages/app-store/tsconfig.build.tsbuildinfo` and `packages/trpc/tsconfig.server.build.tsbuildinfo` are build artifacts that upstream committed. They are deleted through the `remove:` lines in `scripts/seatrota-owned.txt` rather than through a multi-megabyte patch.
