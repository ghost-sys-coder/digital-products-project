import "server-only";
import { HttpError } from "../http";
import { getCatalogProduct } from "../catalog";
import { importStoreMediaBytes, loadStoreEditor, saveStore } from "../manage-stores";
import { THEMES } from "../store-themes";
import { ICONS } from "../store-page";

// Physical product stores for assistants (scope "build"). An assistant reads a store as one editable
// document, changes it, and saves it back through the editor's own saveStore, so every rule the editor
// enforces still applies. Only drafts can be changed; publishing stays with the owner in the admin.

async function draftStore(id: unknown) {
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(id)) throw new HttpError(404, "That store doesn't exist.");
  const product = await getCatalogProduct(id);
  if (!product || product.kind !== "physical") throw new HttpError(404, "That store doesn't exist.");
  return product;
}

/** The store as the document save_store_draft expects back, plus its media and how to use it. */
export async function editableStore(id: string) {
  await draftStore(id);
  const data = await loadStoreEditor(id);
  return {
    document: {
      id: data.product.id, revision: data.product.revision, name: data.product.name, slug: data.product.slug, tagline: data.product.tagline,
      theme: data.product.theme, brand: data.product.brand, page: data.product.page, variants: data.variants,
      profiles: data.profiles.map((profile) => ({ id: profile.id, name: profile.name, rates: profile.rates })), shippingProfileId: data.product.shippingProfileId, policies: data.product.policies,
    },
    status: data.product.status,
    editable: data.product.status === "draft",
    pageProblem: data.pageProblem,
    media: data.media.map((file) => ({ path: file.path, kind: file.kind, url: data.mediaBase + file.path })),
    editorUrl: `/admin/products/${data.product.id}#product`,
    previewUrl: `/s/${data.product.slug}${data.product.status === "draft" ? "?preview=1" : ""}`,
    guide: STORE_GUIDE,
  };
}

/** Saves the whole document as a draft. Refuses live stores. */
export async function saveStoreDraft(document: Record<string, unknown>) {
  const product = await draftStore(document.id);
  if (product.status !== "draft") throw new HttpError(403, "This store is live. Assistants can only change draft stores: edit it in the admin.");
  const result = await saveStore({ ...document, status: "draft" });
  return { revision: result.revision, slug: result.slug, status: result.status, previewUrl: `/s/${result.slug}?preview=1`, editorUrl: `/admin/products/${product.id}#product` };
}

export async function addStoreMedia(productId: string, bytes: Uint8Array) {
  const product = await draftStore(productId);
  if (product.status !== "draft") throw new HttpError(403, "This store is live. Add media to it in the admin.");
  const file = await importStoreMediaBytes(product.id, bytes);
  return { path: file.path, kind: file.kind, url: file.url, use: `Put {"path":"${file.path}","kind":"${file.kind}","alt":"…","poster":null} in a section's media, or the path in a variant's image_path or brand.logoPath, then save the draft.` };
}

export const STORE_GUIDE = `How a store document works (save it back whole with save_store_draft, keeping "revision" as you received it):
- name (≤120), slug (lowercase-hyphenated, ≤80), tagline (≤200), theme: ${THEMES.join(" | ")}.
- brand: { name, logoPath (media path or null), accent ("#rrggbb" or null), supportEmail (needed to publish), tiktokPixelId (leave as is) }.
- page: { version: 1, sections: [{ id, type, enabled, data }] } in display order. Section types and data:
  announcement { text } · hero { headline, subheadline, media: Media[], highlights: string[], badges: string[] }
  showcase { eyebrow, headline, text, media, layout: "split"|"centered", tone, watermark, buttonLabel }
  benefits { title, layout: "grid"|"spotlight", media, items: [{ icon, title, text }] }
  features { items: [{ eyebrow, title, text, media }] } · image_banner { media, headline, text, buttonLabel }
  bento { eyebrow, title, layout: "bento"|"masonry", tiles: [{ size: "small"|"wide"|"tall"|"large", media, icon|null, title, text, tone }] }
  statement { quote, attribution, tone } · video_strip { title, videos: [{ media, caption }] }
  how_it_works { title, steps: [{ title, text }] } · comparison { title, ourLabel, theirLabel, rows: [{ feature, ours, theirs }] }
  size_guide { title, note, columns: string[], rows: string[][] } · specs { title, rows: [{ label, value }] }
  reviews { title } · guarantee { title, text } · faq { title, items: [{ question, answer }] } · final_cta { headline, text }
  Media = { path, kind: "image"|"video", alt, poster: null } using paths from this store's media (add files with import_file). tone: "plain"|"soft"|"accent".
  icon: ${ICONS.join(", ")}.
- variants: [{ id (uuid), options: { "Color": "Black" }, sku, price_amount (cents), compare_at_amount (cents or null), image_path, active, supplier_url, supplier_sku }]. New variants need a new uuid.
- profiles: shipping profiles to save with the store: [{ id (uuid), name, rates: [{ id (uuid), market: "US"|"GB", name, amount (cents), currency: "usd"|"gbp", min_days, max_days, active }] }]. shippingProfileId picks the store's profile.
- policies: { version: 1, sellerName, sellerAddress, processingDays: { min, max }, returnWindowDays, returnShippingPaidBy: "customer"|"store", refundDays, lostParcelDays, responseTime, governingLaw, extra: {}, updatedAt } (or {} until known).
All text is plain text. Unknown fields are dropped. The owner reviews and publishes in the admin.`;
