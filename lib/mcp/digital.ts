import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabase } from "../supabase";
import { HttpError } from "../http";
import { STORE_ID, CURRENCIES, formatMoney } from "../store-config";
import { getCatalogProduct } from "../catalog";
import { saveProduct } from "../manage-products";
import type { CatalogProduct } from "../catalog.types";

// Draft digital products for assistants (scope "build"). Every save goes through the admin's own
// saveProduct, so the same validation, file checks and Stripe set-up apply. Assistants can only
// create drafts and edit drafts; publishing stays in the admin.

export type DigitalFields = {
  name?: string; slug?: string; tagline?: string; description?: string; includes?: string[];
  price?: number; currency?: string; templatesUrl?: string | null;
};

function toForm(product: CatalogProduct | null, id: string, fields: DigitalFields, files: { cover?: File; download?: File } = {}) {
  const form = new FormData();
  const price = fields.price ?? product?.price_amount ?? null;
  if (price === null) throw new HttpError(400, "Set a price in cents, e.g. 1900 for $19.00.");
  if (!Number.isInteger(price) || price < 50 || price > 99_999_999) throw new HttpError(400, "The price must be whole cents from 50 ($0.50) upward.");
  const currency = (fields.currency ?? product?.currency ?? "usd").toLowerCase();
  if (!(CURRENCIES as readonly string[]).includes(currency)) throw new HttpError(400, `Use one of: ${CURRENCIES.join(", ")}.`);
  const includes = fields.includes ?? product?.includes ?? [];
  form.set("id", id);
  form.set("revision", String(product?.revision ?? 0));
  form.set("name", fields.name ?? product?.name ?? "");
  form.set("slug", fields.slug ?? product?.slug ?? "");
  form.set("tagline", fields.tagline ?? product?.tagline ?? "");
  form.set("description", fields.description ?? product?.description ?? "");
  form.set("includes", includes.join("\n"));
  form.set("price", (price / 100).toFixed(2));
  form.set("currency", currency);
  form.set("status", "draft");
  form.set("sort_order", String(product?.sort_order ?? 0));
  form.set("templates_url", fields.templatesUrl === undefined ? product?.templates_url ?? "" : fields.templatesUrl ?? "");
  if (files.cover) form.set("cover", files.cover);
  if (files.download) form.set("download", files.download);
  return form;
}

async function loadDraft(id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "That digital product wasn't found.");
  const product = await getCatalogProduct(id);
  if (!product || product.kind !== "digital") throw new HttpError(404, "That digital product wasn't found.");
  if (product.status !== "draft") throw new HttpError(403, "This product is live. Assistants can only change drafts: edit it in the admin.");
  return product;
}

export function describeDigital(product: CatalogProduct) {
  return {
    id: product.id, name: product.name, slug: product.slug, status: product.status, tagline: product.tagline, description: product.description,
    includes: product.includes, price: product.price_amount, priceLabel: product.price_amount !== null ? formatMoney(product.price_amount, product.currency) : null,
    currency: product.currency, templatesUrl: product.templates_url, hasCover: !!product.cover_path, hasDownload: !!product.storage_path,
    editUrl: `/admin/products/${product.id}`, previewUrl: `/p/${product.slug}`,
  };
}

/** A new draft. Optionally links the research idea it came from and moves that idea to Testing. */
export async function createDigitalDraft(fields: DigitalFields, researchId?: string) {
  if (!fields.name?.trim() || !fields.slug?.trim()) throw new HttpError(400, "Give the product a name and a URL slug.");
  const id = randomUUID();
  const saved = await saveProduct(toForm(null, id, fields));
  if (researchId) {
    await getSupabase().from("research_products").update({ store_product_id: saved.id, stage: "testing", updated_at: new Date().toISOString() })
      .eq("store_id", STORE_ID).eq("id", researchId);
  }
  return describeDigital(saved);
}

export async function updateDigitalDraft(id: string, fields: DigitalFields) {
  const product = await loadDraft(id);
  return describeDigital(await saveProduct(toForm(product, product.id, fields)));
}

/** Attaches a cover image or the downloadable PDF/ZIP to a draft. */
export async function attachDigitalFile(id: string, purpose: "cover" | "download", bytes: Uint8Array, filename: string) {
  const product = await loadDraft(id);
  const name = filename.replace(/[^\w.\- ]+/g, "").trim() || (purpose === "cover" ? "cover" : "download");
  const file = new File([bytes as BlobPart], name);
  return describeDigital(await saveProduct(toForm(product, product.id, {}, purpose === "cover" ? { cover: file } : { download: file })));
}
