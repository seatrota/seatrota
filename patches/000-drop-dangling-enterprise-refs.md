<!--
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors
-->

# 000 — drop dangling enterprise path references

Commit `e9c892526b219d79c4c3e9583de60727bcb56291` (`chore: drop dangling enterprise path references from the MIT snapshot`) is already on `main`. This note and `000-drop-dangling-enterprise-refs.patch` record that commit for `scripts/upstream-sync.sh`. The patch is `git diff e9c8925^ e9c8925`. Do not revert the commit; the sync script reverses this patch only while it replays a newer upstream diff, then applies the patch again.

The MIT snapshot does not contain the enterprise trees those lines pointed at. Leaving the pointers in docs, task config, and a test mock made the tree refer to paths that are not in the source.

## Seams

- `AGENTS.md` — removed the workflow-constants pointer under `packages/features/ee/workflows/lib/constants.ts`.
- `agents/knowledge-base.md` — removed the same workflow-constants pointer.
- `agents/rules/patterns-trigger-dev.md` — removed the example tasker under `packages/features/ee/billing/service/proration/tasker/`.
- `agents/rules/reference-file-locations.md` — removed the same workflow-constants pointer.
- `apps/api/v2/test/mocks/calendars-service-mock.ts` — removed the import of `@/ee/calendars/services/calendars.service` and the return type that depended on it. The mock object is unchanged aside from that type assertion.
- `packages/features/data-table/GUIDE.md` — stopped citing `apps/web/modules/ee/teams/components/MemberList.tsx` as the source of the infinite-scroll example.
- `packages/features/trigger.config.ts` — removed the trigger directories `./ee/billing/service/proration/tasker/trigger` and `./ee/organizations/lib/billing/tasker/trigger`.

`scripts/upstream-sync.sh` re-applies `patches/*.patch` in lexicographic order, so this file runs before `001-` and `002-`.
