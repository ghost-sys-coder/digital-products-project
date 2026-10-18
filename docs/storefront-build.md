# Owner store implementation brief

The owner's 18 October 2026 request authorizes expanding the original delivery-only brief into the researched single-owner storefront. It also replaces the earlier Payment Link recommendation: products, prices, and individual checkout sessions are now managed by the application. The existing Next.js/Supabase/Stripe/Resend stack and dependency restrictions remain.

## Agreed language and boundaries

- Store: VeilCode's own public catalog, with an internal store ID for future ownership.
- Owner dashboard: authenticated management of products, uploads, pricing, publishing, orders, and store settings.
- Checkout: an individual Stripe-hosted Checkout Session created through the server API. No manually created Payment Link is needed.
- Delivery: the existing paid-webhook email and private, limited download flow, extended to use an immutable product snapshot.
- Future creators: separate stores and payment onboarding after proof of concept; not public registration in this release.

## Implementation sequence

1. Add a store, database-backed products, checkout reservations, and ownership/snapshot columns using an additive migration. Preserve original orders and legacy links.
2. Use Supabase Auth for a configured owner UUID. Validate the token with Supabase on every protected operation; keep the session in an HTTP-only, same-site cookie.
3. Let the editor create Stripe Products and immutable Prices. Validate uploads, prices, URLs, and publication requirements. Use revisions to reject stale saves.
4. Create checkout reservations with the saved price, product slug, and delivery snapshot before calling Stripe. Reuse Stripe idempotency keys for the same checkout request.
5. Match signed, paid webhooks against their reservation, account environment, amount/currency, and server metadata. Deliver the saved assets even after product edits or unpublishing.
6. Build the storefront, product detail, dashboard, products, orders/export/resend, and settings screens. Keep real empty/error/loading states.
7. Extend client-mocked tests to cover the application-managed flows and access boundaries. Run lint/build and inspect browser layouts. Document real-service setup and acceptance checks.

## Explicit first-release limits

One downloadable PDF or ZIP plus an optional template/resource URL per product. One product per purchase. USD, GBP, EUR, CAD, and AUD. Each uploaded file is capped at 3 MB and combined form uploads below 3.8 MB so saves fit Vercel's function payload limit. Original files remain in private storage because old purchases can still reference them. Owner sessions expire after at most one hour and require a fresh sign-in.

Orders and revenue shown in the dashboard cover the latest 100 purchases; CSV export covers the latest 5,000. Gross amounts are shown separately by currency. Refund and dispute processing remains in Stripe. Audience campaigns, visit attribution, freebie distribution, course hosting, memberships, and creator onboarding are later growth work from the research roadmap.

## Verification boundary

Mocked tests verify the routes and application logic but do not prove Postgres execution, live Stripe requests, Storage configuration, or inbox delivery. Those require the migration and configured owner account plus the manual purchase checks in README.md. No new production dependencies are required by this implementation.
