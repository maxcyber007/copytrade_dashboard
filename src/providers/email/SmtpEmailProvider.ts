import nodemailer, { type Transporter } from "nodemailer";
import { logErrorEvent, logEvent } from "@/lib/logger";
import { AppError, ErrorCode } from "@/lib/errors";
import type { EmailMessage, IEmailProvider } from "./IEmailProvider";

export type SmtpConfig = {
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
};

/** Delivery over SMTP. Credentials come from the environment, never from code. */
export class SmtpEmailProvider implements IEmailProvider {
  readonly name = "smtp";
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpConfig) {
    if (!config.host || !config.from) {
      throw new AppError(ErrorCode.PROVIDER_ERROR, "SMTP_HOST and EMAIL_FROM are required for SMTP delivery");
    }

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // 465 is implicit TLS; other ports negotiate STARTTLS.
      secure: config.port === 465,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      const result = await this.transporter.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      // The recipient address is logged; the body never is.
      logEvent({ event: "EMAIL_SENT", to: message.to, subject: message.subject, messageId: result.messageId });
    } catch (error) {
      logErrorEvent({
        event: "EMAIL_SEND_FAILED",
        to: message.to,
        subject: message.subject,
        reason: error instanceof Error ? error.message : "unknown",
      });
      throw new AppError(ErrorCode.PROVIDER_ERROR, "Could not send the email");
    }
  }
}
