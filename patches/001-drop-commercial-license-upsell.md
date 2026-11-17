<!--
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors
-->

# 001 — drop commercial-license upsell strings

`packages/i18n/locales/*/common.json` still had two upsell strings from the snapshot.

- `acquire_license` — English value: "Acquire a commercial license to remove these terms by emailing". Present in every locale.
- `acquire_commercial_license` — English value: "Acquire a commercial license". Present in every locale except `hr`, `id`, and `ta`.

Neither key is referenced from TypeScript, JavaScript, or other source. Unreferenced keys were deleted in every locale that had them, rather than rewritten. No other `common.json` key is an upsell whose name mentions a commercial or enterprise licence, and no other English value uses the "Acquire a commercial license" wording.

`001-drop-commercial-license-upsell.patch` is the diff of those locale files. `scripts/upstream-sync.sh` re-applies it after `000-`.
