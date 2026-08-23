export type CheckoutInput = {
  userId: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  /** Where the provider should return the member after payment. */
  returnUrl: string;
};

export type CheckoutSession = {
  /** Provider-side reference, stored on the PaymentTransaction. */
  reference: string;
  /** Where to send the member. Null for a provider that settles immediately. */
  redirectUrl: string | null;
  status: "PENDING" | "PAID";
};

export type PaymentStatusResult = {
  reference: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "CANCELLED";
  paidAt?: Date;
  failureReason?: string;
};

export type WebhookResult = { reference: string; status: PaymentStatusResult["status"] };

/**
 * The only contract billing logic may depend on.
 *
 * Nothing here is Stripe-shaped or Omise-shaped on purpose: a gateway is added
 * by writing an adapter, not by changing the subscription service.
 */
export interface IPaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  getStatus(reference: string): Promise<PaymentStatusResult>;
  /** Verifies a signed callback and reports what it says. */
  verifyWebhook(rawBody: string, signature: string | null): Promise<WebhookResult>;
}
