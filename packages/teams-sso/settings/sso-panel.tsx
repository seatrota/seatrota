"use client";
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { trpc } from "@calcom/trpc/react";
import { cardStyle, inputStyle, rowStyle } from "@seatrota/teams-booking/ui";
import { useState } from "react";

type Scope = "team" | "instance";
type Role = "OWNER" | "ADMIN" | "MEMBER";

interface RoleMap {
  group: string;
  role: Role;
}

export default function TeamSsoPanel({ slug, canManage }: { slug: string; canManage: boolean }) {
  const utils = trpc.useUtils();
  const settings = trpc.viewer.teams.ssoGet.useQuery(
    { slug },
    { enabled: Boolean(slug), refetchOnWindowFocus: false }
  );
  const save = trpc.viewer.teams.ssoSave.useMutation({
    onSuccess: () => utils.viewer.teams.ssoGet.invalidate({ slug }),
  });
  const addDomain = trpc.viewer.teams.ssoAddDomain.useMutation({
    onSuccess: () => utils.viewer.teams.ssoGet.invalidate({ slug }),
  });
  const verifyDomain = trpc.viewer.teams.ssoVerifyDomain.useMutation({
    onSuccess: () => utils.viewer.teams.ssoGet.invalidate({ slug }),
  });
  const removeDomain = trpc.viewer.teams.ssoRemoveDomain.useMutation({
    onSuccess: () => utils.viewer.teams.ssoGet.invalidate({ slug }),
  });
  const [scope, setScope] = useState<Scope>("team");
  const [discoveryUrl, setDiscoveryUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState("openid email profile");
  const [groupClaim, setGroupClaim] = useState("");
  const [enforceSso, setEnforceSso] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [roleMaps, setRoleMaps] = useState<RoleMap[]>([]);
  const [domain, setDomain] = useState("");
  const [loadedKey, setLoadedKey] = useState("");

  const active = scope === "instance" ? settings.data?.instance : settings.data?.team;
  const loadKey = `${scope}:${active?.clientId ?? ""}:${active?.discoveryUrl ?? ""}:${settings.dataUpdatedAt}`;
  if (settings.data && loadKey !== loadedKey) {
    setLoadedKey(loadKey);
    setDiscoveryUrl(active?.discoveryUrl ?? "");
    setClientId(active?.clientId ?? "");
    setClientSecret("");
    setScopes(active?.scopes ?? "openid email profile");
    setGroupClaim(active?.groupClaim ?? "");
    setEnforceSso(active?.enforceSso ?? false);
    setEnabled(active?.enabled ?? true);
    setRoleMaps(active?.roleMaps ?? []);
  }

  const domains = (settings.data?.domains ?? []).filter((item) => item.scope === scope);

  return (
    <section style={cardStyle} data-testid="team-sso">
      <h2>Single sign-on</h2>
      {settings.data && !settings.data.planEnabled ? <p>SSO is turned off for this plan.</p> : null}
      <label style={rowStyle}>
        Applies to
        <select
          data-testid="team-sso-scope"
          value={scope}
          onChange={(event) => setScope(event.target.value as Scope)}>
          <option value="team">This team</option>
          <option value="instance">The whole instance</option>
        </select>
      </label>
      {active ? (
        <p>
          Sign-in link: <a href={active.signInPath}>{active.signInPath}</a>
        </p>
      ) : (
        <p>No provider saved for this scope yet.</p>
      )}
      {canManage ? (
        <form
          style={{ display: "grid", gap: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({
              slug,
              scope,
              discoveryUrl,
              clientId,
              clientSecret: clientSecret || undefined,
              scopes,
              enforceSso,
              groupClaim,
              enabled,
              roleMaps,
            });
          }}>
          <label style={rowStyle}>
            Discovery URL
            <input
              data-testid="team-sso-discovery"
              style={inputStyle}
              value={discoveryUrl}
              onChange={(event) => setDiscoveryUrl(event.target.value)}
            />
          </label>
          <label style={rowStyle}>
            Client id
            <input
              data-testid="team-sso-client-id"
              style={inputStyle}
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            />
          </label>
          <label style={rowStyle}>
            Client secret
            <input
              data-testid="team-sso-client-secret"
              style={inputStyle}
              type="password"
              value={clientSecret}
              placeholder={active?.hasClientSecret ? "Leave blank to keep the saved secret" : ""}
              onChange={(event) => setClientSecret(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label style={rowStyle}>
            Scopes
            <input
              data-testid="team-sso-scopes"
              style={inputStyle}
              value={scopes}
              onChange={(event) => setScopes(event.target.value)}
            />
          </label>
          <label style={rowStyle}>
            Group claim
            <input
              data-testid="team-sso-group-claim"
              style={inputStyle}
              value={groupClaim}
              placeholder="groups"
              onChange={(event) => setGroupClaim(event.target.value)}
            />
          </label>
          {roleMaps.map((mapping, index) => (
            <div key={`${mapping.group}-${index}`} style={rowStyle}>
              <input
                data-testid={`team-sso-group-${index}`}
                style={inputStyle}
                value={mapping.group}
                onChange={(event) =>
                  setRoleMaps((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, group: event.target.value } : item
                    )
                  )
                }
              />
              <select
                data-testid={`team-sso-role-${index}`}
                value={mapping.role}
                onChange={(event) =>
                  setRoleMaps((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, role: event.target.value as Role } : item
                    )
                  )
                }>
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
                <option value="OWNER">Owner</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setRoleMaps((current) => current.filter((_, itemIndex) => itemIndex !== index))
                }>
                Remove mapping
              </button>
            </div>
          ))}
          <button
            type="button"
            data-testid="team-sso-add-mapping"
            onClick={() => setRoleMaps((current) => [...current, { group: "", role: "MEMBER" }])}>
            Add group mapping
          </button>
          <label style={rowStyle}>
            <input
              data-testid="team-sso-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Provider enabled
          </label>
          <label style={rowStyle}>
            <input
              data-testid="team-sso-enforce"
              type="checkbox"
              checked={enforceSso}
              onChange={(event) => setEnforceSso(event.target.checked)}
            />
            Refuse password login for verified domains
          </label>
          <button data-testid="team-sso-save" type="submit" disabled={save.isPending}>
            Save SSO
          </button>
          {save.error ? <p>{save.error.message}</p> : null}
          {save.isSuccess ? <p>SSO provider saved.</p> : null}
        </form>
      ) : null}
      <div>
        {domains.map((item) => (
          <div key={item.id} style={rowStyle} data-testid="team-sso-domain">
            <span>
              {item.domain} {item.verified ? "(verified)" : "(unverified)"}
            </span>
            {item.verified ? null : (
              <span>
                TXT {item.verificationHost} = {item.verificationText}
              </span>
            )}
            {canManage && !item.verified ? (
              <button
                type="button"
                data-testid="team-sso-verify"
                onClick={() => verifyDomain.mutate({ slug, domain: item.domain })}>
                Verify
              </button>
            ) : null}
            {canManage ? (
              <button type="button" onClick={() => removeDomain.mutate({ slug, domain: item.domain })}>
                Remove domain
              </button>
            ) : null}
          </div>
        ))}
        {verifyDomain.error ? <p>{verifyDomain.error.message}</p> : null}
      </div>
      {canManage ? (
        <form
          style={rowStyle}
          onSubmit={(event) => {
            event.preventDefault();
            addDomain.mutate({ slug, scope, domain });
            setDomain("");
          }}>
          <input
            data-testid="team-sso-domain-input"
            style={inputStyle}
            value={domain}
            placeholder="example.com"
            onChange={(event) => setDomain(event.target.value)}
          />
          <button data-testid="team-sso-add-domain" type="submit" disabled={addDomain.isPending}>
            Add domain
          </button>
          {addDomain.error ? <p>{addDomain.error.message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
