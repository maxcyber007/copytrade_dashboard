import { getEnv } from "@/lib/env";
import { AppError, ErrorCode } from "@/lib/errors";
import type { IPaymentProvider } from "./IPaymentProvider";
import { MockPaymentProvider } from "./MockPaymentProvider";

const globalForPayment = globalThis as unknown as { paymentProvider?: IPaymentProvider };

export function getPaymentProvider(): IPaymentProvider {
  if (globalForPayment.paymentProvider) return globalForPayment.paymentProvider;

  const configured = getEnv().PAYMENT_PROVIDER;
  if (configured !== "mock") {
    // Written when a gateway is actually chosen, against its own documentation.
    throw new AppError(ErrorCode.PROVIDER_ERROR, `The ${configured} payment provider is not implemented yet`);
  }

  const provider = new MockPaymentProvider();
  globalForPayment.paymentProvider = provider;
  return provider;
}
