"use client";
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { trpc } from "@calcom/trpc/react";
import TeamSsoPanel from "@seatrota/teams-sso/settings/sso-panel";
import TeamRemindersPanel from "@seatrota/teams-workflows/settings/reminders-panel";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cardStyle, inputStyle, pageStyle, rowStyle } from "../ui";

const MANAGER = new Set(["OWNER", "ADMIN"]);

type PriorityName = "HIGH" | "MEDIUM" | "LOW";
type SchedulingName = "ROUND_ROBIN" | "COLLECTIVE";

type EditableHost = {
  userId: number;
  name: string | null;
  email: string;
  priority: PriorityName;
  weight: number;
  isFixed: boolean;
};

function EventSchedulingEditor({
  slug,
  eventType,
}: {
  slug: string;
  eventType: {
    slug: string;
    schedulingType: SchedulingName;
    hosts: EditableHost[];
  };
}) {
  const utils = trpc.useUtils();
  const update = trpc.viewer.teams.updateEventType.useMutation({
    onSuccess: () => utils.viewer.teams.get.invalidate({ slug }),
  });
  const [schedulingType, setSchedulingType] = useState(eventType.schedulingType);
  const [rows, setRows] = useState(eventType.hosts);

  return (
    <form
      style={{ display: "grid", gap: 8 }}
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate({
          slug,
          eventSlug: eventType.slug,
          schedulingType,
          hostUserIds: rows.map((row) => row.userId),
          hostSettings: rows.map((row) => ({
            userId: row.userId,
            priority: row.priority,
            weight: row.weight,
            isFixed: row.isFixed,
          })),
        });
      }}>
      <label style={rowStyle}>
        Scheduling
        <select
          data-testid={`team-event-scheduling-${eventType.slug}`}
          value={schedulingType}
          onChange={(event) => setSchedulingType(event.target.value as SchedulingName)}>
          <option value="ROUND_ROBIN">Round robin</option>
          <option value="COLLECTIVE">Collective</option>
        </select>
      </label>
      {rows.map((row) => (
        <div key={row.userId} style={rowStyle}>
          <span>{row.name || row.email}</span>
          <select
            data-testid={`team-event-priority-${eventType.slug}-${row.userId}`}
            value={row.priority}
            onChange={(event) =>
              setRows((current) =>
                current.map((host) =>
                  host.userId === row.userId
                    ? { ...host, priority: event.target.value as PriorityName }
                    : host
                )
              )
            }>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <input
            data-testid={`team-event-weight-${eventType.slug}-${row.userId}`}
            style={inputStyle}
            type="number"
            min={0}
            max={1000}
            value={row.weight}
            onChange={(event) =>
              setRows((current) =>
                current.map((host) =>
                  host.userId === row.userId ? { ...host, weight: Number(event.target.value) } : host
                )
              )
            }
          />
          <label>
            <input
              data-testid={`team-event-fixed-${eventType.slug}-${row.userId}`}
              type="checkbox"
              checked={row.isFixed}
              onChange={(event) =>
                setRows((current) =>
                  current.map((host) =>
                    host.userId === row.userId ? { ...host, isFixed: event.target.checked } : host
                  )
                )
              }
            />
            Fixed
          </label>
        </div>
      ))}
      <button
        data-testid={`team-scheduling-save-${eventType.slug}`}
        type="submit"
        disabled={update.isPending}>
        Save scheduling
      </button>
      {update.error ? <p>{update.error.message}</p> : null}
    </form>
  );
}

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
  const [schedulingType, setSchedulingType] = useState<SchedulingName>("ROUND_ROBIN");
  const [drafts, setDrafts] = useState<
    Record<number, { priority: PriorityName; weight: number; fixed: boolean }>
  >({});
  const canManage = team.data ? MANAGER.has(team.data.viewerRole ?? "") : false;

  function draftFor(userId: number) {
    return drafts[userId] ?? { priority: "MEDIUM" as const, weight: 100, fixed: false };
  }

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
          <div key={eventType.id} style={{ display: "grid", gap: 8 }}>
            <div style={rowStyle}>
              <Link data-testid="team-event-link" href={`/team/${slug}/${eventType.slug}`}>
                {eventType.title}
              </Link>
              <span>{eventType.length} min</span>
              <span>{eventType.schedulingType === "COLLECTIVE" ? "Collective" : "Round robin"}</span>
              {canManage ? (
                <button type="button" onClick={() => deleteEvent.mutate({ slug, eventSlug: eventType.slug })}>
                  Delete
                </button>
              ) : null}
            </div>
            {canManage ? (
              <EventSchedulingEditor
                key={`${eventType.schedulingType}:${eventType.hosts
                  .map((host) => `${host.userId}:${host.priority}:${host.weight}:${host.isFixed}`)
                  .join(",")}`}
                slug={slug}
                eventType={eventType}
              />
            ) : null}
            {canManage ? <TeamRemindersPanel slug={slug} eventSlug={eventType.slug} /> : null}
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
              createEvent.mutate({
                slug,
                title,
                eventSlug,
                length,
                hostUserIds,
                schedulingType,
                hostSettings: hostUserIds.map((userId) => {
                  const draft = draftFor(userId);
                  return { userId, priority: draft.priority, weight: draft.weight, isFixed: draft.fixed };
                }),
              });
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
            <label style={rowStyle}>
              Scheduling
              <select
                data-testid="team-scheduling-type"
                value={schedulingType}
                onChange={(event) => setSchedulingType(event.target.value as SchedulingName)}>
                <option value="ROUND_ROBIN">Round robin</option>
                <option value="COLLECTIVE">Collective</option>
              </select>
            </label>
            <div>
              {team.data?.members.map((member) => {
                const draft = draftFor(member.userId);
                return (
                  <div key={member.userId} style={rowStyle}>
                    <label>
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
                    <select
                      data-testid={`team-host-priority-${member.userId}`}
                      value={draft.priority}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [member.userId]: {
                            ...draft,
                            priority: event.target.value as PriorityName,
                          },
                        }))
                      }>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                    <input
                      data-testid={`team-host-weight-${member.userId}`}
                      style={inputStyle}
                      type="number"
                      min={0}
                      max={1000}
                      value={draft.weight}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [member.userId]: { ...draft, weight: Number(event.target.value) },
                        }))
                      }
                    />
                    <label>
                      <input
                        data-testid={`team-host-fixed-${member.userId}`}
                        type="checkbox"
                        checked={draft.fixed}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [member.userId]: { ...draft, fixed: event.target.checked },
                          }))
                        }
                      />
                      Fixed
                    </label>
                  </div>
                );
              })}
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
