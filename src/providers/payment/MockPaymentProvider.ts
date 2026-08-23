import { randomToken } from "@/lib/crypto";
import { AppError, ErrorCode } from "@/lib/errors";
import type {
  CheckoutInput,
  CheckoutSession,
  IPaymentProvider,
  PaymentStatusResult,
  WebhookResult,
} from "./IPaymentProvider";

/**
 * Settles immediately without contacting anyone. It exists so plan changes and
 * the transaction ledger can be exercised before a gateway is chosen — no card
 * details are collected, and nothing leaves the process.
 */
export class MockPaymentProvider implements IPaymentProvider {
  readonly name = "mock";

  private readonly settled = new Map<string, PaymentStatusResult>();

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const reference = `mock_${randomToken(12)}`;

    // A free plan needs no payment step at all.
    const status = input.amount <= 0 ? "PAID" : "PAID";
    this.settled.set(reference, { reference, status, paidAt: new Date() });

    return { reference, redirectUrl: null, status };
  }

  async getStatus(reference: string): Promise<PaymentStatusResult> {
    const result = this.settled.get(reference);
    if (!result) throw new AppError(ErrorCode.NOT_FOUND, `Unknown payment reference ${reference}`);
    return result;
  }

  async verifyWebhook(): Promise<WebhookResult> {
    // No gateway, so no callbacks to verify.
    throw new AppError(ErrorCode.PROVIDER_ERROR, "The mock payment provider does not send webhooks");
  }
}
