# Build Brief: Digital Product Delivery for "Lead to Kickoff"

You are building a small, production-grade delivery system for a digital product sold by VeilCode Studio. When someone pays on Stripe, they must automatically get an email with a secure download link to a PDF plus a link to a Google Drive folder of templates. That is the whole job. Build exactly this, nothing more.

Read this whole brief before writing code. If anything here is ambiguous or conflicts with how a library actually works, stop and ask rather than guessing.

---

## 1. The product

- **Name:** Lead to Kickoff: The Client Onboarding System
- **Seller:** VeilCode Studio (veilcode.studio)
- **Price:** $39 (launch price $29). Prices live in Stripe, never in code.
- **What the buyer gets:**
  1. A PDF guide (`lead-to-kickoff.pdf`, about 130 KB), stored privately
  2. A link to a public Google Drive folder of editable templates (URL supplied as an env var)

The system must be able to support a second product later by adding config, not rewriting code. Do not build anything for a second product now beyond that config shape.

---

## 2. Stack (fixed, do not substitute)

| Concern | Choice |
| Framework | Next.js (App Router), TypeScript, deployed on Vercel |
| Payments | Stripe Checkout via an existing Stripe **Payment Link** (UK account) |
| Database | Supabase Postgres (one table) |
| File storage | Supabase Storage, **private** bucket |
| Email | Resend (domain `mail.veilcode.studio` is already verified) |

Allowed dependencies: `next`, `react`, `react-dom`, `stripe`, `@supabase/supabase-js`, `resend`, plus dev tooling (`typescript`, `vitest`, types). Ask before adding anything else.

All API routes must run on the **Node.js runtime** (`export const runtime = "nodejs"`), not Edge.

---

## 3. The flow

```text
Buyer clicks Stripe Payment Link
  → pays on Stripe Checkout
  → redirected to /thank-you
Stripe sends checkout.session.completed → POST /api/stripe-webhook
  → verify signature
  → confirm paid
  → identify product
  → create order row (idempotent)
  → send delivery email via Resend
  → mark order as sent
Buyer clicks link in email → GET /api/download?token=...
  → validate token (exists, not expired, under download limit)
  → increment download count atomically
  → redirect to a fresh Supabase signed URL valid for 60 seconds
```

---

## 4. Project structure

```text
/app
  /thank-you/page.tsx
  /download-error/page.tsx
  /api/stripe-webhook/route.ts
  /api/download/route.ts
  /api/admin/resend/route.ts
/lib
  products.ts        # product config
  stripe.ts          # Stripe client
  supabase.ts        # server-only Supabase client (service role)
  email.ts           # Resend client + email builder (HTML + text)
  tokens.ts          # token generation + hashing
  orders.ts          # DB access functions
/supabase
  migrations/001_orders.sql
/tests
  webhook.test.ts
  download.test.ts
README.md
.env.example
```

---

## 5. Product config (`lib/products.ts`)

```ts
export const PRODUCTS = {
  "lead-to-kickoff": {
    name: "Lead to Kickoff: The Client Onboarding System",
    stripePaymentLinkId: process.env.STRIPE_PAYMENT_LINK_ID_L2K!, // plink_...
    storagePath: "lead-to-kickoff/lead-to-kickoff.pdf",
    downloadFilename: "Lead-to-Kickoff.pdf",
    templatesUrl: process.env.L2K_TEMPLATES_URL!,
  },
} as const;
```

Identify the product from `session.payment_link` in the webhook by matching it against `stripePaymentLinkId`. If no product matches, log it and return 200 (do not make Stripe retry forever), and do not send an email.

---

## 6. Database (`supabase/migrations/001_orders.sql`)

```sql
create table orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique not null,
  product_id text not null,
  email text not null,
  amount_total integer,          -- in minor units, from Stripe
  currency text,
  download_token_hash text unique not null,
  download_count integer not null default 0,
  max_downloads integer not null default 5,
  token_expires_at timestamptz not null,
  email_status text not null default 'pending',  -- 'pending' | 'sent'
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table orders enable row level security;
-- No policies: only the service role (server-side) can read or write.

-- Atomic download consumption, prevents race conditions on the limit.
create or replace function consume_download(p_token_hash text)
returns table (product_id text)
language sql
as $$
  update orders
     set download_count = download_count + 1
   where download_token_hash = p_token_hash
     and download_count < max_downloads
     and token_expires_at > now()
  returning orders.product_id;
$$;
```

---

## 7. Endpoints

### 7.1 `POST /api/stripe-webhook`

1. Read the **raw body** with `await req.text()`. Verify with `stripe.webhooks.constructEvent(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET)`. On failure, return 400.
2. Handle only `checkout.session.completed` and `checkout.session.async_payment_succeeded`. For any other event type, return 200 and do nothing.
3. Continue only if `session.payment_status === "paid"`. Otherwise return 200. The async event will arrive later if payment completes.
4. Get the email from `session.customer_details.email`. If it's missing, log an error and return 200.
5. Identify the product (section 5).
6. **Idempotency (critical):**
   - Generate a token (section 8), hash it, and **insert** the order with `email_status = 'pending'`.
   - If the insert fails on the unique `stripe_session_id`, load the existing row:
     - `email_status = 'sent'` → return 200 and do nothing. This is the duplicate/replay case.
     - `email_status = 'pending'` → a previous attempt failed to send. Generate a **new** token, update the row's `download_token_hash` and `token_expires_at`, then continue to send. The old token was never delivered, so it is safe to replace.
7. Send the delivery email (section 9).
8. If sending succeeds, set `email_status = 'sent'` and `email_sent_at = now()`, then return 200.
9. If sending fails, leave the status as `pending` and **return 500** so Stripe retries the event.

### 7.2 `GET /api/download?token=...`

