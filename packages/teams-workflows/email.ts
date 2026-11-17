// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import BaseEmail from "@calcom/emails/templates/_base-email";
import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { ReminderMessage } from "./service";

/**
 * Sends a reminder through the snapshot's MIT mailer base class, so the
 * instance's SMTP settings, the email kill switch and test mode all apply.
 */
class TeamsReminderEmail extends BaseEmail {
  private readonly message: ReminderMessage;

  constructor(message: ReminderMessage) {
    super();
    this.name = "SEATROTA_TEAMS_REMINDER";
    this.message = message;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.message.to,
      subject: this.message.subject,
      text: this.message.text,
      html: this.message.html,
    };
  }
}

export async function deliverReminderEmail(message: ReminderMessage): Promise<void> {
  await new TeamsReminderEmail(message).sendEmail();
}
