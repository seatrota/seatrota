"use client";
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { trpc } from "@calcom/trpc/react";
import { inputStyle, rowStyle } from "@seatrota/teams-booking/ui";
import { useState } from "react";
import { TEMPLATE_VARIABLES } from "../templates";

type Timing = "BEFORE_START" | "AFTER_END";
type Recipient = "ATTENDEE" | "HOSTS";

const DEFAULT_SUBJECT = "Reminder: {{event_title}} at {{start_time}}";
const DEFAULT_BODY =
  "Hi {{attendee_name}},\n\nThis is a reminder for {{event_title}} with {{team_name}} on {{start_time}} ({{time_zone}}).\n\nBooking details: {{booking_url}}";

export default function TeamRemindersPanel({ slug, eventSlug }: { slug: string; eventSlug: string }) {
  const utils = trpc.useUtils();
  const list = trpc.viewer.teams.workflowList.useQuery(
    { slug, eventSlug },
    { enabled: Boolean(slug && eventSlug), refetchOnWindowFocus: false }
  );
  const refresh = () => utils.viewer.teams.workflowList.invalidate({ slug, eventSlug });
  const save = trpc.viewer.teams.workflowSave.useMutation({ onSuccess: refresh });
  const remove = trpc.viewer.teams.workflowDelete.useMutation({ onSuccess: refresh });
  const [timing, setTiming] = useState<Timing>("BEFORE_START");
  const [offset, setOffset] = useState("60");
  const [recipient, setRecipient] = useState<Recipient>("ATTENDEE");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);

  return (
    <div style={{ display: "grid", gap: 8 }} data-testid={`team-reminders-${eventSlug}`}>
      <strong>Email reminders</strong>
      {(list.data ?? []).map((item) => (
        <div key={item.id} style={rowStyle} data-testid="team-reminder">
          <span>
            {item.label} to {item.recipient === "HOSTS" ? "hosts" : "the attendee"}: {item.subject}
          </span>
          <label>
            <input
              type="checkbox"
              data-testid="team-reminder-enabled"
              checked={item.enabled}
              onChange={(event) =>
                save.mutate({
                  slug,
                  eventSlug,
                  id: item.id,
                  timing: item.timing,
                  offsetMinutes: item.offsetMinutes,
                  recipient: item.recipient,
                  subject: item.subject,
                  body: item.body,
                  enabled: event.target.checked,
                })
              }
            />
            On
          </label>
          <button
            type="button"
            data-testid="team-reminder-delete"
            onClick={() => remove.mutate({ slug, eventSlug, id: item.id })}>
            Remove
          </button>
        </div>
      ))}
      <form
        style={{ display: "grid", gap: 8 }}
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({
            slug,
            eventSlug,
            timing,
            offsetMinutes: Number.parseInt(offset, 10) || 0,
            recipient,
            subject,
            body,
            enabled: true,
          });
        }}>
        <div style={rowStyle}>
          <input
            data-testid="team-reminder-offset"
            style={{ ...inputStyle, width: 90 }}
            type="number"
            min={0}
            value={offset}
            onChange={(event) => setOffset(event.target.value)}
            aria-label="Minutes"
          />
          <span>minutes</span>
          <select
            data-testid="team-reminder-timing"
            value={timing}
            onChange={(event) => setTiming(event.target.value as Timing)}>
            <option value="BEFORE_START">before start</option>
            <option value="AFTER_END">after end</option>
          </select>
          <span>to</span>
          <select
            data-testid="team-reminder-recipient"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value as Recipient)}>
            <option value="ATTENDEE">the attendee</option>
            <option value="HOSTS">the hosts</option>
          </select>
        </div>
        <label style={rowStyle}>
          Subject
          <input
            data-testid="team-reminder-subject"
            style={inputStyle}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          Message
          <textarea
            data-testid="team-reminder-body"
            style={{ ...inputStyle, minHeight: 100 }}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        <small>Placeholders: {TEMPLATE_VARIABLES.map((name) => `{{${name}}}`).join(" ")}</small>
        <button type="submit" data-testid="team-reminder-save" disabled={save.isPending}>
          Add reminder
        </button>
        {save.error ? <p>{save.error.message}</p> : null}
        {remove.error ? <p>{remove.error.message}</p> : null}
        {save.isSuccess ? <p>Reminder saved.</p> : null}
      </form>
    </div>
  );
}
