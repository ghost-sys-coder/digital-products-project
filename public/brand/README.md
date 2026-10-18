# VeilCode Studio identity

The white VC monogram pairs an angular V with an open circular C, set in the store's blue (`#2B59FF`). The logo uses near-black (`#171717`) lettering. Keep clear space around the mark and preserve its proportions.

- `veilcode-logo.svg`: editable horizontal logo, transparent background.
- `veilcode-logo.png`: horizontal logo at 4× resolution, transparent background.
- `veilcode-mark.svg`: scalable square mark used in the application.
- `veilcode-mark.png`: 512px transparent-corner mark for reuse.

The horizontal SVG uses Arial/Helvetica with a sans-serif fallback. The app pairs the mark with its live store name in the existing system font, preserving accessibility and store settings.

Next.js automatically serves `app/favicon.ico` (16/32/48px), `app/icon.svg`, and `app/apple-icon.png` (180px). Regenerate these files and the PNG exports with `node scripts/generate-brand-assets.mjs` after editing the source SVGs. No image-generation service or new dependency is required.
