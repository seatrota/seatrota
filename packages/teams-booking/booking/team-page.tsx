"use client";
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { trpc } from "@calcom/trpc/react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { cardStyle, pageStyle } from "../ui";

export default function TeamPublicPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const team = trpc.viewer.teams.publicTeam.useQuery({ slug }, { enabled: Boolean(slug) });

  return (
    <div style={pageStyle}>
      <h1>{team.data?.name ?? "Team"}</h1>
      {team.error ? <p>{team.error.message}</p> : null}
      <div style={cardStyle}>
        {team.data?.eventTypes.length ? (
          team.data.eventTypes.map((eventType) => (
            <p key={eventType.slug}>
              <Link data-testid="team-event-link" href={`/team/${slug}/${eventType.slug}`}>
                {eventType.title}
              </Link>
              <span> · {eventType.length} min</span>
              {eventType.description ? <span> · {eventType.description}</span> : null}
            </p>
          ))
        ) : (
          <p>No team events yet.</p>
        )}
      </div>
    </div>
  );
}
