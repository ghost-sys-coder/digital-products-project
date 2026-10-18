# VeilCode Studio shop

A single-owner digital product store built with Next.js App Router, TypeScript, Supabase, Stripe, and Resend. Create products, set prices, upload downloads, and publish from `/admin`. Buyers browse `/`, open `/p/<slug>`, and pay through a Stripe Checkout Session created by the application. **No Stripe Payment Links are needed.**

## What is included

- Public storefront and product pages with a responsive light theme.
- Owner login, product editor, private PDF/ZIP and image uploads, draft/publish controls, price and currency editing, and display ordering.
- Automatic Stripe Product/Price creation. Changing the amount creates a new immutable Stripe Price; old purchases keep their original amount.
- Individual hosted Checkout Sessions created server-side, with idempotency and a saved purchase snapshot.
- Signed webhooks for paid immediate/asynchronous checkouts, secure delivery emails, 14-day download tokens, five-download limit, and 60-second private Storage URLs.
- Dashboard, recent orders, gross sales grouped by currency, CSV export, corrected-email support resends, and storefront settings.
- Internal store ownership, ready to extend later. There is one configured owner; no public seller signup or connected-account payout system.

The detailed current scope is in `docs/storefront-build.md`. The research roadmap in `docs/stan-style-store-research.md` describes later audience, analytics, and platform work; its earlier Payment Link recommendation is superseded by the owner request and this implementation.

## 1. Install and configure

Use Node.js 22.12+ and npm:

```sh
npm install
cp .env.example .env.local
```

On PowerShell, use `Copy-Item .env.example .env.local` only if you do not already have local secrets. Set the variables in your existing `.env.local` instead of overwriting it.

| Variable | Value |
| --- | --- |
| `APP_URL` | `http://localhost:3000` locally; your HTTPS app origin on Vercel, with no path/query/fragment |
| `STRIPE_SECRET_KEY` | Your account's Stripe test/sandbox secret or appropriately permissioned restricted key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the local listener or deployed webhook endpoint |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key |
| `SUPABASE_BUCKET` | Private bucket name, normally `products` |
| `RESEND_API_KEY` | Resend key permitted to send from the verified mail domain |
| `OWNER_USER_ID` | The UUID of your permitted Supabase Auth user |

Optional legacy variables: `ADMIN_SECRET` enables the old header-authenticated `/api/admin/resend` support endpoint. `STRIPE_PAYMENT_LINK_ID_L2K` allows outstanding old Payment Link checkouts to be fulfilled. `L2K_TEMPLATES_URL` supports old Lead to Kickoff purchases and prefills the seeded product's resource URL. These are not needed for application-created products and checkouts.

Required service configuration is validated at first use; owner configuration is validated when authentication needs it. Builds do not need service access. Never prefix secret variables with `NEXT_PUBLIC_`. All database/payment/email clients use Next.js's server-only guard.

## 2. Apply the Supabase migrations

For the SQL Editor setup used by this project, run the files in this order:

1. `supabase/migrations/001_orders.sql` — original order table and delivery/download functions.
2. `supabase/migrations/20261018060336_storefront_catalog.sql` — store, products, checkout reservations, order ownership/snapshots, and the extended download function.

If you already ran `001_orders.sql`, **run only the new storefront migration**. Each file is a transaction and is intended to run once. Do not drop existing tables or rerun the initial migration to upgrade. The new migration preserves original order rows, seeds one VeilCode store, and adds Lead to Kickoff as a **draft** without a hard-coded price or Stripe ID.

In the Supabase dashboard, open the intended project → SQL Editor → new query, paste the entire file, and run it. Confirm `stores`, `products`, `checkouts`, and `orders` exist. All are protected by RLS, with no `anon`/`authenticated` grants or policies; the application server controls public catalog data and owner access. RPC execution is limited to the service role.

SQL Editor execution does not update the CLI migration-history table. If adopting CLI-managed migrations later, reconcile the manual history first instead of running `db push` blindly. The original filename `001_orders.sql` is retained for compatibility with the original delivery brief.

