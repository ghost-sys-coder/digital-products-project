# Environments: production, preview, development

The store has three environments. They never share money, data, customers, or credentials.

| | Production | Preview (staging) | Development (your machine) |
| --- | --- | --- | --- |
| Address | `https://pod.veilcode.studio` | `https://staging.pod.veilcode.studio` (`staging` branch) | `http://localhost:3000` |
| `DEPLOYMENT_ENV` | `production` | `preview` | `development` |
| Stripe | Live keys (test only with `ALLOW_TEST_PAYMENTS_IN_PRODUCTION=true`) | Test keys only | Test keys only |
| Supabase project | `digital-products-project` (`jqyewaruclxjlyouksgq`) | `digital-products-preview` (`wbmrrbfnkfraagkvyics`) | Same as preview |
| Email | Any buyer | Only `EMAIL_ALLOWLIST`, subject `[Preview]` | Only `EMAIL_ALLOWLIST`, subject `[Dev]` |
| Resend key | Production key | Separate preview key | Same as preview |
| Owner login | Production owner user | Preview project's own owner user | Same as preview |
| Search engines | Indexed | `noindex` + yellow banner | `noindex` + yellow banner |
| Local env file | `.env.prod.local` (reference only) | `.env.prev.local` | `.env.local` |

Next.js auto-loads only `.env`, `.env.local`, and `.env.{development,production}[.local]`. The `.env.prod.local` and `.env.prev.local` names are deliberately never loaded by the app. Never create `.env.production.local`.

Both Supabase projects have identical schemas, applied from `supabase/migrations/`. Apply every new migration to preview first, check it, then apply it to production.

## What enforces this

`lib/deployment-rules.ts` runs on every server request (through `getEnv()`) and in the CLI scripts. It refuses to start, naming the variable at fault, when:

- `DEPLOYMENT_ENV` does not match Vercel's actual environment, so a value ticked for both environments fails in one of them. Production never runs off Vercel.
- a live Stripe key is used outside production, or a test key in production without the explicit opt-in.
- `APP_URL` differs from `PRODUCTION_APP_URL` in production, or equals it anywhere else.
- `SUPABASE_URL` differs from `PRODUCTION_SUPABASE_URL` in production, or equals it anywhere else.
- a Supabase key belongs to a different project than `SUPABASE_URL` (for example, a production key copied into preview), is not a server key, or has expired.
- `SUPABASE_PUBLISHABLE_KEY` is actually a secret key, or belongs to another project.
- `EMAIL_ALLOWLIST` is missing outside production. Email to anyone not on it is refused, and the order stays pending.

`npm run stripe:listen` and `npm run orders:recover` apply the same rules and refuse production settings. `npm run env:check -- <file>` checks a file against the rules, then runs read-only checks against its Supabase project.

## Setup runbook

**Step 1 must happen before this code reaches production.** Otherwise production fails closed with a configuration error until the variables exist.

### 1. Production variables (Vercel → Production scope only)

Done on 12 November 2026: the three variables below are set, production uses live Stripe keys (no opt-in flag), and sign-ups are disabled. `npm run env:check` passes for production; its Stripe keys are Vercel "sensitive" values, which are checked at runtime instead.

- `DEPLOYMENT_ENV=production`
- `PRODUCTION_APP_URL=https://pod.veilcode.studio`
- `PRODUCTION_SUPABASE_URL=https://jqyewaruclxjlyouksgq.supabase.co`
- If `STRIPE_SECRET_KEY` is still a test key: `ALLOW_TEST_PAYMENTS_IN_PRODUCTION=true`. Remove it, and switch to live keys, before opening the store.
- Supabase (production project) → Authentication → Sign In / Providers: turn off **Allow new users to sign up**.

### 2. Preview Supabase project

Done on 12 November 2026: the project is created, all migrations are applied (schema verified identical to production), the private `products` bucket exists with 5 MB and PDF/ZIP/PNG/JPEG/WebP limits, sign-ups are disabled, and the preview owner user exists.

### 3. Staging address

Done on 12 November 2026: `staging` branch, `staging.pod.veilcode.studio` (assigned to `staging`, DNS on Vercel), Standard Protection, and a Protection Bypass for Automation secret (kept in `.env.prev.local` as `VERCEL_AUTOMATION_BYPASS_SECRET`).

1. Create a long-lived `staging` git branch.
2. Vercel → Domains: add `staging.pod.veilcode.studio`, assigned to Git branch `staging`, and add its DNS record.
3. Vercel → Deployment Protection: use **Standard Protection**, so preview custom domains require a Vercel login too. The current mode excludes custom domains, which would leave staging public.
4. Create a **Protection Bypass for Automation** secret. Stripe needs it to deliver webhooks to staging.

### 4. Preview credentials (`.env.prev.local`)

Done on 12 November 2026: separate Resend key, preview owner, allowlist, and `ADMIN_SECRET` are set, and `npm run env:check -- .env.prev.local` passes. Recommended: recreate the preview Resend key with **Sending access** only (it currently has full access).

### 5. Vercel preview scope

Done on 12 November 2026: shared variables are Production-only; preview values are scoped to the `staging` branch (secrets marked sensitive); the test-mode Stripe endpoint `we_1UaxNTHiapzsY1Cy3DRTtghV` delivers to staging; an end-to-end test purchase was delivered from the preview project only. Other preview branches receive no data or email credentials.

1. Replace every variable shared by Preview and Production with separate entries, one per scope, using the values checked in step 4. Scope preview values to the `staging` branch where possible.
2. Stripe (test mode): add a webhook endpoint at `https://staging.pod.veilcode.studio/api/stripe-webhook?x-vercel-protection-bypass=<secret>` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Store its signing secret as the Preview `STRIPE_WEBHOOK_SECRET`.
3. Deploy `staging`, make a test purchase to an allowlisted address, and confirm the order appears only in the preview project.

### 6. Local development

Copy `.env.prev.local` to `.env.local`. Set `DEPLOYMENT_ENV=development` and `APP_URL=http://localhost:3000`, and delete the `VERCEL*` lines. Then run `npm run stripe:listen` as before.

### Ongoing

- Before changing any Vercel variable, run `npm run env:check` on the file it came from.
- Never tick both Production and Preview for a secret.
- `vercel env pull` without `--environment` pulls production. Always pass `--environment=preview` for the preview file.
- The Supabase CLI is linked to the **preview** project (`supabase/.temp/project-ref`). Check it before any `supabase db push`.
