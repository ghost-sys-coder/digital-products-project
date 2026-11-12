# Premium single-product stores for physical products

Drafted 12 November 2026. Status: **approved; Phase 1 in progress.**

Owner decisions (12 November 2026):

- Phase 1 scope is approved.
- Stores live at `/s/<store-slug>`; custom domains come in Phase 3.
- Each store has its own brand.
- Four theme presets: Clean Minimal, Bold Dark, Soft Luxe, Vibrant Pop.

## Goal

Sell physical dropshipped products (beauty, fitness, clothing, tech, and attention-grabbing novelty items such as galaxy projectors) from this platform, alongside the existing digital products. One admin, one Stripe account, one order list.

Each physical product gets a **single-product store**: a long, premium, Shopify-style page built from sections. Every store can look different. Traffic will mostly come from TikTok.

- **First market:** United States.
- **Next market:** the United Kingdom. It is designed in from the start and switched on later.
- **Fulfilment at launch:** manual. The owner places each order with the supplier (AliExpress, Alibaba, or similar) and enters the tracking number.

## Before launch: business checks (owner)

These carry more risk than the code. None of them blocks building and testing on staging.

1. **Stripe account eligibility.** The UK Stripe account must match Stripe's requirements for a UK business, typically a UK-registered company with its own address and bank account. Dropshipping attracts extra Stripe review, because of long delivery times and disputes. A mismatch can mean the account is closed and the balance held for months.
2. **Hosting plan.** The Vercel project is on the **Hobby** plan, which Vercel limits to non-commercial personal use. Move to **Pro** before scaling sales.
3. **Database plan.** Supabase **free** projects pause after a week with no activity. A quiet week could take a store offline. Consider Supabase Pro for production once sales start.
4. **UK VAT, before enabling UK shipping.** Goods of £135 or less sent to UK customers from abroad usually require the seller to charge UK VAT from the first sale. Confirm the registration route with an accountant before switching the UK on.
5. **Product rules by category:**
   - **Beauty (US):** cosmetics rules (MoCRA) cover labelling, safety substantiation, and adverse-event reporting.
   - **Tech and novelty electronics** (projectors, gadgets): US **FCC** marking. The UK also expects UKCA/CE marking and electrical safety, and lithium batteries have shipping restrictions.
   - Choose suppliers that can show certificates for these.

## Honesty rules the store enforces

These are legal requirements in the UK, EU, and US (FTC). Payment providers and ad platforms ban stores that break them.

- **Reviews come only from real buyers.** Each review is linked to an order and labelled "Verified buyer". There is no review import from suppliers and no manual review entry. Moderation may remove abuse, spam, or personal data only, never a review because of its rating.
- **"Compare at" prices must be genuine.** The admin labels the field as a price the product was actually sold at, and it is optional.
- **Delivery times are shown honestly**, on the page and at checkout, from the shipping settings.
- **Policy pages are required to publish a physical product**: shipping, refunds and returns, terms, privacy, and contact. Stripe also expects these for physical goods.

## What the buyer sees

A full-page store on its own path at first, `https://pod.veilcode.studio/s/<store-slug>`. Each store gets its own domain in Phase 3.

The **section library** is arranged by the owner in admin, per product. Each section can be switched on or off and reordered:

| Section | Purpose |
| --- | --- |
| Announcement bar | Free shipping, offer, or delivery message |
| Hero / buy box | Gallery (images and short videos), title, rating summary, price and compare-at price, variant picker (colour, size), quantity, Buy button, trust badges, delivery estimate |
| Sticky buy bar | Stays visible while scrolling, as on mobile Shopify themes |
| Showcase banner | Large headline beside (split) or over (centered) a product cut-out on a tinted shape, with an optional watermark word |
| Benefits | Icon and short-text grid, or "spotlight": the product in a circle with benefits on both sides |
| Feature blocks | Alternating image or video with text and a small label above each heading |
| Image banner | Full-width photo or video with overlaid headline and button |
| Bento or masonry grid | Up to 12 photo, icon, or stat tiles: a packed bento grid (small, wide, tall, large) or staggered masonry columns |
| Statement | Large quote or mission line on a soft or accent-tinted band |
| Video / UGC strip | Short vertical clips, TikTok-style |
| How it works | Numbered steps |
| Comparison | "Us vs. others" table |
| Size guide | Clothing; modal from the variant picker |
| Specs / ingredients | Tech specs or beauty ingredients |
| Verified reviews | Real buyer reviews with photos (Phase 2; renders nothing until then) |
| Guarantee and shipping | Returns window, delivery times |
| FAQ | Accordion |
| Final call to action | Repeat buy box |
| Footer | Store brand, policy links, contact |

**Themes:** two or three premium presets to start, for example *Clean Minimal*, *Bold Dark*, and *Soft Luxe*. Each sets fonts, colours, corner style, spacing, and button style. Each store picks a preset and can override its accent colour and logo. Every store looks different without a theme engine to maintain.

**Store branding:** each store has its own brand name and logo, shown in its header, footer, emails, and the buyer's card statement suffix. VeilCode Studio stays the platform behind it.

**Checkout:** Stripe-hosted, which is fast and trusted. It collects the shipping address, limited to enabled markets (US at launch), and offers shipping options with delivery estimates. The buyer can choose a quantity.

## What the owner does in admin

