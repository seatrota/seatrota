"use client";
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { trpc } from "@calcom/trpc/react";
import { cardStyle, inputStyle, rowStyle } from "@seatrota/teams-booking/ui";
import type { CSSProperties } from "react";
import { useState } from "react";

const DAY = 24 * 60 * 60 * 1000;
const cellStyle: CSSProperties = { padding: "4px 8px", borderBottom: "1px solid #e4e4e7", textAlign: "left" };
const numberStyle: CSSProperties = { ...cellStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const mutedStyle: CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 };

function dateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function Stat({ id, label, value }: { id: string; label: string; value: string | number }) {
  return (
    <div style={{ display: "grid", gap: 2, minWidth: 110 }}>
      <span style={mutedStyle}>{label}</span>
      <strong data-testid={`insights-${id}`} style={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </strong>
    </div>
  );
}

export default function TeamInsightsPanel({ slug }: { slug: string }) {
  const [from, setFrom] = useState(() => dateInput(new Date(Date.now() - 30 * DAY)));
  const [to, setTo] = useState(() => dateInput(new Date(Date.now() + 31 * DAY)));
  const insights = trpc.viewer.teams.insights.useQuery(
    { slug, from, to },
    { enabled: Boolean(slug && from && to), refetchOnWindowFocus: false }
  );
  const data = insights.data;

  return (
    <section style={cardStyle} data-testid="team-insights">
      <h2>Insights</h2>
      <div style={rowStyle}>
        <label style={rowStyle}>
          From
          <input
            data-testid="insights-from"
            type="date"
            style={inputStyle}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label style={rowStyle}>
          To (not included)
          <input
            data-testid="insights-to"
            type="date"
            style={inputStyle}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
      </div>
      {insights.error ? <p>{insights.error.message}</p> : null}
      {data ? (
        <>
          <div style={{ ...rowStyle, gap: 24 }}>
            <Stat id="bookings" label="Bookings" value={data.totals.bookings} />
            <Stat id="cancelled" label="Cancelled" value={data.totals.cancelled} />
            <Stat id="no-shows" label="No-shows" value={data.totals.noShows} />
            <Stat id="cancellation-rate" label="Cancellation rate" value={`${data.totals.cancellationRate}%`} />
            <Stat id="no-show-rate" label="No-show rate" value={`${data.totals.noShowRate}%`} />
          </div>
          <p style={mutedStyle}>
            No-shows: {data.totals.guestNoShows} guest, {data.totals.hostNoShows} host. A cancelled booking is
            never counted as a no-show.
          </p>

          <h3>Per member</h3>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={cellStyle}>Member</th>
                <th style={numberStyle}>Organized</th>
                <th style={numberStyle}>Hosted</th>
                <th style={numberStyle}>Cancelled</th>
                <th style={numberStyle}>No-shows</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => (
                <tr key={member.userId} data-testid={`insights-member-${member.userId}`}>
                  <td style={cellStyle}>{member.name}</td>
                  <td style={numberStyle} data-testid="insights-member-bookings">
                    {member.bookings}
                  </td>
                  <td style={numberStyle} data-testid="insights-member-hosted">
                    {member.hosted}
                  </td>
                  <td style={numberStyle} data-testid="insights-member-cancelled">
                    {member.cancelled}
                  </td>
                  <td style={numberStyle} data-testid="insights-member-no-shows">
                    {member.noShows}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.roundRobin.map((distribution) => (
            <div key={distribution.eventTypeId} data-testid={`insights-rr-${distribution.eventTypeId}`}>
              <h3>
                Round-robin: {distribution.title} ({distribution.total} active)
              </h3>
              {distribution.rows.map((row) => (
                <div key={row.userId} style={{ ...rowStyle, gap: 12 }} data-testid={`insights-rr-row-${row.userId}`}>
                  <span style={{ width: 140 }}>{row.name}</span>
                  <div style={{ flex: 1, background: "#f4f4f5", borderRadius: 4, height: 10, minWidth: 120 }}>
                    <div style={{ width: `${row.share}%`, background: "#3f3f46", borderRadius: 4, height: 10 }} />
                  </div>
                  <span style={{ width: 110, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    <span data-testid="insights-rr-bookings">{row.bookings}</span> ({row.share}%)
                  </span>
                </div>
              ))}
            </div>
          ))}
        </>
      ) : null}
    </section>
  );
}
