import "server-only";
import { getStripe } from "./stripe";
import { getSupabase } from "./supabase";
import { stripeProductDetails } from "./stripe-product-details";
import { stripeOptions } from "./payment-connections";
import { HttpError } from "./http";
import type { CatalogProduct } from "./catalog.types";
import type { StripePaymentContext } from "./payment.types";

export async function syncConnectedProduct(product: CatalogProduct, context: StripePaymentContext) {
  if (!context.connectionId || !context.accountId || context.storeId !== product.store_id || !product.price_amount) throw new Error("Invalid payment context");
  const stripe = getStripe();
  const options = stripeOptions(context);
  const db = getSupabase();
  const ref = await db.from("product_payment_refs").select("*").eq("store_id", context.storeId)
    .eq("connection_id", context.connectionId).eq("product_id", product.id).maybeSingle();
  if (ref.error) throw new Error("Could not read payment product references");
  const id = ref.data?.external_product_id ?? `veilcode_${product.id}`;
  let remote;
  try { remote = await stripe.products.retrieve(id, {}, options); } catch (error) {
    if ((error as { code?: string }).code !== "resource_missing") throw error;
    remote = await stripe.products.create({ id, name: product.name,
      metadata: { app: "veilcode-store", store_id: context.storeId, product_id: product.id },
    }, { ...options, idempotencyKey: `connected-product-${context.connectionId}-${product.id}` });
  }
  if (remote.deleted || remote.metadata.store_id !== context.storeId || remote.metadata.product_id !== product.id || remote.livemode !== context.livemode) {
    throw new HttpError(409, "The payment product does not belong to this store and Stripe account.");
  }
  let price = ref.data ? await stripe.prices.retrieve(ref.data.external_price_id, {}, options) : null;
  if (!price || !price.active || price.type !== "one_time" || price.unit_amount !== product.price_amount ||
      price.currency !== product.currency || price.livemode !== context.livemode ||
      (typeof price.product === "string" ? price.product : price.product.id) !== id) {
    price = await stripe.prices.create({ product: id, unit_amount: product.price_amount, currency: product.currency,
      metadata: { app: "veilcode-store", store_id: context.storeId, product_id: product.id },
    }, { ...options, idempotencyKey: `connected-price-${context.connectionId}-${product.id}-${product.currency}-${product.price_amount}` });
  }
  await stripe.products.update(id, { ...await stripeProductDetails(product), default_price: price.id }, options);
  const saved = await db.from("product_payment_refs").upsert({
    store_id: context.storeId, connection_id: context.connectionId, product_id: product.id,
    external_product_id: id, external_price_id: price.id, amount: product.price_amount, currency: product.currency,
  }, { onConflict: "connection_id,product_id" });
  if (saved.error) throw new Error("Could not save payment product references");
  return price;
}
