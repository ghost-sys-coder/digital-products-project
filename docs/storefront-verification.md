# Storefront verification

Date: 18 October 2026.

## Completed checks

- `npm test`: 82 passing tests across six files.
- `npm run lint`: passed.
- `npm run build`: passed with TypeScript checks and the public/admin/API routes generated.
- `git diff --check`: passed; Git reports only local CRLF conversion notices.
- HTTP checks: the production server returned 200 for owner login, payment confirmation, and download-error pages.
- Browser: inspected the real owner login and unconfigured storefront states in Chrome.
- Browser: inspected actual storefront, product, owner editor, and dashboard components rendered with isolated sample data under `.preview`. Mobile checks used a 390px viewport and found no horizontal document overflow. The temporary viewport override was reset.

The preview fixtures use mocked services and synthetic product data. They are ignored by Git and are not production routes or an authentication bypass.

## Upload feedback verification

- The authenticated editor was checked in Chrome using a separate review tab and local test files. No product save or Stripe write was submitted.
- Selecting a cover shows the actual image, filename, size, and ready-to-upload confirmation. Selecting a PDF shows file details and a local Preview PDF link.
- An oversized PDF shows an immediate inline error. Clearing it restores the existing saved download; selecting a valid PDF again restores the ready state.
- Two regression tests cover saved draft cover previews: only the owner can view them, and successful responses use `private, no-store` with `Vary: Cookie`. Anonymous visitors and other authenticated users cannot download a draft cover.

## Functional coverage

Owner access and cookie settings, unauthorized users, cross-origin mutations, Stripe Product/Price creation, immutable price changes, content validation for uploads, draft publishing constraints, stale revisions, cross-store access rejection, server-controlled amounts, repeated/concurrent checkout requests, reservation/session binding, snapshot-based fulfillment, webhook replays, resend failures/retries, download limits/expiry, owner support actions, CSV safety, published-cover visibility, and store settings.

## Stripe checkout presentation verification

- Confirmed the existing published product had a saved cover and description in the app, while its Stripe Product had no description or image.
- Opened a fresh sandbox checkout through the real product page using the configured test key. Visually verified the full description and actual uploaded cover on Stripe's hosted page, with the price unchanged at $39.99. No payment details were entered and no payment was submitted.
- Product details sync on save and before new sessions, preserving the existing Price ID. Cover URLs are signed for 48 hours and do not depend on localhost being reachable by Stripe. Only the marketing cover is signed; no paid download is shared with Stripe.
- Regression checks cover newly uploaded covers on save, existing-product backfill, description fallback and stale artwork removal, retry after a signing failure, and rejection of foreign Stripe Products. Existing session reuse and concurrent-submit tests continue to pass.
- Review screenshot: `.preview/stripe-checkout-details.png` (local ignored artifact). Stripe controls the hosted page layout; the reference Payment Link and the single-product Checkout Session can arrange the summary differently.

