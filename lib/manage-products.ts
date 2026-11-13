import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getSupabase } from "./supabase";
import { getStripe } from "./stripe";
import { getEnv } from "./env";
import { getCatalogProduct } from "./catalog";
import { parseProductInput } from "./product-input";
import { HttpError, validHttps } from "./http";
import { STORE_ID } from "./store-config";
import type { CatalogProduct } from "./catalog.types";
import { stripeProductDetails } from "./stripe-product-details";
import { assertDownloadAvailable } from "./product-files";
import { paymentContext } from "./payment-connections";
import { syncConnectedProduct } from "./connected-stripe-products";
import { inspectProductFile, resolveProductUpload, validateUploadSize } from "./product-uploads";
import { knownRelatedIds } from "./related-products";

export async function uploadProductFile(productId: string, file: File, cover: boolean) {
  const { extension, contentType, filename } = await inspectProductFile(file, file.name, cover ? "cover" : "download");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = `${STORE_ID}/${productId}/${cover ? "covers" : "downloads"}/${randomUUID()}.${extension}`;
  const { error } = await getSupabase().storage.from(getEnv().SUPABASE_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new HttpError(503, "The upload failed. Check the private Storage bucket and try again.");
  return { path, contentType, filename };
}

async function syncStripeProduct(product: CatalogProduct, input: ReturnType<typeof parseProductInput>) {
  const stripe = getStripe();
  const id = product.stripe_product_id ?? `veilcode_${product.id}`;
  let stripeProduct;
  try { stripeProduct = await stripe.products.retrieve(id); } catch (error) {
    if ((error as { code?: string }).code !== "resource_missing") throw error;
    stripeProduct = await stripe.products.create({ id, name: input.name, metadata: { app: "veilcode-store", product_id: product.id, store_id: STORE_ID } }, {
      idempotencyKey: `product-${product.id}-${createHash("sha256").update(input.name).digest("hex").slice(0, 16)}`,
    });
  }
  if (stripeProduct.deleted || stripeProduct.metadata.store_id !== STORE_ID || stripeProduct.metadata.product_id !== product.id) throw new HttpError(409, "This Stripe product does not belong to the store.");
  let priceId = product.stripe_livemode === stripeProduct.livemode ? product.stripe_price_id : null;
  let livemode = stripeProduct.livemode;
  if (priceId) {
    const previous = await stripe.prices.retrieve(priceId);
    if (!previous.active || previous.unit_amount !== input.price_amount || previous.currency !== input.currency || previous.livemode !== livemode) priceId = null;
  }
  if (!priceId) {
    const price = await stripe.prices.create({
      product: id, unit_amount: input.price_amount, currency: input.currency,
      metadata: { app: "veilcode-store", product_id: product.id, store_id: STORE_ID },
    }, { idempotencyKey: `price-${product.id}-${input.currency}-${input.price_amount}` });
    priceId = price.id;
    livemode = price.livemode;
  }
  await stripe.products.update(id, { ...await stripeProductDetails(product), default_price: priceId });
  return { stripe_product_id: id, stripe_price_id: priceId, stripe_livemode: livemode };
}

export async function saveProduct(form: FormData) {
  let input: ReturnType<typeof parseProductInput>;
  try { input = parseProductInput(form); } catch (error) { throw new HttpError(400, (error as Error).message); }
  const templates_url = validHttps(input.templates_url, "Resource link");
  let product = await getCatalogProduct(input.id);
  if (!product) {
    if (input.revision !== 0) throw new HttpError(409, "This product no longer exists.");
    const { data, error } = await getSupabase().from("products").insert({ id: input.id, store_id: STORE_ID, slug: input.slug, name: input.name }).select("*").single();
    if (error || !data) throw new HttpError(error?.code === "23505" ? 409 : 500, "Could not create the draft. Check that the URL slug is unique.");
    product = data;
  }
  if (product.revision !== input.revision) throw new HttpError(409, "This product changed in another tab. Reload before saving.");
  const related_ids = input.related_ids && await knownRelatedIds(input.related_ids, product.id);
  let storage_path = product.storage_path;
  let download_filename = product.download_filename;
  let cover_path = product.cover_path;
  let cover_type = product.cover_type;
  const file = form.get("download");
  const cover = form.get("cover");
  // Validate both sizes before making any upload.
  for (const [value, kind] of [[file, "download"], [cover, "cover"]] as const) {
    if (value instanceof File && value.size) validateUploadSize(value.size, kind);
  }
  const downloadUpload = form.get("download_upload");
  const coverUpload = form.get("cover_upload");
  if ((downloadUpload && typeof downloadUpload !== "string") || (coverUpload && typeof coverUpload !== "string")) throw new HttpError(400, "Invalid upload receipt.");
  if ((downloadUpload && file instanceof File && file.size) || (coverUpload && cover instanceof File && cover.size)) throw new HttpError(400, "Submit only one upload per file.");
  if (typeof downloadUpload === "string" && downloadUpload) {
    const uploaded = await resolveProductUpload(downloadUpload, product.id, input.revision, "download");
    storage_path = uploaded.path; download_filename = uploaded.filename;
  }
  if (typeof coverUpload === "string" && coverUpload) {
    const uploaded = await resolveProductUpload(coverUpload, product.id, input.revision, "cover");
    cover_path = uploaded.path; cover_type = uploaded.contentType;
  }
  if (file instanceof File && file.size) {
    const uploaded = await uploadProductFile(product.id, file, false);
    storage_path = uploaded.path; download_filename = uploaded.filename;
  }
  if (cover instanceof File && cover.size) {
    const uploaded = await uploadProductFile(product.id, cover, true);
    cover_path = uploaded.path; cover_type = uploaded.contentType;
  }
  if (input.status === "published" && (!storage_path || !download_filename || !input.description || !input.tagline)) throw new HttpError(400, "To publish, add a description, short description, and downloadable file.");
  if (input.status === "published") await assertDownloadAvailable(storage_path, "The download is missing from Storage. Upload the actual PDF or ZIP before publishing.");
  let payment;
  try {
    const context = await paymentContext();
    const updated = { ...product, name: input.name, description: input.description, tagline: input.tagline, cover_path, price_amount: input.price_amount, currency: input.currency };
    if (context.accountId) { await syncConnectedProduct(updated, context); payment = {}; }
    else payment = await syncStripeProduct(updated, input);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Stripe could not set up this product. Check your payment key and try saving again. Your draft is retained.");
  }
  const { data, error } = await getSupabase().from("products").update({
    name: input.name, slug: input.slug, tagline: input.tagline, description: input.description, includes: input.includes,
    price_amount: input.price_amount, currency: input.currency, status: input.status, sort_order: input.sort_order,
    templates_url, storage_path, download_filename, cover_path, cover_type, ...payment,
    ...(related_ids ? { related_ids } : {}),
    revision: input.revision + 1, updated_at: new Date().toISOString(),
  }).eq("id", product.id).eq("store_id", STORE_ID).eq("revision", input.revision).select("*").maybeSingle();
  if (error) throw new HttpError(error.code === "23505" ? 409 : 500, error.code === "23505" ? "That URL slug is already in use." : "Could not save the product. Please retry.");
  if (!data) throw new HttpError(409, "Another save completed first. Reload the product before saving again.");
  return data;
}
