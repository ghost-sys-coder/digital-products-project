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

PDF/ZIP selection now allows 5 MB; covers retain 3 MB. Keep limits and messages sourced from `lib/upload-limits.ts`. Selected files upload through scoped private Storage URLs during Save product, with explicit uploading/saving labels; the final form contains receipts rather than file bodies.

### Product save notifications

Files: `components/ui/sonner.tsx`, `components/product-editor.tsx`, `app/admin/layout.tsx`
Last updated: 2026-10-18

Use the shadcn Sonner component once in the admin layout, at the top right, with four-second success notifications and a close button. Match existing white background, foreground text, `--line` border, and 10px corners. Use a check icon, a brief title (Product created or Product saved), and supporting copy that accurately distinguishes draft from published status. Keep focus in the editor; notifications must not interrupt typing or require confirmation. Let hover/focus pause dismissal for accessibility. Trigger only after a successful API response, before navigating; the shared layout preserves the notification across that navigation.

### Store payment connections

Files: `components/payment-settings.tsx`, `app/admin/settings/page.tsx`, `app/globals.css`
Last updated: 2026-10-18

Use the existing white workspace panel, `--line` border, 10px panel corners, and form-panel spacing. Provider headings use 15px/600 text; the icon has a blue wash with 8px corners. Connection and environment labels use 11px text and 5px corners; connected status uses a muted green surface. Keep primary connect/reconnect, secondary status refresh, and the external Stripe Dashboard link together in a wrapping action row. Disconnect stays below a divider and requires an inline confirmation explaining the checkout pause. Status/error messages use `role=status`/`role=alert`; controls disable during requests. Account IDs wrap, and the same panel reflows without horizontal overflow on mobile. Never show a working connect button until the authorization and webhook settings are ready.

### Workspace profile and sign-out confirmation

Files: `components/admin-account-menu.tsx`, `components/admin-shell.tsx`, `components/ui/{avatar,dropdown-menu,alert-dialog}.tsx`, `app/admin-ui.css`
Last updated: 2026-10-18

| Property | Pattern |
| --- | --- |
| Components | Official shadcn Base UI avatar, dropdown menu, alert dialog, and existing button |
| Surfaces | White popovers; `--line` border; soft shadow for elevated overlays |
| Avatar | Circular blue wash, accent initials, 11px/650 text |
| Typography | 14px/600 profile name, 12px email/actions, 10–11px supporting details; 21px dialog heading |
| Spacing | 6px menu inset, 10px action inset; 26px dialog padding; 10px between actions |
| Shape | 8px menu corners, 12px dialog corners, existing 8px buttons |
| Interaction | Muted action hover; blue focus indicators; pending sign-out disables both actions |
| Accessibility | Named avatar trigger; keyboard menu navigation; trapped dialog focus starts at cancel and returns to its trigger |

Profile details come from the authenticated owner, with an email-name fallback when no display name exists. Only name, email, and initials reach the client; the owner role is fixed by the owner-only dashboard. Keep the profile beside Your storefront on desktop and mobile. Both sign-out entry points use the same confirmation component and existing same-origin POST endpoint. Utilities live in the admin stylesheet without Tailwind Preflight, preserving the existing global design. Respect reduced motion for overlays.
