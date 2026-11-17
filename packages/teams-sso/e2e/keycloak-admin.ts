// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export interface ImportedRealm {
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  email: string;
  group: string;
}

interface TokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export async function waitForKeycloak(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 180_000;
  let last = "offline";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/realms/master`);
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : "offline";
    }
    await delay(2000);
  }
  throw new Error(`Keycloak did not become ready (${last})`);
}

export async function importSeatRotaRealm(baseUrl: string): Promise<ImportedRealm> {
  const admin = process.env.KEYCLOAK_ADMIN || "admin";
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || "admin";
  const token = await passwordGrant(baseUrl, "master", {
    clientId: "admin-cli",
    username: admin,
    password: adminPassword,
  });
  const realmPath = join(dirname(fileURLToPath(import.meta.url)), "realm-seatrota.json");
  const realm = JSON.parse(readFileSync(realmPath, "utf8")) as { realm: string };
  const existing = await fetch(`${baseUrl}/admin/realms/${realm.realm}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (existing.ok) {
    const removed = await fetch(`${baseUrl}/admin/realms/${realm.realm}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!removed.ok) {
      throw new Error(`Could not replace realm ${realm.realm} (${removed.status})`);
    }
  }
  const created = await fetch(`${baseUrl}/admin/realms`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: readFileSync(realmPath),
  });
  if (!created.ok) {
    throw new Error(`Realm import failed (${created.status}): ${await created.text()}`);
  }
  const clientSecret = await readClientSecret(baseUrl, token, realm.realm, "seatrota");
  return {
    baseUrl,
    realm: realm.realm,
    clientId: "seatrota",
    clientSecret,
    username: "ada",
    password: "ada-secret",
    email: "ada@sso.example.com",
    group: "seat-admins",
  };
}

export async function passwordGrant(
  baseUrl: string,
  realm: string,
  input: { clientId: string; clientSecret?: string; username: string; password: string; scope?: string }
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: input.clientId,
    username: input.username,
    password: input.password,
    scope: input.scope ?? "openid",
  });
  if (input.clientSecret) body.set("client_secret", input.clientSecret);
  const response = await fetch(`${baseUrl}/realms/${realm}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json()) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || payload.error || `Token request failed (${response.status})`
    );
  }
  return payload.access_token;
}

export async function loginIdToken(realm: ImportedRealm, clientSecret: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: realm.clientId,
    client_secret: clientSecret,
    username: realm.username,
    password: realm.password,
    scope: "openid email profile",
  });
  const response = await fetch(`${realm.baseUrl}/realms/${realm.realm}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json()) as TokenResponse;
  if (!response.ok || !payload.id_token) {
    throw new Error(payload.error_description || payload.error || `SSO login failed (${response.status})`);
  }
  return payload.id_token;
}

async function readClientSecret(
  baseUrl: string,
  token: string,
  realm: string,
  clientId: string
): Promise<string> {
  const listed = await fetch(`${baseUrl}/admin/realms/${realm}/clients?clientId=${clientId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!listed.ok) throw new Error(`Client lookup failed (${listed.status})`);
  const clients = (await listed.json()) as { id: string; clientId: string }[];
  const client = clients.find((item) => item.clientId === clientId);
  if (!client) throw new Error(`Client ${clientId} was not imported`);
  const secret = await fetch(`${baseUrl}/admin/realms/${realm}/clients/${client.id}/client-secret`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!secret.ok) throw new Error(`Client secret lookup failed (${secret.status})`);
  const payload = (await secret.json()) as { value?: string };
  if (!payload.value) throw new Error("Imported client has no secret");
  return payload.value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
