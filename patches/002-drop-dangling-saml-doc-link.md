<!--
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors
-->

# 002 — drop the dangling SAML doc link

`.env.example` commented the SAML variables with a link to `packages/features/ee` on the upstream tree. That path is not in the MIT snapshot, so the comment was a dangling enterprise path, the same class of problem as `000`.

The comment now says to set `SAML_DATABASE_URL` and `SAML_ADMINS`, and to leave them empty to keep SAML off. The variables themselves are unchanged.

`002-drop-dangling-saml-doc-link.patch` is that diff. `scripts/upstream-sync.sh` re-applies it after `001-`.
