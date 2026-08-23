import { getEnv } from "@/lib/env";
import { AppError, ErrorCode } from "@/lib/errors";
import type { IEmailProvider } from "./IEmailProvider";
import { ConsoleEmailProvider } from "./ConsoleEmailProvider";
import { SmtpEmailProvider } from "./SmtpEmailProvider";

const globalForEmail = globalThis as unknown as { emailProvider?: IEmailProvider };

export function getEmailProvider(): IEmailProvider {
  if (globalForEmail.emailProvider) return globalForEmail.emailProvider;

  const env = getEnv();
  let provider: IEmailProvider;

  switch (env.EMAIL_PROVIDER) {
    case "console":
      // Printing a reset link to the log is fine in development and unacceptable
      // in production, so refuse the combination outright.
      if (env.NODE_ENV === "production") {
        throw new AppError(
          ErrorCode.PROVIDER_ERROR,
          "EMAIL_PROVIDER=console writes reset links to the log; configure SMTP for production",
        );
      }
      provider = new ConsoleEmailProvider();
      break;

    case "smtp":
      provider = new SmtpEmailProvider({
        host: env.SMTP_HOST ?? "",
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.EMAIL_FROM ?? "",
      });
      break;

    default:
      throw new AppError(ErrorCode.PROVIDER_ERROR, `Unknown email provider: ${env.EMAIL_PROVIDER}`);
  }

  globalForEmail.emailProvider = provider;
  return provider;
}
