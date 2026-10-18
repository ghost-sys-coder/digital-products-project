# Delivery page styles

### Payment and download status pages

Files: `app/download-error/page.tsx`, `app/globals.css`
Last updated: 2026-10-18

| Property | Pattern |
| --- | --- |
| Background | `--background: #fff`; light color scheme |
| Primary text | `--foreground: #171717` |
| Body text | `--muted: #565b65`; 17px, line-height 1.75 |
| Heading | 32–44px, weight 650, line-height 1.15 |
| Font | System UI stack |
| Brand and links | `--accent: #2b59ff` |
| Spacing | 24px horizontal padding; 20px paragraph spacing; 48px after studio label |
| Border, radius, shadow | None |
| Hover | Thicker link underline |
| Focus | 2px accent outline, 4px offset |

The download-error page uses `.delivery-page` and `.studio`. Keep its status message static and minimal. The thank-you page has its own presentation below.

### Thank-you page

Files: `app/thank-you/page.tsx`, `app/globals.css`
Last updated: 2026-10-18

| Property | Pattern |
| --- | --- |
| Canvas | Warm white `#fbfbfa`; existing near-black text and muted body copy |
| Typography | System sans with a Georgia italic accent in the main heading; tight tracking |
| Accent | Existing VeilCode blue for the brand, illustration seal, links, and primary action |
| Illustration | Native SVG envelope and letter on a pale blue, flat note; decorative and hidden from assistive technology |
| Border / radius | Light 1px dividers; illustration note 12px corners; existing 8px button |
| Spacing | Open hero spacing; 24px mobile gutters; three next steps with a consistent numbered treatment |
| Motion | Brief opacity/translate entrance; no looping effects; disabled for reduced motion |
| Accessibility | Semantic heading hierarchy, ordered next steps, descriptive links, existing focus outlines |

Keep this page static and independent of payment/provider availability. It explains email delivery without inventing a buyer name, order number, or delivery status. Link lifetime and download count come from the existing token constants. Use the shared Brand component, a working collection link, and the existing support address.

### Storefront, product pages, and studio workspace

Files: `components/store.tsx`, `components/admin-shell.tsx`, `components/product-editor.tsx`, `app/globals.css`
Last updated: 2026-10-18

| Property | Pattern |
| --- | --- |
| Theme | Light, white surfaces, `--surface: #f7f8fc` workspace background |
| Accent | Existing `--accent: #2b59ff`; `--blue-wash: #edf1ff` for supporting surfaces |
| Typography | Existing system sans stack; 44–76px store heading, 33px workspace heading, 12–14px UI text |
| Borders | `--line: #e5e8ef`, 1px; no heavy shadows |
| Shapes | 12px product cards, 10px panels, 8px buttons, 7px inputs |
| Spacing | 24–28px panel padding; explicit mobile collapse at 600px and 850px |
| Interaction | Blue focus outlines, subtle hover changes and pressed-state movement |
| Feedback | Inline form errors, disabled pending buttons, real empty states, loading placeholders |
| Motion | Intensity 2: interaction feedback only; reduced-motion override |

The storefront uses a restrained studio aesthetic (variance 5, density 3). Admin panels prioritize usable forms and order data. Product artwork without an uploaded cover is an intentional fallback marked as a digital toolkit; no fabricated product imagery, reviews, or sales figures. Icons use the existing Lucide dependency. Prices in public pages mirror Stripe prices created by the editor, and checkout revalidates the Stripe price.

### VeilCode Studio branding

Files: `components/store.tsx`, `public/brand/veilcode-mark.svg`, `public/brand/veilcode-logo.svg`, `app/globals.css`
Last updated: 2026-10-18

| Property | Pattern |
| --- | --- |
| Mark | White VC monogram on `#2B59FF`; rounded square with a quarter-width corner radius |
| Wordmark | Near-black `#171717`; live store name uses existing system sans, weight 650, letter spacing -.03em |
| Spacing | 10px gap between the mark and store name |
| Border / shadow | None |
| Interaction | Existing link focus outline; the logo links to the storefront |
| Accessibility | Decorative mark has empty alt text; the visible store name labels the link |

Use the SVG mark with its original proportions. The same source supplies the SVG favicon, the 16/32/48px ICO, and the Apple touch icon. The shared Brand component covers the storefront, workspace, and login page. Source SVGs and reusable PNG exports are in `public/brand`; regenerate exports with `node scripts/generate-brand-assets.mjs`.

### Product upload selection

Files: `components/product-upload-field.tsx`, `components/product-editor.tsx`, `app/globals.css`
Last updated: 2026-10-18

| Property | Pattern |
| --- | --- |
| Surface | `#fafbff`, blue wash on hover; 8px corners, no shadow |
| Border | 1px dashed empty state, solid blue-tinted border when a file is attached |
| Preview | Contain the full image on white, preserving its proportions |
| Text | 12px filename, 10px type and size, 11px status; wrap long filenames |
| Feedback | Blue check icon and explicit ready/saved state; red inline file errors |
| Actions | Choose a different file, Preview PDF, Clear selection; existing text-link styling |
| Accessibility | Named native file inputs, focus outline, live status, associated errors; clearing returns focus to the chooser |

Selection is local until Save product. Clearing a selection restores the saved attachment. PDF previews use local object URLs; ZIPs show file details. Revoke object URLs when replaced, cleared, or unmounted. Disable selection controls while saving. Saved cover previews use an owner-authenticated, non-cacheable request, including draft products.

The editor verifies saved downloads against Storage before showing the ready-for-delivery checkmark. A saved filename alone is insufficient. Missing objects show an associated inline error; verification outages show neutral, uncertain status. Snapshot FormData before disabling upload controls during save. The same availability helper protects publishing, checkout, and delivery.
