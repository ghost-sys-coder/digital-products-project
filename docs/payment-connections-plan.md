# Store payment connections

Research date: 2026-10-18. This is a proposed implementation plan; no payment configuration, account responsibilities, fees, or checkout routing have been changed.

## Proposed business model

Independent creators sell through their own storefronts. Each creator would be the business their customers pay and would handle payment support, refunds, and disputes. The application supplies catalog management, checkout orchestration, order records, and digital delivery. This is the proposed SaaS platform model; confirm it before implementing payment responsibilities.

Use Stripe Connect with direct charges for this model. Recommend full Stripe Dashboard access, Stripe collecting processing fees directly from connected accounts, and Stripe responsible for connected-account negative balances. The platform remains responsible for its own negative balances. This combination is supported by the Connect integration recommendations. [Stripe configuration guidance](https://docs.stripe.com/connect/integration-recommendations)

The owner confirmed that the Stripe account/business is based in the UK. Intended seller countries, onboarding route, and platform monetization remain decisions to confirm. Do not activate Connect or set fees as part of this research.

## Store owner experience

1. Open Settings → Payments → Connect Stripe.
2. Complete Stripe's authorization or onboarding flow, including any verification requirements.
3. Return to the application. The server checks the actual account capabilities; a successful redirect alone does not mean the store can accept payments.
4. See Connected, Setup incomplete, Action required, or Disconnected, with an action to resolve outstanding requirements.
5. Publish products and accept payments once the selected payment and payout readiness policy is satisfied. Continue monitoring requirements after initial onboarding.

Do not request a creator's secret API key. The application keeps its own platform credentials on the server and scopes authorized Stripe requests to the connected account.

### Existing versus new Stripe accounts

- Linking an existing independent Stripe account uses Stripe's documented Connect OAuth authorization route. Bind the one-time OAuth state to the authenticated owner, store, mode, and expiry; exchange the code once on the server; verify the returned account before saving the connection. Handle revocation and reconnection. [Connect OAuth reference](https://docs.stripe.com/connect/oauth-reference)
- For new connected accounts, evaluate Accounts v2 with embedded or Stripe-hosted onboarding. OAuth currently requires Accounts v1, so choosing account provisioning and linking behavior is an explicit implementation decision. Do not silently assume the same onboarding flow supports both or change the existing Stripe API version. [Accounts v2 limitations](https://docs.stripe.com/connect/accounts-v2)
- Disconnection must stop new checkout creation. Existing paid orders retain their original payment connection and delivery records.

## Current application findings

- `lib/stripe.ts` creates one server Stripe client from the environment.
- `lib/manage-products.ts` and `lib/checkout.ts` create products, prices, and sessions in that account without a connected-account context.
- `app/api/stripe-webhook/route.ts` deliberately ignores events with `event.account`; connected-account sales would currently never create orders.
- `lib/auth.ts` permits one environment-configured owner UID. Most catalog and admin operations use a fixed `STORE_ID`.
- Products, checkouts, and orders already have `store_id`, which provides a starting point. The current service-role access pattern requires explicit server authorization and store filters on every operation; the presence of that column alone does not isolate stores.
- Existing delivery locks, purchased-resource snapshots, private Storage, and signed downloads can be retained and extended.

## Data model

| Record | Purpose |
| --- | --- |
| Store ownership or membership | Authorize the signed-in user against a store; start with one owner role if teams are unnecessary. |
| `payment_connections` | Store, provider, environment, external account ID, connection status, readiness, and outstanding requirements. Keep secrets out of browser DTOs. |
| `product_payment_refs` | Map an application product and connection to provider product/price references. Stripe IDs belong to their account and environment. |
| `payment_attempts` | Application order/checkout reference, connection, provider session/order/capture references, expected amount/currency, and verified payment state. |
| `payment_events` | Provider, environment, account, event ID, processing state, and retry information for deduplication and reconciliation. |
| Orders | Keep payment state separate from email delivery state, and retain the original connection and purchased-resource snapshot. |

Allow Stripe and PayPal connections to coexist, with at most one current connection per store/provider/environment for the first release. Preserve historical connections instead of rewriting old payments when a store reconnects another account. Use composite foreign keys and scoped uniqueness where needed to prevent cross-store references. Client input must never decide the destination account, price, or application fee.

## Checkout and fulfillment

Keep one small payment-provider interface: start checkout, retrieve and verify payment, verify incoming events, and normalize payment outcomes. Implement Stripe first; PayPal can later implement the same contract with its own order/capture semantics.

Create Stripe products, prices, Checkout Sessions, payment lookups, and refunds in the same connected-account context. Direct charges with hosted Checkout are documented by Stripe. [Direct-charge Checkout](https://docs.stripe.com/connect/direct-charges?platform=web&ui=stripe-hosted)

Listen for connected-account events using a correctly configured event destination and signing secret. Resolve the store from the verified event's account and environment, then validate the reserved checkout, amount, currency, and product. Metadata alone must not authorize an order or select its store. Fulfill only verified successful payments, including asynchronous payment success. Track account requirement changes and authorization revocation. [Connect webhooks](https://docs.stripe.com/connect/webhooks)

The existing delivery service should consume a verified application payment result rather than depend on Stripe session IDs throughout its public interface. Deduplicate payment events and fulfillment work, retain the delivery lock, and provide reconciliation for missed events. Do not promise exactly-once email across the database and email provider; the existing response-loss uncertainty still needs reconciliation.

If a buyer starts multiple provider attempts for one application order, permit only one fulfillment winner. Detect any additional successful payment for review/refund rather than silently delivering twice or dropping the extra payment.

## PayPal later

Add a PayPal provider with seller onboarding, merchant identity, server-side order creation/capture verification, verified webhooks, and refund handling. Approval in the browser is not proof of a completed capture. Use PayPal's platform offering for connecting other sellers; adding PayPal as a buyer payment method through Stripe is a different feature. PayPal permits sandbox development but requires platform approval and live credentials for launch. [PayPal platform overview](https://developer.paypal.com/platforms/overview)

## Delivery sequence

1. Confirm platform business country, intended seller countries, merchant responsibilities, existing-account linking, and whether platform fees are subscription-based, per transaction, or initially zero.
2. Implement provider-neutral data and a compatibility path for the current store's platform-account payments. Keep current products and historical orders associated with their original account.
3. Implement store ownership checks and server-scoped data access before inviting another creator. Add store routing and remove fixed-owner/fixed-store assumptions from relevant paths, including files and support identity.
4. Add Stripe connection UI, onboarding/authorization, account-scoped product synchronization and checkout, connected-account webhooks, and reconciliation.
5. Test in sandbox with two stores: authorization isolation; separate Stripe accounts and product IDs; incomplete onboarding; wrong account/mode/amount; duplicate and delayed events; disconnect/reconnect; refunds/disputes; and delivery retries. Complete a real purchase/delivery acceptance check before live seller onboarding.
6. Add PayPal when the platform is approved, using the same application order and delivery flow.

Platform subscription billing and application fees are separate from creators' customer payments. No fee amount is assumed here. For direct charges where Stripe bills the connected account, an optional application fee would represent the platform's agreed fee; do not add an estimated processing fee by default. Validate country-specific pricing before committing to commercial terms. [Stripe pricing](https://stripe.com/pricing)