1. Hash the token and call `consume_download(hash)` via Supabase RPC.
2. If no row is returned (bad token, expired, or limit reached), redirect to `/download-error`.
3. Otherwise create a signed URL with `storage.from(BUCKET).createSignedUrl(path, 60, { download: downloadFilename })` and return a **302 redirect** to it.
4. Add `Cache-Control: no-store` and `Referrer-Policy: no-referrer` to the response.

### 7.3 `POST /api/admin/resend`

For "I never got my email" support cases.

- Require header `x-admin-secret` matching `ADMIN_SECRET`, compared in constant time (`crypto.timingSafeEqual`). Wrong or missing → 401.
- Body: `{ "stripe_session_id": "cs_..." }`, with an optional `"email"` override if the buyer mistyped their address.
- Generate a new token, reset `download_count` to 0, set a fresh 14-day expiry, update the email if an override is given, send the email, and mark it `sent`.
- Return `{ ok: true, email }`.

### 7.4 Pages

- `/thank-you`: "Payment received. Your download link is on its way to your inbox, usually within a minute. Check spam if you don't see it. Questions: <support@veilcode.studio>." Static, no session lookup needed.
- `/download-error`: "This link has expired or reached its download limit. Email <support@veilcode.studio> with your purchase email and we'll send a fresh one."

Keep both pages clean, light-themed and minimal. White background, near-black text, blue accent `#2B59FF`, and the system font stack is fine.

---

## 8. Tokens (`lib/tokens.ts`)

- Generate with `crypto.randomBytes(32).toString("base64url")`.
- Store **only** `sha256(token)` as hex in the database. The raw token appears only in the email link.
- Expiry: 14 days from issue. Download limit: 5.
- Never log raw tokens, signed URLs, or full request bodies.

---

## 9. Delivery email (`lib/email.ts`)

- **From:** `VeilCode Studio <orders@mail.veilcode.studio>`
- **Reply-To:** `support@veilcode.studio`
- **Subject:** `Your Lead to Kickoff kit is ready`
- Send both `html` and `text` versions.
- Pass Resend's idempotency key set to `delivery-${stripe_session_id}-${token_hash_prefix}`, so a retried send for the same token can't duplicate. A resend with a new token still goes through.

Body content (HTML version simple and table-free, mirrored in plain text):

> Thanks for buying **Lead to Kickoff**.
>
> **1. Download the guide (PDF)**
> [Download Lead to Kickoff] → `${APP_URL}/api/download?token=${token}`
> This link works for 14 days and up to 5 downloads. Save the PDF somewhere safe.
>
> **2. Get the editable templates**
> [Open the template folder] → `${templatesUrl}`
> Open any template and choose **File > Make a copy** to save it to your own Google Drive.
>
> Start with the "00 Start Here" file.
>
> Questions or problems? Just reply to this email.
>
> Frank
> VeilCode Studio

---

## 10. Environment variables (`.env.example`)

```text
APP_URL=https://<deployment-domain>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PAYMENT_LINK_ID_L2K=plink_...
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=products
RESEND_API_KEY=re_...
L2K_TEMPLATES_URL=https://drive.google.com/drive/folders/...
ADMIN_SECRET=<long random string>
```

- Validate every required env var at startup or first use, and fail loudly naming the missing one.
- The Supabase service role key must only be imported in server code. Never expose it with a `NEXT_PUBLIC_` prefix.
- Pin the Stripe API version explicitly in the Stripe client.

---

## 11. Tests

Use Vitest with mocked Stripe, Supabase and Resend clients. Cover these cases:

- Invalid signature → 400
- Unpaid session → 200, no email sent
- Paid session → order inserted, email sent, status `sent`
- Same event delivered twice → only **one** email sent
- Email send fails → 500, status stays `pending`; next delivery retries with a new token and succeeds
- Unknown payment link → 200, no email
- Download: valid token → 302 to signed URL; 6th download → redirect to `/download-error`; expired token → `/download-error`; garbage token → `/download-error`
- Admin resend: wrong secret → 401; valid → new token, count reset, email sent

---

## 12. README must include

1. Supabase setup: run the migration, create the **private** bucket `products`, upload the PDF to `lead-to-kickoff/lead-to-kickoff.pdf`.
2. Stripe setup: create the product and Payment Link in **test mode**, set its success URL to `${APP_URL}/thank-you`, copy the `plink_` id, and add a webhook endpoint for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
3. Local testing with the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe-webhook`, then make a real test purchase through the Payment Link (`stripe trigger` won't carry a payment link id).
4. Replaying an event to prove idempotency: `stripe events resend evt_...`.
5. How to use the admin resend route, with a curl example.
6. The go-live checklist: switch to live keys, create the live webhook endpoint and secret, update `STRIPE_PAYMENT_LINK_ID_L2K` to the live link.

---

## 13. Out of scope. Do not build

- User accounts, login, or a customer dashboard
- A storefront, product pages, or cart
- Affiliate tracking
- Analytics, admin UI, or order listing pages
- Refund automation (refunds are handled manually in Stripe)
- Any second product beyond the config shape in section 5

---

## 14. Done when

1. A test-mode purchase through the Payment Link delivers the email within about a minute, from `orders@mail.veilcode.studio`, landing in the inbox (not spam) on Gmail.
2. The download link downloads the PDF with the correct filename.
3. The 6th download attempt shows the error page.
4. Replaying the same Stripe event sends **no** second email.
5. Killing the Resend API key mid-test makes the webhook return 500, and restoring it lets the Stripe retry deliver the email.
6. The admin resend route sends a fresh, working link.
7. All tests pass, and `next build` succeeds with no type errors.

When finished, report: what you built, any deviation from this brief and why, and the exact manual steps left for the owner.
