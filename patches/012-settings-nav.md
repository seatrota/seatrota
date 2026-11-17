# 012 Settings nav and pages

Settings navigation gains a Teams entry that links to `/settings/teams`. The route modules under settings only render `@seatrota/teams-booking` pages: create a team, members, email invite, roles, removal, and team event types.

`/teams/invite/[token]` sits outside the authenticated settings layout so an invitee can open the email link and sign in before accepting.
