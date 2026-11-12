import "server-only";
import { getSupabase } from "./supabase";
import { getStripe } from "./stripe";
import { getEnv } from "./env";
import { HttpError } from "./http";
import { STORE_ID } from "./store-config";
import { getCatalogProduct } from "./catalog";
import { bindCheckoutSession, findCheckout } from "./checkout";
import { paymentContext, stripeOptions } from "./payment-connections";
import { parseBrand, statementSuffix } from "./store-themes";
import { parseStorePage, storePageReadiness } from "./store-page";
import { parseStorePolicies, storeReadinessProblems } from "./store-policies";
import { publicOptions, storefrontMediaBase, variantLabel } from "./storefront";
import type { AdAttribution, Checkout, PhysicalSnapshot, ProductVariant, ShippingRate } from "./catalog.types";

// Checkout for physical single-product stores. Every amount comes from the database: the browser
// only says which product, variant, and quantity. The reservation freezes what was charged and
// promised (items, shipping options, brand) so fulfilment never depends on later edits.

export const MAX_QUANTITY = 10;
/** Stripe Checkout accepts at most five shipping options. */
const MAX_SHIPPING_OPTIONS = 5;

export type PhysicalCheckoutRequest = {
  productId: string; variantId: string; quantity: number; checkoutId: string;
  /** Ad attribution from the request; null when the shopper opted out (lib/tiktok.ts). */
  attribution?: AdAttribution | null;
};

export { statementSuffix };

async function loadVariant(productId: string, variantId: string) {
  const { data, error } = await getSupabase().from("product_variants").select("*")
    .eq("store_id", STORE_ID).eq("product_id", productId).eq("id", variantId).eq("active", true).maybeSingle();
  if (error) throw new Error("Could not load variant");
  return data as ProductVariant | null;
}

async function loadRates(profileId: string) {
  const { data, error } = await getSupabase().from("shipping_rates").select("*")
    .eq("store_id", STORE_ID).eq("profile_id", profileId).eq("market", "US").eq("active", true).order("position");
  if (error) throw new Error("Could not load shipping rates");
  return ((data ?? []) as ShippingRate[]).filter((rate) => rate.currency === "usd").slice(0, MAX_SHIPPING_OPTIONS);
}

function sameRequest(checkout: Checkout, input: PhysicalCheckoutRequest, connectionId: string | null) {
  return checkout.kind === "physical" && checkout.product_id === input.productId && checkout.variant_id === input.variantId &&
    checkout.quantity === input.quantity && !!checkout.physical_snapshot && (checkout.payment_connection_id ?? null) === connectionId;
}

