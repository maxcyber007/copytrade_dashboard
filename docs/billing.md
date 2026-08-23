# Plans and billing

## Plans

Four seeded plans (`FREE`, `BASIC`, `PRO`, `PREMIUM`) cap how many trading
accounts and strategy subscriptions a member may run at once.

**Everyone has an effective plan.** Without a paid subscription the free tier
applies, so limit checks never special-case "no subscription", and an expired or
cancelled subscription falls back to free rather than leaving a member in an
undefined state.

Limits are enforced where the resource is created — adding a trading account and
subscribing to a strategy — and refused with `402 PLAN_LIMIT_REACHED`, so the
member is told to upgrade instead of meeting a generic error.

## Payments

Billing depends only on `IPaymentProvider`:

```ts
interface IPaymentProvider {
  readonly name: string;
  createCheckout(input): Promise<CheckoutSession>;
  getStatus(reference): Promise<PaymentStatusResult>;
  verifyWebhook(rawBody, signature): Promise<WebhookResult>;
}
```

Nothing in the interface is Stripe-shaped or Omise-shaped: a gateway is added by
writing an adapter, not by changing the subscription service.

**Money and entitlement are separated.** A `PaymentTransaction` is recorded
first, and the subscription only moves once the provider reports `PAID`. A
pending or failed payment never grants access.

`MockPaymentProvider` (`PAYMENT_PROVIDER=mock`, the default) settles immediately
without contacting anyone and collects no card details, so plan changes and the
transaction ledger can be exercised before a gateway is chosen. Selecting any
other provider throws at startup rather than at checkout.

Cancelling sets `cancelAtPeriodEnd`: access continues to the end of the paid
period instead of being removed at once.