Create a **private** Storage bucket named `products`. Keep public object access disabled. Existing Lead to Kickoff purchases expect `lead-to-kickoff/lead-to-kickoff.pdf`; upload that PDF there if you have not already. New files are uploaded by the editor into store/product-scoped paths. Cover images are served through a route that only exposes published products; paid downloads never use a public object URL.

## 3. Create your owner account

1. In Supabase → Authentication → Users, create your owner user with an email and a strong password. Confirm the email when creating it, or complete the provider's confirmation flow.
2. Copy that user's UUID into `OWNER_USER_ID`.
3. Keep public signups disabled for this owner-only release. There is no signup page in the app.
4. Restart the app after environment changes and visit `/admin/login`.

The server verifies the access token with `auth.getUser(token)` on every protected request and compares the user ID against `OWNER_USER_ID`. Knowing an email address, a route URL, or user-editable metadata grants no access. Sessions are stored in HTTP-only, same-site cookies and expire after at most one hour. Sign in again when prompted; refresh tokens are not stored in this release. Login and other browser mutations require an Origin matching `APP_URL`.

The first successful login records the configured owner UUID on the seeded store. This deployment remains single-owner even though data has store ownership fields.

## 4. Configure payments and email

Use your own existing Stripe account; Connect is not needed for your own product sales. The SDK API version is explicitly pinned to `2026-09-30.endive` in `lib/stripe.ts`.

For a deployed test environment, create a public webhook endpoint at `${APP_URL}/api/stripe-webhook` for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Choose the matching API version, use events from your own account, and copy the endpoint secret to `STRIPE_WEBHOOK_SECRET`. Stripe keys need access to create/retrieve/update Products, create/retrieve Prices, and create/retrieve Checkout Sessions. A suitably scoped restricted key can be used instead of a broad secret key.

Verify Resend can send from `VeilCode Studio <orders@mail.veilcode.studio>`. Delivery email replies currently go to `support@veilcode.studio`; changing the storefront support field does not reconfigure the verified email sender or reply-to. No marketing broadcasts are sent by this app.

## 5. Create and publish a product

```sh
npm run dev
```

Sign in at `/admin`, open **Products**, and choose **Add a product** or edit the seeded Lead to Kickoff draft.

1. Enter the name, URL slug, short/full descriptions, and included items.
2. Upload one PDF or ZIP. For multiple resources, package them in a ZIP. Add an optional HTTPS template/resource folder URL; it will be delivered in the email.
3. Upload an optional PNG, JPEG, or WebP cover. Without one, the storefront uses a simple typographic studio cover.
4. Set your amount and choose USD, GBP, EUR, CAD, or AUD. These supported currencies use two decimal places.
5. Save as draft or choose **Published**, then save. Publishing requires descriptions, an attached download, and successfully created Stripe product/price references.
6. Open the public product link. The buy button creates a unique Checkout Session automatically. There is no Payment Link setup step.

PDF/ZIP downloads support **5 MB**, and covers retain their existing **3 MB** allowance. The editor uploads directly to private Supabase Storage using owner-authorized, object-scoped signed URLs, then submits a small metadata form. This avoids Vercel's [4.5 MB function payload limit](https://vercel.com/docs/functions/limitations) and allows both files in one save. A signed receipt binds each object to its store, product, kind, revision, expected size/type, and two-hour expiry. The server checks Storage metadata and actual file contents before attaching it. Uploaded objects use unique paths and cannot be overwritten; old purchase snapshots retain their original files. Interrupted or failed saves can leave unattached objects, so avoid automatic deletion without checking purchase references.

Successful creation shows a **Product created** popup for four seconds; later saves show **Product saved**. Notifications remain across dashboard navigation, can be dismissed manually, and appear only after the save succeeds. Uploading and saving have separate progress messages.

