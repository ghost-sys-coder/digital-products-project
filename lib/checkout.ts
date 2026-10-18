import "server-only";
import { getSupabase } from "./supabase";
import { getCatalogProduct, snapshotProduct } from "./catalog";
import { getStripe } from "./stripe";
import { getEnv } from "./env";
import { HttpError } from "./http";
import { STORE_ID } from "./store-config";
import type { Checkout } from "./catalog.types";
import { refreshCheckoutProductDetails } from "./stripe-product-details";
import { assertDownloadAvailable } from "./product-files";
import { paymentContext, stripeOptions } from "./payment-connections";
import { syncConnectedProduct } from "./connected-stripe-products";

export async function findCheckout(id: string, storeId = STORE_ID) {
  const { data, error } = await getSupabase().from("checkouts").select("*").eq("id", id).eq("store_id", storeId).maybeSingle();
  if (error) throw new Error("Could not load checkout");
  return data;
}
export async function bindCheckoutSession(id: string, sessionId: string, storeId = STORE_ID) {
  const { data, error } = await getSupabase().from("checkouts").update({ stripe_session_id: sessionId })
    .eq("id", id).eq("store_id", storeId).is("stripe_session_id", null).select("id").maybeSingle();
  if (error) throw new Error("Could not bind checkout session");
  if (!data && (await findCheckout(id, storeId))?.stripe_session_id !== sessionId) throw new HttpError(409, "A different session already owns this checkout. Reload to start again.");
}
export async function startCheckout(productId: string, checkoutId: string) {
  const stripe = getStripe();
  const context = await paymentContext();
  const options = stripeOptions(context);
  let checkout = await findCheckout(checkoutId);
  if (checkout && checkout.product_id !== productId) throw new HttpError(409, "Start a new checkout for this product.");
  if (checkout && (checkout.payment_connection_id ?? null) !== context.connectionId) throw new HttpError(409, "The store's payment account changed. Reload to start a new checkout.");
  const product = await getCatalogProduct(productId);
  if (!product || product.status !== "published" || !product.price_amount || (!context.accountId && !product.stripe_price_id)) throw new HttpError(404, "This product is not available.");
  await assertDownloadAvailable(checkout?.product_snapshot.storagePath ?? product.storage_path, "This product's download is temporarily unavailable. Please contact the studio before purchasing.");
  if (checkout?.stripe_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(checkout.stripe_session_id, {}, options);
    if (existing.status !== "open" || !existing.url) throw new HttpError(409, "This checkout has ended. Reload the page to start again.");
    return existing.url;
  }
  if (!checkout) {
    const price = context.accountId ? await syncConnectedProduct(product, context) : await stripe.prices.retrieve(product.stripe_price_id!);
    if (!price.active || price.type !== "one_time" || price.unit_amount !== product.price_amount || price.currency !== product.currency ||
        (!context.accountId && (typeof price.product === "string" ? price.product : price.product.id) !== product.stripe_product_id) || price.livemode !== context.livemode) {
      throw new HttpError(503, "Checkout is temporarily unavailable. Please contact the store.");
    }
    const input = {
      id: checkoutId, store_id: STORE_ID, product_id: product.id, stripe_session_id: null,
      stripe_price_id: price.id, amount: price.unit_amount!, currency: price.currency, product_snapshot: snapshotProduct(product),
      product_slug: product.slug,
      payment_connection_id: context.connectionId, checkout_origin: new URL(getEnv().APP_URL).origin,
    };
    const { data, error } = await getSupabase().from("checkouts").insert(input).select("*").single();
    if (error && error.code !== "23505") throw new Error("Could not reserve checkout");
    checkout = data ?? await findCheckout(checkoutId);
    if (!checkout || checkout.product_id !== productId || (checkout.payment_connection_id ?? null) !== context.connectionId) throw new HttpError(409, "Start a new checkout.");
  }
  // Backfill existing products and renew cover links before creating Checkout.
  if (!context.accountId) await refreshCheckoutProductDetails(product);
  // Eight letters derived from the random UUID, stable across Stripe retries.
  const suffix = checkout.id.replace(/-/g, "").slice(0, 8).replace(/[0-9a-f]/gi, (digit) => String.fromCharCode(97 + parseInt(digit, 16)));
  const session = await stripe.checkout.sessions.create({
    mode: "payment", ui_mode: "hosted_page", adaptive_pricing: { enabled: false },
    line_items: [{ price: checkout.stripe_price_id, quantity: 1 }],
    client_reference_id: checkout.id,
    metadata: { app: "veilcode-store", checkout_id: checkout.id, product_id: checkout.product_id, store_id: STORE_ID },
    success_url: new URL("/thank-you", getEnv().APP_URL).toString(),
    cancel_url: new URL(`/p/${checkout.product_slug}?checkout=cancelled`, getEnv().APP_URL).toString(),
    integration_identifier: `veilcode-store-${suffix}`,
  }, { ...options, idempotencyKey: `checkout-${checkout.id}` });
  if (!session.url) throw new Error("Stripe checkout URL missing");
  await bindCheckoutSession(checkout.id, session.id);
  return session.url;
}

export function validCheckoutSession(session: { id: string; client_reference_id: string | null; currency: string | null; amount_subtotal: number | null; mode: string | null; metadata: Record<string, string> | null }, checkout: Checkout) {
  return session.mode === "payment" && session.client_reference_id === checkout.id && session.metadata?.store_id === checkout.store_id &&
    session.metadata?.product_id === checkout.product_id && session.currency === checkout.currency && session.amount_subtotal === checkout.amount &&
    (!checkout.stripe_session_id || checkout.stripe_session_id === session.id);
}
