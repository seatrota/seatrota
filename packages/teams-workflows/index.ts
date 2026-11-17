// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export {
  assertOffset,
  type BookingState,
  type BookingWindow,
  decideReminder,
  describeRule,
  MAX_OFFSET_MINUTES,
  MAX_SEND_ATTEMPTS,
  type PlannedReminder,
  planReminders,
  type ReminderDecision,
  type ReminderRecipient,
  type ReminderRule,
  type ReminderTiming,
  reminderSendAt,
  statusAfterFailure,
} from "./schedule";
export {
  escapeHtml,
  formatInstant,
  renderReminderBody,
  renderTemplate,
  TEMPLATE_VARIABLES,
  type TemplateValues,
  type TemplateVariable,
  templateVariablesIn,
  unknownTemplateVariables,
} from "./templates";
