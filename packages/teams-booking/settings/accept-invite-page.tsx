"use client";
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { trpc } from "@calcom/trpc/react";
import { useParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

import { cardStyle, pageStyle } from "../ui";

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const session = useSession();
  const accept = trpc.viewer.teams.acceptInvite.useMutation();

  if (session.status === "loading" || !token) {
    return (
      <div style={pageStyle}>
        <p>Loading invite…</p>
      </div>
    );
  }

  if (session.status === "unauthenticated") {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1>Team invite</h1>
          <p>Sign in with the invited email to join this team.</p>
          <button
            type="button"
            data-testid="team-invite-signin"
            onClick={() =>
              signIn(undefined, { callbackUrl: `/teams/invite/${token}` })
            }>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1>Team invite</h1>
        {accept.data ? (
          <p data-testid="team-joined">You joined {accept.data.name}</p>
        ) : (
          <button
            type="button"
            data-testid="team-accept-invite"
            disabled={accept.isPending}
            onClick={() => accept.mutate({ token })}>
            Accept invite
          </button>
        )}
        {accept.error ? <p>{accept.error.message}</p> : null}
      </div>
    </div>
  );
}