export async function startPhysicalCheckout(input: PhysicalCheckoutRequest) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_QUANTITY) throw new HttpError(400, `Choose a quantity from 1 to ${MAX_QUANTITY}.`);
  const stripe = getStripe();
  const context = await paymentContext();
  const options = stripeOptions(context);

  let checkout = await findCheckout(input.checkoutId);
  if (checkout && !sameRequest(checkout, input, context.connectionId)) throw new HttpError(409, "Your selection changed. Please press Buy again.");
  if (checkout?.stripe_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(checkout.stripe_session_id, {}, options);
    if (existing.status !== "open" || !existing.url) throw new HttpError(409, "This checkout has ended. Please press Buy again.");
    return existing.url;
  }

  const product = await getCatalogProduct(input.productId);
  if (!product || product.kind !== "physical" || product.status !== "published" || !product.page || !product.shipping_profile_id || product.currency !== "usd") {
    throw new HttpError(404, "This product is not available.");
  }

  if (!checkout) {
    let brand;
    let pageProblems: string[];
    try {
      pageProblems = storePageReadiness(parseStorePage(product.page, product.store_id, product.id));
      brand = parseBrand(product.brand, product.store_id, product.id);
    } catch {
      throw new HttpError(503, "This store is being updated. Please try again shortly.");
    }
    const [variant, rates] = await Promise.all([loadVariant(product.id, input.variantId), loadRates(product.shipping_profile_id)]);
    if (!variant) throw new HttpError(409, "That option is no longer available. Please reload the page.");
    if (!rates.length) throw new HttpError(503, "Shipping is temporarily unavailable for this product.");
    // A store takes payments only once it is complete, policies included.
    const problems = storeReadinessProblems({ pageProblems, activeVariants: 1, usRates: rates.length, supportEmail: brand.supportEmail, policies: product.policies });
    if (problems.length) {
      console.warn("Checkout refused: store is not ready", { productId: product.id, problems });
      throw new HttpError(503, "This store is being updated. Please try again shortly.");
    }

    const { data: siblings, error: siblingError } = await getSupabase().from("product_variants").select("options")
      .eq("store_id", STORE_ID).eq("product_id", product.id).eq("active", true);
    if (siblingError) throw new Error("Could not load variants");
    const order = publicOptions((siblings ?? []) as Pick<ProductVariant, "options">[]).map((option) => option.name);

    const snapshot: PhysicalSnapshot = {
      brand: { name: brand.name || product.name, supportEmail: brand.supportEmail },
      currency: product.currency,
      items: [{
        productId: product.id, variantId: variant.id, name: product.name, variantLabel: variantLabel(variant.options ?? {}, order),
        sku: variant.sku, unitAmount: variant.price_amount, quantity: input.quantity, imagePath: variant.image_path,
        supplierUrl: variant.supplier_url, supplierSku: variant.supplier_sku,
      }],
      shippingOptions: rates.map((rate) => ({ rateId: rate.id, name: rate.name, amount: rate.amount, minDays: rate.min_days, maxDays: rate.max_days })),
      // The ship-by promise for this order; the readiness check above has validated the policies.
      processingDays: parseStorePolicies(product.policies).processingDays,
    };
    const reservation = {
      id: input.checkoutId, store_id: STORE_ID, product_id: product.id, product_slug: product.slug, kind: "physical" as const,
      variant_id: variant.id, quantity: input.quantity, physical_snapshot: snapshot,
      amount: variant.price_amount * input.quantity, currency: product.currency,
      stripe_price_id: null, product_snapshot: null, stripe_session_id: null,
      payment_connection_id: context.connectionId, checkout_origin: new URL(getEnv().APP_URL).origin,
      // Only kept when the store measures ads with a TikTok pixel, and only until the purchase is sent.
      attribution: brand.tiktokPixelId ? input.attribution ?? null : null,
    };
    const { data, error } = await getSupabase().from("checkouts").insert(reservation).select("*").single();
    if (error && error.code !== "23505") throw new Error("Could not reserve checkout");
    checkout = (data as Checkout | null) ?? await findCheckout(input.checkoutId);
    if (!checkout || !sameRequest(checkout, input, context.connectionId)) throw new HttpError(409, "Please press Buy again.");
  }

  const snapshot = checkout.physical_snapshot!;
  const item = snapshot.items[0];
  const image = item.imagePath ? storefrontMediaBase() + item.imagePath : null;
  const suffix = statementSuffix(snapshot.brand.name);
  const appUrl = getEnv().APP_URL;
  // Eight letters derived from the random UUID, stable across Stripe retries.
  const tag = checkout.id.replace(/-/g, "").slice(0, 8).replace(/[0-9a-f]/gi, (digit) => String.fromCharCode(97 + parseInt(digit, 16)));

  const session = await stripe.checkout.sessions.create({
    mode: "payment", ui_mode: "hosted_page", adaptive_pricing: { enabled: false },
    line_items: [{
      quantity: item.quantity,
      price_data: {
        currency: snapshot.currency, unit_amount: item.unitAmount,
        product_data: {
          name: item.name,
          ...(item.variantLabel ? { description: item.variantLabel } : {}),
          ...(image ? { images: [image] } : {}),
          metadata: { product_id: item.productId, variant_id: item.variantId },
        },
      },
    }],
    shipping_address_collection: { allowed_countries: ["US"] },
    shipping_options: snapshot.shippingOptions.map((option) => ({
      shipping_rate_data: {
        type: "fixed_amount", display_name: option.name,
        fixed_amount: { amount: option.amount, currency: snapshot.currency },
        delivery_estimate: { minimum: { unit: "business_day", value: option.minDays }, maximum: { unit: "business_day", value: option.maxDays } },
        metadata: { rate_id: option.rateId },
      },
    })),
    phone_number_collection: { enabled: true },
    custom_text: {
      shipping_address: { message: "We currently ship to addresses in the United States." },
      submit: { message: "You'll get an order confirmation by email, and a tracking link once your order ships." },
    },
    ...(suffix ? { payment_intent_data: { statement_descriptor_suffix: suffix } } : {}),
    client_reference_id: checkout.id,
    metadata: { app: "veilcode-store", kind: "physical", checkout_id: checkout.id, product_id: checkout.product_id, store_id: STORE_ID },
    // The reference lets the thank-you page report this purchase to the store's ad pixel.
    success_url: new URL(`/s/${checkout.product_slug}/thank-you?ref=${checkout.id}`, appUrl).toString(),
    cancel_url: new URL(`/s/${checkout.product_slug}?checkout=cancelled`, appUrl).toString(),
    integration_identifier: `veilcode-store-${tag}`,
  }, { ...options, idempotencyKey: `checkout-${checkout.id}` });
  if (!session.url) throw new Error("Stripe checkout URL missing");
  await bindCheckoutSession(checkout.id, session.id);
  return session.url;
}