Amounts displayed in the catalog mirror the immutable Stripe Price saved by the editor. Checkout retrieves and checks that Price before reserving a purchase, uses its server-stored ID, and ignores browser-provided amounts. Product revisions reject stale edits from another tab. Stripe and Postgres are separate services; if a save fails between them, retry the draft and check the product before publishing. Unreferenced Stripe prices or Storage files may remain after failed saves and should not be deleted without checking purchase references.

Checkout stores the delivery snapshot **before** requesting a Stripe session. Paid webhooks validate that reservation, currency, subtotal, session binding, store/product metadata, and environment. Signed events for other checkouts are acknowledged without fulfillment. A product can later be edited or unpublished without changing what an existing paid buyer receives. Delivery remains triggered by paid webhooks, never by the thank-you page.

This release uses one product per checkout and one-time payments. Adaptive Pricing is explicitly disabled so the reserved amount/currency stays consistent. Automatic tax collection is not enabled by this implementation; configure the appropriate tax behavior and registrations before relying on tax calculation. Refunds and disputes are handled in Stripe, and their statuses are not yet synchronized to this dashboard.

## 6. Test the full purchase flow

For local webhook forwarding:

```sh
npm run dev
# In a second terminal, keep this running throughout local payment testing:
npm run stripe:listen
```

The Stripe CLI must be installed (`npm install -g @stripe/cli`). The helper uses the test key already in `.env.local`, forwards only the two Checkout payment events from your own account, and writes the matching signing secret into `.env.local` without printing it. Set `APP_URL=http://localhost:3000`; restart Next.js if it does not pick up the updated secret. Keep the listener running for every local purchase. Opening the thank-you page does not record or fulfill an order. The local listener secret differs from a deployed endpoint secret; the helper refuses live keys and non-local origins.

For a deployed store, configure its public Stripe webhook endpoint as described above. The local listener is not a replacement for deployed webhook configuration. Do not mix test and live product IDs or webhook secrets.

To recover sandbox purchases made while the webhook was disconnected:

```sh
npm run orders:recover
npm run orders:recover -- --record
```

The first command is a dry run. The second verifies each session directly with Stripe against its saved reservation, then records missing paid orders as **pending** without sending emails or changing an existing order. It examines the latest 500 checkout reservations. Restore any missing purchased files before using the authenticated order resend control. Existing purchases retain their original snapshot paths; uploading a replacement for the current product does not repair an older missing snapshot automatically.

Publishing, checkout creation, and delivery now verify that the referenced download actually exists in the private bucket. A seeded filename/path does not mean the file has been uploaded. Missing files block new checkout and keep already-paid orders pending; delivery is retried only after the original asset has been restored.

Publish a product from the dashboard, open its page, click **Get the kit**, and use Stripe's test card `4242 4242 4242 4242`, any future expiry, and any three-digit CVC. Verify:

1. Checkout shows the amount/currency you set and returns to `/thank-you`.
2. The paid webhook returns 200, one order appears, and one email reaches your Gmail inbox with the expected sender, usually within a minute. Actual inbox placement requires a real test; mocks cannot prove it.
3. The file downloads with the saved filename. The sixth attempt redirects to `/download-error`. Resource links open correctly.
4. A replay sends no second email. For a registered test endpoint, run `stripe events resend evt_... --webhook-endpoint we_...`.
5. An invalid Resend API key causes a 500 and a pending order. Restore the key, restart/redeploy, and replay or wait for a Stripe retry. The retry should deliver successfully.
6. Edit or unpublish a product after starting checkout; the resulting purchase must still deliver the saved asset version.
7. From **Orders**, resend to the purchase address or a corrected one. Confirm the old link stops working and the new link has a fresh 14-day/five-download allowance.
8. An expired/signed-out session cannot edit products, change settings, resend orders, or export buyer data.

`stripe trigger` cannot fully test the app's reserved checkout mapping. Make the test purchase through the storefront.

## Owner operations

The overview and order list cover the **latest 100 orders**. Gross sales are grouped by currency and are before fees/refunds. The pending count refers to that same window. CSV export contains the latest **5,000** orders; it excludes token hashes and private resource paths and escapes formula-like spreadsheet values. Buyer addresses are purchase contacts, not marketing opt-ins.

