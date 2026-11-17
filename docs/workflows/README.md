# Email reminders

Team event types can send email reminders. SMS is not supported.

## Rules

Open the team settings page. Each event type has an "Email reminders" section where owners and admins add rules:

- **When:** a number of minutes before the start, or after the end. The limit is 30 days (43200 minutes). Zero means at the start or at the end.
- **To:** the attendee (the guest who booked), or the hosts on the booking. For a collective event that is every host. For round-robin it is the assigned host plus any fixed hosts.
- **Subject and message:** plain text with placeholders. The message is sent as text and as escaped HTML, so a guest's name cannot inject markup.

Placeholders: `{{attendee_name}}`, `{{attendee_email}}`, `{{event_title}}`, `{{team_name}}`, `{{host_name}}`, `{{start_time}}`, `{{end_time}}`, `{{time_zone}}`, `{{booking_url}}`. Times are written in each reader's own time zone. An unknown placeholder is refused when the rule is saved.

## When reminders are queued

- A team booking queues one reminder per enabled rule.
- Adding or changing a rule plans it for every upcoming booking of that event type.
- A before-start reminder that would already be late, such as a 1-hour reminder on a booking made 10 minutes ahead, is sent on the next cron run. Once the meeting has started it is dropped.
- A cancelled or rejected booking cancels its reminders when they come due. Turning a rule off does the same for its pending reminders.

## Sending

Reminders go out when the cron route runs:

```text
POST /api/cron/teams-reminders
Authorization: <CRON_API_KEY>
```

Schedule it every few minutes with any scheduler, for example a system crontab:

```text
*/5 * * * * curl -fsS -X POST -H "Authorization: $CRON_API_KEY" https://<your-host>/api/cron/teams-reminders
```

The response lists how many reminders were sent, cancelled, retried and failed. Mail uses the instance's normal SMTP settings (`EMAIL_SERVER_*`, `EMAIL_FROM`). A send that throws is retried on later runs and marked failed after 3 attempts. Each row is claimed before it is sent, so two overlapping runs do not send the same email twice.
