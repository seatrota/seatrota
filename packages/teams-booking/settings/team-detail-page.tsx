"use client";
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { trpc } from "@calcom/trpc/react";
import TeamSsoPanel from "@seatrota/teams-sso/settings/sso-panel";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cardStyle, inputStyle, pageStyle, rowStyle } from "../ui";

const MANAGER = new Set(["OWNER", "ADMIN"]);

export default function TeamDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const utils = trpc.useUtils();
  const team = trpc.viewer.teams.get.useQuery({ slug }, { enabled: Boolean(slug) });
  const invalidate = () => utils.viewer.teams.get.invalidate({ slug });
  const invite = trpc.viewer.teams.invite.useMutation({ onSuccess: invalidate });
  const changeRole = trpc.viewer.teams.changeRole.useMutation({ onSuccess: invalidate });
  const removeMember = trpc.viewer.teams.removeMember.useMutation({ onSuccess: invalidate });
  const createEvent = trpc.viewer.teams.createEventType.useMutation({
    onSuccess: async () => {
      setTitle("");
      setEventSlug("");
      await invalidate();
    },
  });
  const deleteEvent = trpc.viewer.teams.deleteEventType.useMutation({ onSuccess: invalidate });
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [length, setLength] = useState(30);
  const [hosts, setHosts] = useState<number[]>([]);
  const canManage = team.data ? MANAGER.has(team.data.viewerRole ?? "") : false;

  useEffect(() => {
    if (team.data) {
      setHosts(team.data.members.map((member) => member.userId));
    }
  }, [team.data]);

  if (!slug) {
    return null;
  }

  return (
    <div style={pageStyle}>
      <p>
        <Link href="/settings/teams">Teams</Link>
      </p>
      <h1>{team.data?.name ?? "Team"}</h1>
      {team.data ? (
        <p>
          Public page: <Link href={`/team/${team.data.slug}`}>/team/{team.data.slug}</Link>
        </p>
      ) : null}
      {team.error ? <p>{team.error.message}</p> : null}

      <section style={cardStyle}>
        <h2>Members</h2>
        {team.data?.members.map((member) => (
          <div key={member.userId} style={rowStyle} data-testid="team-member">
            <span>
              {member.name || member.email} ({member.email})
            </span>
            {canManage ? (
              <>
                <select
                  data-testid={`team-role-${member.userId}`}
                  value={member.role}
                  onChange={(event) =>
                    changeRole.mutate({
                      slug,
                      userId: member.userId,
                      role: event.target.value as "OWNER" | "ADMIN" | "MEMBER",
                    })
                  }>
                  <option value="OWNER">Owner</option>
                  <option value="ADMIN">Admin</option>
                  <option value="MEMBER">Member</option>
                </select>
                <button
                  type="button"
                  data-testid={`team-remove-${member.userId}`}
                  onClick={() => removeMember.mutate({ slug, userId: member.userId })}>
                  Remove
                </button>
              </>
            ) : (
              <span>{member.role.toLowerCase()}</span>
            )}
          </div>
        ))}
        {changeRole.error ? <p>{changeRole.error.message}</p> : null}
        {removeMember.error ? <p>{removeMember.error.message}</p> : null}
      </section>

      {canManage ? (
        <form
          style={cardStyle}
          onSubmit={(event) => {
            event.preventDefault();
            invite.mutate({ slug, email });
          }}>
          <h2>Invite by email</h2>
          <label style={rowStyle}>
            Email
            <input
              data-testid="team-invite-email"
              style={inputStyle}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button data-testid="team-invite-submit" type="submit" disabled={invite.isPending}>
            Send invite
          </button>
          {invite.isSuccess ? <p>Invite sent</p> : null}
          {invite.error ? <p>{invite.error.message}</p> : null}
          {team.data?.invites.map((pending) => (
            <p key={pending.id}>
              Pending: {pending.email} ({pending.role.toLowerCase()})
            </p>
          ))}
        </form>
      ) : null}

      <section style={cardStyle}>
        <h2>Event types</h2>
        {team.data?.eventTypes.map((eventType) => (
          <div key={eventType.id} style={rowStyle}>
            <Link data-testid="team-event-link" href={`/team/${slug}/${eventType.slug}`}>
              {eventType.title}
            </Link>
            <span>{eventType.length} min</span>
            {canManage ? (
              <button type="button" onClick={() => deleteEvent.mutate({ slug, eventSlug: eventType.slug })}>
                Delete
              </button>
            ) : null}
          </div>
        ))}
        {canManage ? (
          <form
            style={{ display: "grid", gap: 8 }}
            onSubmit={(event) => {
              event.preventDefault();
              const hostUserIds = hosts.length
                ? hosts
                : (team.data?.members.map((member) => member.userId) ?? []);
              createEvent.mutate({ slug, title, eventSlug, length, hostUserIds });
            }}>
            <label style={rowStyle}>
              Title
              <input
                data-testid="team-event-title"
                style={inputStyle}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label style={rowStyle}>
              Link
              <input
                data-testid="team-event-slug"
                style={inputStyle}
                value={eventSlug}
                onChange={(event) => setEventSlug(event.target.value)}
              />
            </label>
            <label style={rowStyle}>
              Minutes
              <input
                data-testid="team-event-length"
                style={inputStyle}
                type="number"
                min={5}
                max={240}
                value={length}
                onChange={(event) => setLength(Number(event.target.value))}
              />
            </label>
            <div>
              {team.data?.members.map((member) => (
                <label key={member.userId} style={rowStyle}>
                  <input
                    data-testid={`team-host-${member.userId}`}
                    type="checkbox"
                    checked={hosts.includes(member.userId)}
                    onChange={(event) =>
                      setHosts((current) =>
                        event.target.checked
                          ? [...current, member.userId]
                          : current.filter((id) => id !== member.userId)
                      )
                    }
                  />
                  Host {member.name || member.email}
                </label>
              ))}
            </div>
            <button data-testid="team-event-create" type="submit" disabled={createEvent.isPending}>
              Create event type
            </button>
            {createEvent.error ? <p>{createEvent.error.message}</p> : null}
          </form>
        ) : null}
      </section>

      <TeamSsoPanel slug={slug} canManage={canManage} />
    </div>
  );
}
