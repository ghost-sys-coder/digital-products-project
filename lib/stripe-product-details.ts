import "server-only";
import type { CatalogProduct } from "./catalog.types";
import { getEnv } from "./env";
import { HttpError } from "./http";
import { getStripe } from "./stripe";
import { getSupabase } from "./supabase";
import { STORE_ID } from "./store-config";

// Checkout expires within 24 hours. Refresh the cover link for each new session,
// with an extra day of headroom, including when the app runs on localhost.
export const CHECKOUT_COVER_TTL = 48 * 60 * 60;

export async function stripeProductDetails(product: Pick<CatalogProduct, "name" | "description" | "tagline" | "cover_path">) {
  const images: string[] = [];
  if (product.cover_path) {
    // Sign only the marketing cover; paid downloads never go into Stripe metadata.
    const { data, error } = await getSupabase().storage.from(getEnv().SUPABASE_BUCKET)
      .createSignedUrl(product.cover_path, CHECKOUT_COVER_TTL);
    if (error || !data?.signedUrl) throw new HttpError(503, "The product cover is temporarily unavailable. Please try again.");
    images.push(data.signedUrl);
  }
  return { name: product.name, description: product.description.trim() || product.tagline.trim(), images };
}

export async function refreshCheckoutProductDetails(product: CatalogProduct) {
  if (!product.stripe_product_id) throw new HttpError(503, "Checkout is temporarily unavailable. Please contact the store.");
  const stripe = getStripe();
  const remote = await stripe.products.retrieve(product.stripe_product_id);
  if (remote.deleted || remote.metadata.store_id !== STORE_ID || remote.metadata.product_id !== product.id || remote.livemode !== product.stripe_livemode) {
    throw new HttpError(503, "Checkout is temporarily unavailable. Please contact the store.");
  }
  await stripe.products.update(remote.id, await stripeProductDetails(product));
}
