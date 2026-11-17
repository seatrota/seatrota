<!--
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors
-->

# 003 — do not run the upstream PR Update suite here

`.github/workflows/pr.yml` is the Cal.diy pull-request workflow (`pull_request_target`). Its Prepare job is the gate for type checks, lint, unit tests, the security audit, and the end-to-end and production-build matrix.

On pull request #1, Prepare failed in `actions/checkout@v4` while fetching the base commit:

```
fatal: repository 'https://github.com/seatrota/seatrota/' not found
```

The job sets `permissions: pull-requests: read`, which replaces the workflow token's `contents: read`. A public repository can still be fetched. This repository is private, so that token cannot read it and GitHub reports the repository as not found. Trust Check does not check out the repo, which is why it passed.

The jobs after Prepare are the upstream suite. They install the whole tree and call workflows that expect upstream secrets (for example `CI_LINGO_DOT_DEV_API_KEY`) and the upstream end-to-end and production-build setup. SeatRota's own checks are `.github/workflows/seatrota.yml`.

The patch keeps Prepare from running unless `github.repository` is `calcom/cal.diy`. Downstream jobs already require Prepare outputs, so they stay skipped here. Giving Prepare `contents: read` would only move the failure into that upstream matrix, so the workflow is gated instead.

`pull_request_target` loads this file from the default branch, not from the pull request. The gate takes effect once it is on `main`. Until then, Prepare on a pull request still runs the ungated workflow and fails the same checkout. Disabling the workflow through the Actions API is not available to this token (HTTP 403).

`003-disable-upstream-pr-update.patch` is the diff. `scripts/upstream-sync.sh` re-applies it after `002-`.