The owner dashboard uses session authentication for support resends. For existing automation only, the optional legacy endpoint still accepts:

```sh
curl -X POST "$APP_URL/api/admin/resend" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  --data '{"stripe_session_id":"cs_test_...","email":"corrected@example.com"}'
```

Wrong/missing secrets return 401; the endpoint is unavailable if `ADMIN_SECRET` is not configured. On Windows use a Bash-compatible shell for that example, or `curl.exe` with PowerShell environment-variable syntax. Normal owner operation does not require this endpoint or a shared admin secret.

## Reliability and security details

Saving a product syncs its name, description, and uploaded cover to Stripe along with its default price. Before opening a new checkout, the app refreshes those details for existing products too. Checkout uses the full product description, falling back to the short description when empty. Covers use a 48-hour signed Supabase URL refreshed for each new session, covering Stripe's maximum 24-hour checkout lifetime and working during localhost development. Only cover artwork is shared with Stripe; the bucket stays private and paid download links keep their existing delivery controls. Existing open sessions are reused; start a fresh checkout to see newly changed product details.

Tokens are 32 random bytes encoded as base64url; only their SHA-256 hashes are stored. Downloads consume a count with one atomic SQL update before creating a signed URL. Responses use no-store/no-referrer headers. A Storage signing outage returns 503 and still consumes the attempt, as in the original brief.

Webhook and support sends claim a five-minute database lease before rotating tokens. Routes are capped at 60 seconds; keep hosting execution limits below the lease. Resend calls have a 15-second timeout and a token-specific idempotency key. Pending failures return 500 for Stripe retry; a crashed request's lease eventually expires.

There is no transaction spanning Stripe, Resend, and Postgres. If Resend accepts mail but its response or the sent-state write is lost, a retry can issue a second email with a fresh token. The lease prevents simultaneous senders, not every uncertain cross-service outcome. Use the latest email or owner resend in that case. A durable delivery-job/reconciliation system is later scaling work.

Application logs omit raw tokens, signed URLs, complete request bodies, passwords, and provider payloads. Avoid adding query/body logging in hosting or observability tools. Keep the service role and Stripe/Resend keys server-only. The initial table and RPC grants remain restricted to the service role.

## Verification

```sh
npm test
npm run lint
npm run build
```

The tests mock Stripe, Supabase, and Resend while exercising route, catalog, checkout, upload-validation, owner-auth, delivery, token, and export logic. They cover unauthorized/cross-origin requests, price tampering, drafts, store ownership, repeated and concurrent checkout requests, webhook replays, delivery snapshots, failed-send retries, download limits, and support actions. Database migration execution and live-service acceptance are separate checks.

The starter dependency graph has existing npm audit findings in shadcn/ESLint's `braces`/`micromatch`/`fast-glob` tooling chain. No forced unrelated upgrades were applied. No new production dependencies were added for this storefront build.

## Deploy and go live

### Stripe account connections

The owner can link an existing independent Stripe account in **Store settings → Payments**. The initial release still has one owner/store; creator signup, store switching, custom storefront domains, and PayPal are not enabled. No platform transaction fee is charged.