References: [Stripe product images and descriptions](https://docs.stripe.com/payments/checkout/customization/product-images), [Supabase signed URLs](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl).

## Thank-you page presentation

- Replaced the plain status text with a branded thank-you, decorative envelope illustration, three delivery/onboarding steps, collection navigation, and support contact.
- Checked the actual page in Chrome at desktop size and a 390px mobile viewport. Content reflows into one column without horizontal overflow; the temporary viewport override was reset.
- Confirmed `npm run lint` and `npm run build` pass, with `/thank-you` still statically rendered. No payment lookups or fulfillment side effects were added. Download lifetime/count use the existing constants; robots metadata remains noindex/nofollow.
- Entry animation has a reduced-motion override. Local review screenshots: `.preview/thank-you-desktop.png` and `.preview/thank-you-mobile.png`.

## Remaining service acceptance

This build did not apply the migration to a remote database or create an Auth account. The configured project was read and one sandbox checkout was opened for presentation verification; the existing test Stripe Product's description and artwork were updated by that normal checkout flow. No payment was submitted by the agent. Complete the README setup and purchase checklist against the intended Supabase and Stripe environments before accepting live sales.

### Missing-order investigation and recovery

- Found two real paid sandbox sessions with matching application checkout reservations and no order records. The account had no registered webhook endpoint, no local listener was running, and the local signing secret was still a placeholder.
- Started local Stripe CLI forwarding and configured its real signing secret. A signed, non-payment probe returned HTTP 200; it created no order and sent no email.
- Recovered both Stripe-verified purchases into `orders` as pending using the new sandbox-only recovery utility. Verified the rows afterward. No emails were sent.
- Confirmed the purchased PDF is absent from Storage, including the current product path and both immutable purchase snapshots. The uploaded marketing cover exists; it is not the product download.
- Verified `claim_delivery` and `consume_download` RPC access with probes matching zero orders. Added regression coverage for missing-object publishing/checkout prevention, Storage verification outages, and pending delivery followed by a successful retry after restoration.
- Restarted the project development server after finding it was serving stale checkout code. Verified the active localhost server now returns 503 for checkout while the PDF is absent and 200 for a correctly signed non-payment webhook probe. The production build also passed the missing-file checkout check. The recovery dry run now reports zero missing paid orders.
- PDF restoration completed in the follow-up below. Remaining acceptance: configure the real template folder URL, explicitly resend the two pending orders, and verify email delivery. A live delivery email has not yet been sent by the agent.

### Attached PDF upload and restoration

- Uploaded the owner-provided `Lead-to-Kickoff.pdf` (130,353 bytes) through the actual authenticated product editor and saved it successfully. The product revision advanced to 2 and now references a unique scoped `/downloads/` object.
- Downloaded that object and verified its SHA-256 matches the supplied PDF exactly. The actual upload flow works; the original misleading attachment status came from a seeded filename/path without an object behind it.
- Restored the identical PDF at the original location referenced by both pending purchase snapshots, without overwriting existing files. A signed attachment download returned HTTP 200, `application/pdf`, the correct filename, and identical bytes. No customer download allowance was consumed.
- The editor now verifies file existence on the server before showing the saved/ready status. Missing objects show an upload instruction; Storage outages show uncertain status. Regression tests cover both cases. FormData is captured before disabling file inputs.
- Confirmed the real editor displays the verified saved-download message. Local screenshot: `.preview/verified-pdf-upload.png`. React review and imprint checks completed; `npm test`, `npm run lint`, and `npm run build` pass.
- The owner chose to provide the real template folder URL; the existing URL is a placeholder. Both recovered orders remain pending and no emails have been sent while that URL is outstanding.

### Template folder configuration

- Replaced the placeholder with the owner-provided Google Drive folder in the current product (revision 3), both pending order snapshots, and the local `L2K_TEMPLATES_URL` fallback. Re-read the database records to verify the saved values. Other snapshot fields, payment information, and delivery tokens were preserved.
- An anonymous request to the folder returned HTTP 200 and the title `Lead to Kickoff: Editable Templates`, without an access-request page. Individual template editing/copy permissions have not been tested.
- Both recovered orders remain pending. Customer delivery emails have not been sent; explicit authorization to send is still outstanding.

The app retains the previously documented cross-service delivery uncertainty: a lost Resend response or failed sent-state write can lead to a new-token email on retry. Gross order metrics exclude refund/dispute synchronization. Larger files, audience campaigns, visitor attribution, and multi-creator onboarding remain later work from the research roadmap.

### Deployed-store localhost delivery correction

- Confirmed the Vercel project `veilcode-digital-store` has `APP_URL=https://pod.veilcode.studio`. The production app and the still-running local forwarder used the same UK Stripe sandbox, with no registered webhook endpoint; Vercel also had the local CLI signing secret. The three recent delivered emails contained localhost download origins.
- Stopped the identified local forwarding processes. Created the sandbox endpoint at `https://pod.veilcode.studio/api/stripe-webhook` for both checkout success events, updated the production signing secret without logging it, and rebuilt the existing production deployment. A signed non-payment probe returned 200 using the new secret and 400 with the old CLI secret; it created no order and sent no email.
- Verified all three existing emailed tokens still match their order records, remain within lifetime/count limits, and reference existing files. Changing only the origin to the public store preserves those links. No download allowance was consumed and no replacement emails were sent.
- Added a configuration guard rejecting localhost URLs on Vercel or with live Stripe keys, with regression coverage. All 84 tests, lint, and production build passed locally. The deployed store still uses Stripe sandbox payments; live payment activation remains separate work.
