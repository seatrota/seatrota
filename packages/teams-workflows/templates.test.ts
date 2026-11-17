// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { describe, expect, test } from "vitest";
import {
  formatInstant,
  renderReminderBody,
  renderTemplate,
  type TemplateValues,
  templateVariablesIn,
  unknownTemplateVariables,
} from "./templates";

const values: TemplateValues = {
  attendee_name: "Casey <script>",
  attendee_email: "casey@example.com",
  event_title: "Intro",
  team_name: "Desk",
  host_name: "Robin",
  start_time: "Wednesday, December 2, 2026 at 3:00 PM",
  end_time: "Wednesday, December 2, 2026 at 3:30 PM",
  time_zone: "UTC",
  booking_url: "http://localhost:3000/booking/abc",
};

describe("reminder templates", () => {
  test("placeholders are filled, with or without inner spaces", () => {
    expect(renderTemplate("Hi {{attendee_name}}, {{ event_title }} with {{host_name}}", values)).toBe(
      "Hi Casey <script>, Intro with Robin"
    );
  });

  test("unknown placeholders are reported and left as written", () => {
    expect(unknownTemplateVariables("{{event_title}} {{attendee_nmae}} {{price}}")).toEqual([
      "attendee_nmae",
      "price",
    ]);
    expect(renderTemplate("{{price}}", values)).toBe("{{price}}");
  });

  test("each placeholder is listed once", () => {
    expect(templateVariablesIn("{{team_name}} {{team_name}} {{start_time}}")).toEqual(["team_name", "start_time"]);
  });

  test("the HTML part escapes guest text and keeps line breaks", () => {
    const body = renderReminderBody("Hi {{attendee_name}}\nSee you at {{start_time}}", values);
    expect(body.text).toBe("Hi Casey <script>\nSee you at Wednesday, December 2, 2026 at 3:00 PM");
    expect(body.html).toContain("Hi Casey &lt;script&gt;<br>");
    expect(body.html).not.toContain("<script>");
  });

  test("times use the reader's zone and fall back to UTC for an unknown zone", () => {
    const instant = new Date("2026-12-02T15:00:00.000Z");
    expect(formatInstant(instant, "Asia/Jerusalem")).toContain("5:00");
    expect(formatInstant(instant, "Not/AZone")).toContain("3:00");
  });
});
