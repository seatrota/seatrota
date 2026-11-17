# 010 Team booking routes

Public team pages live at `/team/[slug]` and `/team/[slug]/[type]`.

The App Router files under `apps/web/app/(booking-page-wrapper)/team/` only import the pages from `@seatrota/teams-booking`. The static `team` segment wins over the `[user]` booking route. Listing, slot union, and guest booking stay in the teams packages.
