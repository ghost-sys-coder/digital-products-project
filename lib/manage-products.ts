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

const UPLOAD_LIMIT = 3 * 1024 * 1024; // Fits Vercel's function request-body limit with form overhead.
export async function uploadProductFile(productId: string, file: File, cover: boolean) {
  if (file.size > UPLOAD_LIMIT) throw new HttpError(400, "Each upload must be 3 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let extension: string;
  let contentType: string;
  if (cover && bytes[0] === 0x89 && Buffer.from(bytes.slice(1, 4)).toString() === "PNG") { extension = "png"; contentType = "image/png"; }
  else if (cover && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) { extension = "jpg"; contentType = "image/jpeg"; }
  else if (cover && Buffer.from(bytes.slice(0, 4)).toString() === "RIFF" && Buffer.from(bytes.slice(8, 12)).toString() === "WEBP") { extension = "webp"; contentType = "image/webp"; }
  else if (!cover && Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-") { extension = "pdf"; contentType = "application/pdf"; }
  else if (!cover && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) { extension = "zip"; contentType = "application/zip"; }
  else throw new HttpError(400, cover ? "Upload a PNG, JPEG, or WebP cover." : "Upload a PDF or ZIP download.");
  const path = `${STORE_ID}/${productId}/${cover ? "covers" : "downloads"}/${randomUUID()}.${extension}`;
  const { error } = await getSupabase().storage.from(getEnv().SUPABASE_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new HttpError(503, "The upload failed. Check the private Storage bucket and try again.");
  const stem = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100) || "download";
  return { path, contentType, filename: `${stem}.${extension}` };
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
  let storage_path = product.storage_path;
  let download_filename = product.download_filename;
  let cover_path = product.cover_path;
  let cover_type = product.cover_type;
  const file = form.get("download");
  const cover = form.get("cover");
  // Validate both sizes before making any upload.
  if ([file, cover].some((value) => value instanceof File && value.size > UPLOAD_LIMIT)) throw new HttpError(400, "Each upload must be 3 MB or smaller.");
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
  try { payment = await syncStripeProduct({ ...product, name: input.name, description: input.description, tagline: input.tagline, cover_path }, input); } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Stripe could not set up this product. Check your payment key and try saving again. Your draft is retained.");
  }
  const { data, error } = await getSupabase().from("products").update({
    name: input.name, slug: input.slug, tagline: input.tagline, description: input.description, includes: input.includes,
    price_amount: input.price_amount, currency: input.currency, status: input.status, sort_order: input.sort_order,
    templates_url, storage_path, download_filename, cover_path, cover_type, ...payment,
    revision: input.revision + 1, updated_at: new Date().toISOString(),
  }).eq("id", product.id).eq("store_id", STORE_ID).eq("revision", input.revision).select("*").maybeSingle();
  if (error) throw new HttpError(error.code === "23505" ? 409 : 500, error.code === "23505" ? "That URL slug is already in use." : "Could not save the product. Please retry.");
  if (!data) throw new HttpError(409, "Another save completed first. Reload the product before saving again.");
  return data;
}
