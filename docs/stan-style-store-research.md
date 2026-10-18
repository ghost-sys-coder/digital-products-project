# VeilCode's Stan-style store: research and implementation roadmap

Researched: 18 October 2026.

## Scope agreed with the owner

Start with VeilCode selling its own digital products. Other creators will be considered after real product sales demonstrate demand. This document is a research and planning artifact; it does not implement the expanded product or change the original delivery brief.

Recommendation: build a focused creator storefront around the existing delivery service, using the existing stack. Add explicit store ownership to the data model now. Defer public creator registration, creator subscriptions, connected payment accounts, and payout management until there is evidence for a platform business.

## What Stan currently offers

Stan's official help center lists Creator at $29/month or $300/year and Creator Pro at $99/month or $948/year. The base offering covers a storefront, digital products, bookings, courses, memberships, lead capture, analytics, communities, and Instagram automation. Pro adds promotion and marketing tools such as discounts, funnels, upsells, order bumps, affiliates, broadcasts, and email flows. These prices and features are a reference point, not proposed requirements for our first release. [Stan plan comparison](https://help.stan.store/article/31-creator-vs-creator-pro).

Stan charges a subscription rather than a percentage of sales; payment-processor fees still apply. [Stan transaction-fee explanation](https://help.stan.store/article/83-does-stan-take-a-percentage-of-my-sales).

For digital downloads, the relevant experience is an editable product listing and checkout page, followed by delivery of an uploaded file or an external resource. This is the closest match to our PDF and Google Drive template kit. [Stan digital-download setup](https://help.stan.store/article/14-sell-a-digital-download-product).

Stan also supports a freebie landing page connected to email collection, which is useful for building an audience before a sale. [Stan lead-magnet setup](https://help.stan.store/article/241-how-to-create-a-landing-page-for-a-freebie-or-lead-magnet).

## What the repository already has

The inspected application includes signed Stripe webhook verification, paid-session filtering, replay handling, per-order delivery locking, private Supabase Storage downloads, hashed expiring tokens, atomic download limits, Resend delivery emails, and a secret-protected support resend endpoint. There are static payment-confirmation and expired-link pages.

It has one configured product in `lib/products.ts`, one `orders` table, no owner login, no product editor, no sales dashboard, and no storefront: the root page currently redirects to `https://veilcode.studio`. Existing automated checks cover mocked clients, but actual Supabase, payment, PDF, and inbox acceptance still needs completion.

The delivery code is reusable groundwork. It is not evidence that a creator platform or a complete customer-facing store has been built.

## First release: the experience to build

| Area | First-release behavior | Existing foundation |
| --- | --- | --- |
| Storefront | Your photo/logo, introduction, social links, product cards, featured product, mobile-first layout | New public pages |
| Product pages | Cover, description, benefits, included files/resources, current price, support/refund information, buy button | Existing product configuration and Stripe link |
| Product management | Owner-only create/edit, draft/publish, reorder, image/PDF upload, resource URL, Stripe price/link mapping | Replace code-only product configuration with database records |
| Checkout | Buy one product at a time through Stripe-hosted checkout; guest purchase | Keep existing Payment Link flow initially |
| Delivery | Branded confirmation, existing secure email/download flow, support resend | Extend existing delivery service |
| Sales dashboard | Orders, recorded purchase email, date, product, charged amount/currency, delivery status, export | Existing order data |
| Basic reporting | Product visits, checkout clicks, paid orders, gross revenue by currency, delivery failures | Add aggregate measurements and queries |
| Audience capture | A free sample/checklist, delivery email, recorded marketing opt-in where offered, CSV export | Add a contact/consent flow |
| Store settings | Brand text/colors, support contact, public links, product order | One store record |

Keep checkout focused on one product per purchase. Add bundles as a product containing multiple assets if needed, before introducing a cart. No buyer account is required for downloadable products.

Use your own design, writing, and branding. Stan provides a useful workflow reference; copying its complete feature set is not necessary to test product demand.

## Payment approach for your store

Continue selling through your existing Stripe account. Stripe Payment Links can be shared on a website and support additional capabilities such as promotion codes, tax settings, and optional items. We do not need to replace the working payment flow simply to add a storefront. [Stripe Payment Links](https://docs.stripe.com/payment-links).

For the initial launch, store the product's Payment Link and Stripe Price references in the database. Stripe remains the source of truth for the price; retrieve or synchronize the displayed price server-side. Preserve the charged amount/currency on every order. Do not accept an authoritative price from a browser request.

When the product editor should manage pricing without visiting Stripe, add server-side Stripe Product/Price and Payment Link management. Keep publishing disabled until both the product assets and payment mapping are valid. If we later need per-order checkout metadata or a more integrated checkout flow, generate Checkout Sessions server-side. Stripe offers hosted and embedded Checkout options; custom card-entry UI is not a first-release requirement. [Stripe Checkout](https://docs.stripe.com/payments/checkout).

Refund actions can remain in Stripe initially. Before showing net revenue or refunded-order states in our dashboard, synchronize the corresponding payment/refund events. Treat delivery status and payment/refund status as separate concepts. Review the store's refund policy, tax configuration, and customer-facing seller details before launch; enabling a payment provider does not by itself resolve tax responsibility. [Stripe tax guidance for platforms](https://docs.stripe.com/tax/connect).

## Architecture that leaves room for other creators

Keep Next.js, TypeScript, Supabase Postgres/Storage, Stripe, Resend, and Vercel. Use Supabase Auth for the owner dashboard, with an explicitly permitted owner account and no public creator onboarding.

Suggested initial data changes:

| Record | Purpose |
| --- | --- |
| `stores` | One VeilCode row, owner user ID, slug, public profile, theme, support settings |
| `products` | Store ID, slug, draft/published state, description, cover, Stripe references, sort order |
| `product_assets` | Store/product IDs, private object path or delivered resource URL, filename, asset kind |
| Existing `orders` | Add store ownership and durable product/payment snapshots; retain existing token and lock behavior |
| `contacts` | Store-scoped email, source, opt-in state, and consent timestamps where collected |
| `webhook_events` | Provider event ID, processing state, attempts, and safe diagnostic identifiers |

Additional delivery-attempt or job records can be introduced when adding durable email retries. Separate order line items and download grants become useful for carts, more complex bundles, or buyer libraries; they are not mandatory for the first one-product checkout.

Design rules:

- Every business record belongs to a store, even while only one store exists.
- Use UUIDs as internal product identifiers and store-scoped slugs for URLs.
- Scope uniqueness such as product slug and contact email to the store.
- Enforce store/product consistency in database relationships, not just browser filters.
- Authorize every dashboard read and mutation. A hidden route or shared header secret is not sufficient for an owner-facing admin UI.
- Keep public catalog fields separate from purchased resource URLs and private asset access.
- Scope private storage objects by store/product; retain server-side permission checks and signed buyer downloads.
- Keep service-role operations server-side, with explicit authorization: the service role bypasses RLS. Add database-level access tests for signed-out visitors, the owner, and a simulated second owner before allowing additional creators. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access controls](https://supabase.com/docs/guides/storage/security/access-control).
- Add new migrations rather than rewriting `001_orders.sql` after it has been applied. Backfill existing orders into the VeilCode store before enforcing new ownership constraints.

Start with `/` for the store, `/p/[slug]` for a product, and protected `/admin` pages. The database store ID allows future public routes such as `/s/[storeSlug]` without changing order ownership.

## Delivery and email improvements

Generalize the current product-specific email into a template using stored product names, asset lists, store branding, and support details. Preserve transactional email separately from marketing subscriptions.

For lead magnets, record what the person requested and any separate marketing choice. Add unsubscribe and suppression handling before broadcasts. Resend distinguishes transactional mail from marketing mail and requires unsubscribe links for marketing messages. [Resend unsubscribe guidance](https://resend.com/docs/knowledge-base/should-i-add-an-unsubscribe-link).

The current pending-token rotation design can send another email if Resend accepted the first request but the result or database update was lost. Keep this known limitation visible when extending fulfillment. Before increasing volume, choose a durable delivery-job design, bounded retries, provider message tracking, alerts for pending orders, and an explicit recovery strategy for uncertain provider results. A queue alone does not guarantee exactly-once delivery across services.

## Build order and acceptance gates

1. **Prove the existing delivery path.** Complete the real Supabase migration/storage setup and test-mode purchase, Gmail delivery, replay, failed-send recovery, download limit, and support resend checks. Then validate a controlled live sale when ready.
2. **Launch a credible storefront.** Add the branded store and a product page for Lead to Kickoff, current Stripe price/link, mobile layout, and clear product/support information. A visitor must be able to discover, buy, and receive the product without manual help.
3. **Make the catalog owner-manageable.** Add owner authentication, the single-store schema, private asset uploads, publish controls, and order/resend dashboard. Acceptance: publish a second product without editing application code, and prove that its checkout delivers its own assets.
4. **Measure demand and improve conversion.** Add first-party product visits and checkout clicks, source attribution where available, freebie capture, and customer export. Define metrics consistently: a checkout click is not a completed or necessarily started Stripe checkout. Report gross revenue separately by currency; add refunds and processing fees before claiming net revenue.
5. **Add growth features from evidence.** Prioritize whichever customer behavior supports: discount codes, a bundle, post-purchase recommendations, a buyer download library, or follow-up email. Courses, coaching bookings, memberships, affiliate payouts, communities, and Instagram automation each add a separate subsystem; only build one when the offer needs it.

Suggested decision gates, not external benchmarks: launch the first paid product, publish a second without code changes, demonstrate reliable fulfillment across repeated real sales, and learn why buyers purchase or ask for refunds. Before building for other creators, interview a small group and recruit several who are willing to use and pay for it. Sales of your own products establish the commerce proof of concept; they do not alone establish demand for a creator SaaS platform.

## Later: inviting other creators

At that point, introduce store memberships/roles, onboarding, support tooling, per-store quotas, account suspension, data export/deletion, and billing for your software if charging creators. Validate complete cross-store isolation before accepting anyone else's files or buyer data.

Other creators' payments would need a separate payment architecture. Stripe distinguishes SaaS platforms that let independent sellers accept customer payments from marketplaces that collect and distribute payments. Research the SaaS approach for independent creator stores; agree on onboarding, dashboard access, fee collection, refunds/disputes, loss responsibility, and tax responsibilities before choosing the final Connect configuration. Keep VeilCode's own product sales separate from creator subscription billing. [Stripe SaaS platforms and marketplaces](https://docs.stripe.com/connect/saas-platforms-and-marketplaces).

Verify intended creator countries against the selected Connect model. A UK Stripe account does not automatically make every country eligible for creator onboarding or payouts. Stan itself publishes a limited creator-country list; Stripe's cross-border payout availability has its own eligibility conditions. If Uganda-based creators are a future audience, validate that exact account/funds-flow combination with the provider before promising support. [Stan creator-country availability](https://help.stan.store/article/217-countries-available-for-stripe-custom-accounts), [Stripe cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts).

Connect also adds connected-account event handling. For applicable connected-account events, the signed event's top-level `account` identifies the account that owns the object; seller mapping and environment checks must be part of fulfillment. This is a future extension, not something the current one-seller webhook already handles. [Connect webhooks](https://docs.stripe.com/connect/webhooks).

Platform economics will depend on the selected fee model, seller countries, subscriptions, payouts, email volume, storage, bandwidth, and support costs. Do not reuse Stan's processor rates or assume one universal Connect fee for our business. [Stripe Connect pricing](https://stripe.com/connect/pricing).

## Planning limits and next implementation deliverable

This is based on the current repository and public vendor documentation, not access to Stan's internal architecture or conversion data. The phased scope is our recommendation. No fixed delivery date or hosting-cost estimate is justified yet without product count, asset sizes, traffic/email assumptions, and finalized dashboard requirements.

The next useful implementation brief should specify the storefront and product fields, owner login/access rules, schema migration and backfill, upload limits, price synchronization, order/resend dashboard, metric definitions, and end-to-end acceptance tests. The original starter explicitly excluded accounts, storefronts, analytics, and admin UI; that scope needs a new brief before implementation. Any new dependencies remain subject to the project's existing dependency-approval rule.
