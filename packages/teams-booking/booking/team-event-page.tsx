"use client";
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { trpc } from "@calcom/trpc/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { cardStyle, inputStyle, pageStyle, rowStyle } from "../ui";

export default function TeamEventPage() {
  const params = useParams<{ slug: string; type: string }>();
  const slug = params?.slug ?? "";
  const eventSlug = params?.type ?? "";
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const range = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 45);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }, []);
  const slots = trpc.viewer.teams.slots.useQuery(
    { slug, eventSlug, timeZone, ...range },
    { enabled: Boolean(slug && eventSlug) }
  );
  const book = trpc.viewer.teams.book.useMutation({
    onSuccess: (result) => {
      window.location.href = `/booking/${result.uid}`;
    },
  });
  const [day, setDay] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const dates = Object.keys(slots.data?.slots ?? {}).sort();
  const times = day ? (slots.data?.slots[day] ?? []) : [];

  return (
    <div style={pageStyle}>
      <p>
        <Link href={`/team/${slug}`}>Back to team</Link>
      </p>
      <h1>{slots.data?.title ?? "Book"}</h1>
      {slots.data ? <p>{slots.data.length} minutes</p> : null}
      {slots.error ? <p>{slots.error.message}</p> : null}
      <div style={cardStyle}>
        <div style={rowStyle}>
          {dates.map((date) => (
            <button
              key={date}
              type="button"
              data-testid="team-slot-day"
              onClick={() => {
                setDay(date);
                setStart(null);
              }}>
              {date}
            </button>
          ))}
        </div>
        {dates.length === 0 && slots.data ? <p>No open times in the next 45 days.</p> : null}
        <div style={rowStyle}>
          {times.map((slot) => (
            <button
              key={slot.time}
              type="button"
              data-testid="team-slot-time"
              onClick={() => setStart(slot.time)}>
              {new Date(slot.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </button>
          ))}
        </div>
      </div>
      {start ? (
        <form
          style={cardStyle}
          onSubmit={(event) => {
            event.preventDefault();
            book.mutate({ slug, eventSlug, start, timeZone, name, email });
          }}>
          <p>Selected {new Date(start).toLocaleString()}</p>
          <label style={rowStyle}>
            Name
            <input
              data-testid="team-book-name"
              style={inputStyle}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label style={rowStyle}>
            Email
            <input
              data-testid="team-book-email"
              style={inputStyle}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button data-testid="team-book-submit" type="submit" disabled={book.isPending}>
            Confirm booking
          </button>
          {book.error ? <p>{book.error.message}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