1. Apply `supabase/migrations/20261018115534_store_payment_connections.sql` before deploying the Connect code. This migration is already applied to the configured VeilCode Supabase project. It preserves existing orders and platform-account references.
2. In the UK platform's Stripe Connect OAuth settings, register the exact callback `https://pod.veilcode.studio/api/admin/payments/stripe/callback`. Add `http://localhost:3000/api/admin/payments/stripe/callback` separately for local testing if needed. Copy the client ID for the same Stripe mode as the API key into `STRIPE_CONNECT_CLIENT_ID`.
3. Register a **connected-account** webhook at `https://pod.veilcode.studio/api/stripe-connect-webhook`, using API version `2026-09-30.endive`, subscribed to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `account.updated`, and `account.application.deauthorized`. Put its signing secret in `STRIPE_CONNECT_WEBHOOK_SECRET`; keep the original platform webhook and `STRIPE_WEBHOOK_SECRET`. The sandbox Connect endpoint and production secret are already configured for the current deployment.
4. Set `STRIPE_CONNECT_ENABLED=true` only when the client ID, callback, and webhook are configured, then deploy. The current test-mode deployment is configured: OAuth is enabled, both callbacks are registered, and the client ID and enabled flag are saved locally and in Vercel Production. Disabling this switch later only disables connection-management actions: an existing connected account is never silently replaced by the platform account.
5. In the owner dashboard, choose **Connect Stripe** and complete authorization yourself. Use a separate independent seller account; the platform account continues serving its own store without connecting to itself. No raw seller API keys or OAuth access tokens are stored. Check status to refresh account readiness. Stripe must permit card payments and payouts before new checkout is accepted.
6. Complete a sandbox authorization and purchase/delivery acceptance check before enabling live connections. Test/live connection rows and product references are separate. Switching live payment mode requires a live client ID, live connected-account webhook secret, and live account authorization.

Product/Price references belong to their connected account. Checkouts and orders retain their original payment connection, so switching accounts does not rewrite purchases. Disconnecting pauses new checkout and retains existing orders and downloads. Paid historical sessions can still fulfill after switching accounts. Buyers use Stripe-hosted Checkout; refunds, disputes, and payouts are managed in the seller's full Stripe Dashboard.

Local `npm run stripe:listen` now forwards platform and connected-account events to their separate routes and writes both local signing secrets. Keep local and deployed testing in separate Stripe sandboxes; do not copy CLI signing secrets into Vercel. New application checkout reservations also retain their origin, preventing the localhost worker from delivering purchases reserved on the deployed origin.

`npm run orders:recover` remains sandbox-only and never sends email; it now resolves the account associated with each checkout before retrieving missed payments. The SQL integration probe in `supabase/tests/payment_connections.sql` verifies ownership, account history, and cross-store constraints inside a rolled-back transaction.

References: [Stripe Connect OAuth](https://docs.stripe.com/connect/oauth-reference), [direct charges](https://docs.stripe.com/connect/direct-charges?platform=web&ui=stripe-hosted), [Connect webhooks](https://docs.stripe.com/connect/webhooks).

### Current store launch

1. Apply the migration to the intended Supabase project, create the private bucket, and create/configure the owner Auth user.
2. Deploy to Vercel with Node.js 22+ and complete environment variables. Set `APP_URL` to the public HTTPS origin. Ensure checkout/webhook routes are reachable without deployment authentication. Keep preview and production payment environments separate.
   The public store needs its own Stripe webhook endpoint at `https://your-store-domain/api/stripe-webhook` and that endpoint's signing secret. The Stripe CLI forwarding secret is only for localhost. Stop local forwarding when testing the deployed store against the same Stripe sandbox; otherwise the local process can deliver the email first with a localhost link. Use separate Stripe sandboxes for simultaneous local and deployed testing. Changing a Vercel environment variable requires a new deployment before the running app uses it.
   The app rejects a localhost `APP_URL` on Vercel or with a live Stripe key. Local sandbox development still permits localhost.
3. Verify the complete flow in test mode, including inbox delivery, file contents, resends, and replays.
4. When ready, switch to the live Stripe key and create the live webhook endpoint with both event subscriptions and the pinned API version. Set its live signing secret.
5. Restart/redeploy, then **save each product in the dashboard using the live key** to create its live Product/Price before accepting sales. Verify the public price and complete a controlled live purchase. Old test Price IDs cannot be used with live keys.
6. Confirm sender-domain status, support mailbox, product/resource access, customer-facing policies, and the tax configuration appropriate for the business.

Next.js Cache Components and dependent Partial Prefetching remain disabled so API routes can explicitly select the Node.js runtime. UI patterns are recorded in `ui-registry.md`.
