# 072 Run upstream Cal.diy automation only in calcom/cal.diy

Cal.diy ships workflows for its own operations: scheduled cron jobs, performance tests, i18n sync, bundle analysis, branch cleanup, release drafting, a post-release push to `production`, and an E2E report. In SeatRota they either fail for lack of upstream secrets or call upstream endpoints on a schedule.

This patch keeps them from running here:

- Every top-level job in these workflows gets `if: github.repository == 'calcom/cal.diy'`. A job that already had a condition keeps it, combined with `&&`:
  - `cron-*.yml`: bookingReminder, changeTimeZone, checkSmsPrices, downgradeUsers, monthlyDigestEmail, scheduleEmailReminders, scheduleSMSReminders, scheduleWhatsappReminders, stale-issue, syncAppMeta, webhookTriggers
  - `performance-tests.yml`, `i18n.yml`, `nextjs-bundle-analysis.yml`, `cleanup.yml`, `cleanup-report.yml`, `post-release.yml`, `re-draft.yml`, `e2e-report.yml`
- `i18n.yml` and `release-docker.yaml` tested `secrets.*` inside `if:`. GitHub does not allow that, so both files failed to parse on every push. Those conditions now test the repository instead.
- `e2e-report.yml` loses its `workflow_run` trigger. It started on every PR Update run and ended in `startup_failure` before any job condition was checked. It can still be run by hand.

SeatRota's own workflows (`seatrota.yml`, `release.yml`) are unchanged. Upstream workflows that only run when called by the already-gated `pr.yml`, or only on manual dispatch, are untouched.

`changesets.yml` (npm publishing) already had this guard upstream, so it is unchanged.
