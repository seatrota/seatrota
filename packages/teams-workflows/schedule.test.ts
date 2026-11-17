// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import { describe, expect, test } from "vitest";
import {
  assertOffset,
  decideReminder,
  describeRule,
  MAX_OFFSET_MINUTES,
  planReminders,
  reminderSendAt,
  statusAfterFailure,
} from "./schedule";

const now = new Date("2026-12-01T09:00:00.000Z");
const booking = {
  start: new Date("2026-12-02T15:00:00.000Z"),
  end: new Date("2026-12-02T15:30:00.000Z"),
};

describe("reminder timing", () => {
  test("a before-start reminder fires the offset ahead of the start", () => {
    const sendAt = reminderSendAt({ id: 1, timing: "BEFORE_START", offsetMinutes: 24 * 60, enabled: true }, booking, now);
    expect(sendAt?.toISOString()).toBe("2026-12-01T15:00:00.000Z");
  });

  test("an after-end reminder fires the offset after the end", () => {
    const sendAt = reminderSendAt({ id: 1, timing: "AFTER_END", offsetMinutes: 90, enabled: true }, booking, now);
    expect(sendAt?.toISOString()).toBe("2026-12-02T17:00:00.000Z");
  });

  test("a before-start reminder that is already late fires now while the meeting is ahead", () => {
    const soon = { start: new Date("2026-12-01T09:10:00.000Z"), end: new Date("2026-12-01T09:40:00.000Z") };
    const sendAt = reminderSendAt({ id: 1, timing: "BEFORE_START", offsetMinutes: 60, enabled: true }, soon, now);
    expect(sendAt?.toISOString()).toBe(now.toISOString());
  });

  test("a before-start reminder is dropped once the meeting has started", () => {
    const started = { start: new Date("2026-12-01T08:59:00.000Z"), end: new Date("2026-12-01T09:29:00.000Z") };
    expect(reminderSendAt({ id: 1, timing: "BEFORE_START", offsetMinutes: 5, enabled: true }, started, now)).toBeNull();
  });

  test("an offset of zero sends at the start or at the end", () => {
    expect(
      reminderSendAt({ id: 1, timing: "BEFORE_START", offsetMinutes: 0, enabled: true }, booking, now)?.toISOString()
    ).toBe(booking.start.toISOString());
    expect(
      reminderSendAt({ id: 1, timing: "AFTER_END", offsetMinutes: 0, enabled: true }, booking, now)?.toISOString()
    ).toBe(booking.end.toISOString());
  });

  test("offsets outside 0 to 30 days, or fractional ones, are refused", () => {
    expect(() => assertOffset(-1)).toThrow(RangeError);
    expect(() => assertOffset(MAX_OFFSET_MINUTES + 1)).toThrow(RangeError);
    expect(() => assertOffset(1.5)).toThrow(RangeError);
    expect(() => assertOffset(MAX_OFFSET_MINUTES)).not.toThrow();
  });
});

describe("planning reminders for a booking", () => {
  test("only enabled rules are planned, earliest first", () => {
    const planned = planReminders(
      [
        { id: 3, timing: "AFTER_END", offsetMinutes: 60, enabled: true },
        { id: 1, timing: "BEFORE_START", offsetMinutes: 60, enabled: true },
        { id: 2, timing: "BEFORE_START", offsetMinutes: 24 * 60, enabled: false },
      ],
      booking,
      now
    );
    expect(planned.map((item) => [item.workflowId, item.sendAt.toISOString()])).toEqual([
      [1, "2026-12-02T14:00:00.000Z"],
      [3, "2026-12-02T16:30:00.000Z"],
    ]);
  });

  test("a booking that already started still gets its after-end reminders", () => {
    const started = { start: new Date("2026-12-01T08:30:00.000Z"), end: new Date("2026-12-01T09:30:00.000Z") };
    const planned = planReminders(
      [
        { id: 1, timing: "BEFORE_START", offsetMinutes: 60, enabled: true },
        { id: 2, timing: "AFTER_END", offsetMinutes: 15, enabled: true },
      ],
      started,
      now
    );
    expect(planned).toEqual([{ workflowId: 2, sendAt: new Date("2026-12-01T09:45:00.000Z") }]);
  });
});

describe("sending decisions", () => {
  const due = new Date("2026-12-01T08:00:00.000Z");

  test("a due reminder for an accepted future booking is sent", () => {
    expect(
      decideReminder({
        timing: "BEFORE_START",
        sendAt: due,
        workflowEnabled: true,
        booking: { state: "ACCEPTED", start: booking.start },
        now,
      })
    ).toEqual({ action: "send" });
  });

  test("a reminder that is not due yet waits", () => {
    expect(
      decideReminder({
        timing: "BEFORE_START",
        sendAt: new Date("2026-12-01T10:00:00.000Z"),
        workflowEnabled: true,
        booking: { state: "ACCEPTED", start: booking.start },
        now,
      })
    ).toEqual({ action: "wait" });
  });

  test.each(["CANCELLED", "REJECTED", "MISSING"] as const)("a %s booking cancels the reminder", (state) => {
    expect(
      decideReminder({
        timing: "AFTER_END",
        sendAt: due,
        workflowEnabled: true,
        booking: { state, start: booking.start },
        now,
      }).action
    ).toBe("cancel");
  });

  test("a turned-off rule cancels its pending reminders", () => {
    expect(
      decideReminder({
        timing: "AFTER_END",
        sendAt: due,
        workflowEnabled: false,
        booking: { state: "ACCEPTED", start: booking.start },
        now,
      })
    ).toEqual({ action: "cancel", reason: "Reminder was turned off" });
  });

  test("a before-start reminder that missed the start is cancelled, an after-end one is sent", () => {
    const started = new Date("2026-12-01T08:30:00.000Z");
    expect(
      decideReminder({
        timing: "BEFORE_START",
        sendAt: due,
        workflowEnabled: true,
        booking: { state: "ACCEPTED", start: started },
        now,
      }).action
    ).toBe("cancel");
    expect(
      decideReminder({
        timing: "AFTER_END",
        sendAt: due,
        workflowEnabled: true,
        booking: { state: "ACCEPTED", start: started },
        now,
      }).action
    ).toBe("send");
  });

  test("a failed send is retried twice, then marked failed", () => {
    expect(statusAfterFailure(0)).toBe("PENDING");
    expect(statusAfterFailure(1)).toBe("PENDING");
    expect(statusAfterFailure(2)).toBe("FAILED");
  });
});

describe("rule labels", () => {
  test("labels read naturally", () => {
    expect(describeRule({ timing: "BEFORE_START", offsetMinutes: 90 })).toBe("1 hour 30 minutes before start");
    expect(describeRule({ timing: "BEFORE_START", offsetMinutes: 2 * 1440 })).toBe("2 days before start");
    expect(describeRule({ timing: "AFTER_END", offsetMinutes: 1 })).toBe("1 minute after end");
    expect(describeRule({ timing: "AFTER_END", offsetMinutes: 0 })).toBe("at end");
  });
});
