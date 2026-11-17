// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

/**
 * Reminder templates use `{{name}}` placeholders. Only the names below are
 * accepted, so a typo is caught when the reminder is saved, not when it sends.
 */
export const TEMPLATE_VARIABLES = [
  "attendee_name",
  "attendee_email",
  "event_title",
  "team_name",
  "host_name",
  "start_time",
  "end_time",
  "time_zone",
  "booking_url",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type TemplateValues = Record<TemplateVariable, string>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

// Plain loops and arrays: the upstream tRPC build compiles this file without downlevel iteration.
export function templateVariablesIn(template: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp(PLACEHOLDER.source, "g");
  let match: RegExpExecArray | null = pattern.exec(template);
  while (match !== null) {
    const name = match[1];
    if (name && !found.includes(name)) found.push(name);
    match = pattern.exec(template);
  }
  return found;
}

export function unknownTemplateVariables(template: string): string[] {
  const known: readonly string[] = TEMPLATE_VARIABLES;
  return templateVariablesIn(template).filter((name) => !known.includes(name));
}

export function renderTemplate(template: string, values: TemplateValues): string {
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name as TemplateVariable] : whole
  );
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The body is plain text. The HTML part escapes what the template produced,
 * so a guest name cannot inject markup, and keeps line breaks.
 */
export function renderReminderBody(template: string, values: TemplateValues): { text: string; html: string } {
  const text = renderTemplate(template, values);
  const html = text
    .split(/\r?\n/)
    .map((line) => escapeHtml(line))
    .join("<br>\n");
  return { text, html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${html}</div>` };
}

/** Formats an instant for the reader's time zone, falling back to UTC for an unknown zone. */
export function formatInstant(instant: Date, timeZone: string, locale = "en"): string {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  };
  try {
    return new Intl.DateTimeFormat(locale, options).format(instant);
  } catch {
    return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(instant);
  }
}
