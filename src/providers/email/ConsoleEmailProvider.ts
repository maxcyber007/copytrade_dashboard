import { logger } from "@/lib/logger";
import type { EmailMessage, IEmailProvider } from "./IEmailProvider";

/**
 * Development delivery: writes the message to the log instead of sending it.
 *
 * Reset links are printed so the flow can be completed locally without a mail
 * server. This is why it must never be the production provider — the log is a
 * less protected place than an inbox.
 */
export class ConsoleEmailProvider implements IEmailProvider {
  readonly name = "console";

  async send(message: EmailMessage): Promise<void> {
    logger.info({
      event: "EMAIL_NOT_SENT_DEV",
      to: message.to,
      subject: message.subject,
      body: message.text,
    });
  }
}
