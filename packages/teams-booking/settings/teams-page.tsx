"use client";
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { trpc } from "@calcom/trpc/react";
import Link from "next/link";
import { useState } from "react";

import { cardStyle, inputStyle, pageStyle, rowStyle } from "../ui";

export default function TeamsSettingsPage() {
  const utils = trpc.useUtils();
  const teams = trpc.viewer.teams.list.useQuery();
  const create = trpc.viewer.teams.create.useMutation({
    onSuccess: async () => {
      setName("");
      setSlug("");
      await utils.viewer.teams.list.invalidate();
    },
  });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  return (
    <div style={pageStyle}>
      <h1>Teams</h1>
      <form
        style={cardStyle}
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ name, slug });
        }}>
        <h2>Create a team</h2>
        <label style={rowStyle}>
          Name
          <input
            data-testid="team-name"
            style={inputStyle}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label style={rowStyle}>
          Link
          <input
            data-testid="team-slug"
            style={inputStyle}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
          />
        </label>
        <button data-testid="team-create" type="submit" disabled={create.isPending}>
          Create team
        </button>
        {create.error ? <p>{create.error.message}</p> : null}
      </form>
      <div style={cardStyle}>
        <h2>Your teams</h2>
        {teams.data?.length ? (
          teams.data.map((team) => (
            <div key={team.id} style={rowStyle}>
              <Link data-testid="team-open" href={`/settings/teams/${team.slug}`}>
                {team.name}
              </Link>
              <span>{team.role.toLowerCase()}</span>
            </div>
          ))
        ) : (
          <p>No teams yet.</p>
        )}
      </div>
    </div>
  );
}