1. **Create a physical product.** Add variants (for example colour × size) with price, compare-at price, SKU, image, and a private supplier link. Set the shipping profile.
2. **Build the store page.** Pick a theme, add and reorder sections, upload images and videos, set the brand name, logo, and accent colour.
3. **Publish.** This is allowed only when the policies, shipping rates, at least one variant, and the required sections are in place.
4. **Fulfil orders.** New paid orders appear as **Needs ordering**, with the shipping address ready to copy and the supplier link. After ordering from the supplier, mark the order **Ordered**. Paste the tracking number when it arrives: the order becomes **Shipped** and the buyer gets a tracking email automatically. Cancel or refund through Stripe as now.

## Phases

Each phase is built and tested on **staging** first, using the preview Supabase project and Stripe test mode, before it reaches production. Digital products keep working unchanged throughout.

### Phase 1: Sellable (US)

The goal is a premium store that can take a real US order and get it to the customer.

- [x] Physical product type, variants, and shipping profiles (markets with rates and delivery estimates).
- [x] Section-based store page with the section library above and all four theme presets.
- [x] A public media bucket for store images and video. Paid digital downloads stay in the private bucket.
- [x] Checkout with variant, quantity, shipping address (US), and shipping options. The checkout reservation keeps a copy of exactly what was bought.
- [x] Webhook fulfilment for physical orders: an order confirmation email instead of a download link, and the order created as **Needs ordering**.
- [x] Fulfilment queue in admin, and tracking emails.
- [x] Policy pages and the publish checks above. Generated from per-store settings plus live shipping rates (`lib/store-policies.ts`); checkout refuses an incomplete store and the database refuses to publish one without policies.
- [x] Videos (with posters and sound toggle) and GIFs across store sections.
- [x] Admin editor for physical products (`components/store-editor`, `lib/manage-stores.ts`): options and variants with private supplier links, brand and theme, the section builder, a media library (direct uploads, content checks, automatic video posters), shared shipping profiles, policy settings, a publish checklist, and a live phone preview. A save writes the product and its variants (or a profile and its rates) in one transaction (`save_physical_store`, `save_shipping_profile`).
- [x] **TikTok pixel and server-side purchase events**, so TikTok ads can optimise for sales (`lib/tiktok.ts`). Per-store pixel ID in the editor; purchases also go through the Events API when `TIKTOK_ACCESS_TOKENS` has the pixel's token, with the same event id as the pixel. US traffic first, so no cookie banner: Global Privacy Control and a “Your privacy choices” opt-out are honoured instead, and the privacy policy describes the sharing.
- [x] **Delay notices and refunds** (`lib/order-delays.ts`): overdue orders are flagged; the owner emails a new ship-by date with a link to cancel for a full refund (the US Mail Order Rule's choice), and cancelling refunds in Stripe.

## Releasing to production

The app and the database must change together. Merging to `master` deploys production straight away, so:

1. Apply every migration that `master` will need to the **production** Supabase project first (they are written to be safe for the code already running).
2. Check production's storefront and admin still load.
3. Then merge to `master`.

Migrations apply to preview with `supabase db push` (the CLI is linked to preview). Production's migration history doesn't match the files (its earliest migrations were applied by hand), so apply production migrations one by one, not with `db push`.

### Phase 2: Trust and growth

- Verified reviews: a review request email after delivery, buyer photo uploads, and owner moderation within the rules above.
- **UK market switch**: GBP pricing, UK shipping rates, VAT with Stripe Tax once registered, and a cookie consent banner for UK visitors (required when pixels are used).
- Meta pixel, discount codes, and an optional "frequently bought together" add-on.

### Phase 3: Scale

- A custom domain per store, routed by hostname to its store.
- Supplier automation, for example the CJdropshipping API: place orders and import tracking automatically.
- Abandoned-checkout emails and basic conversion analytics per store.

## Technical outline

For implementation. Details are settled per phase.

- **Products:** a `kind` field (`digital` | `physical`), a `theme` preset, `brand` (name, logo, accent colour), and `page`: a versioned, schema-validated JSON list of sections. Invalid content is rejected on save, never rendered.
- **`product_variants`:** product, options (for example `{ "color": "Black", "size": "M" }`), SKU, price, compare-at price, image, active flag, private supplier URL and SKU, and Stripe price references per payment connection, following the existing `product_payment_refs` pattern.
- **`shipping_profiles` and `shipping_rates`:** market (country list), name, amount and currency, and minimum/maximum delivery days. These map to Stripe Checkout shipping options.
- **Orders:** add the shipping address, the variant and shipping snapshot, quantity, fulfilment status (`needs_ordering` → `ordered` → `shipped` → `delivered`, or `cancelled`), tracking number, carrier and URL, a private supplier order reference, and timestamps. The digital-only download fields become nullable, with a database check that digital orders still have them.
- **Checkout:** server-side prices only, as now. Allowed countries come from enabled markets. Stripe Tax stays off for the US at launch and switches on per market. The statement descriptor suffix is set per store brand.
- **Emails:** order confirmation, shipped with tracking, review request (Phase 2), and sender display name per store brand. The existing preview allowlist still applies.
- **Reviews (Phase 2):** each review is tied to an order. The request link is signed and single-use, like download tokens. Status is pending, published, or removed, with a recorded reason.
- **Environment rules:** unchanged. Everything goes through `lib/deployment-rules.ts`, and new migrations go to the preview project first.

## Decisions for the owner

1. Approve the Phase 1 scope above.
2. Store address in Phase 1: `/s/<store-slug>` on the existing domain (recommended), with custom domains in Phase 3.
3. Own brand per store (recommended), or every store under the VeilCode Studio name.
4. Theme preset direction: the three suggested (Clean Minimal, Bold Dark, Soft Luxe) or other styles.
