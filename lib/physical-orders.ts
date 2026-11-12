import "server-only";
import type Stripe from "stripe";
import { getStripe } from "./stripe";
import { insertPhysicalOrder, markConfirmationSent } from "./orders";
import { sendOrderConfirmation } from "./physical-email";
import { getCatalogProduct } from "./catalog";
import { parseBrand } from "./store-themes";
import { sendTikTokPurchase } from "./tiktok";
import type { Checkout, PhysicalSnapshot, ShippingAddress } from "./catalog.types";
import type { PaymentConnection } from "./payment.types";

type Shipping = NonNullable<PhysicalSnapshot["shipping"]>;

/**
 * The shipping option the buyer chose, as Stripe charged it. A paid order is never dropped: if the
 * rate cannot be read, fall back to matching the charged amount against the reserved options.
 */
async function chosenShipping(session: Stripe.Checkout.Session, snapshot: PhysicalSnapshot, connection: PaymentConnection | null): Promise<Shipping | null> {
  const cost = session.shipping_cost;
  if (!cost) return null;
  const rateRef = cost.shipping_rate;
  try {
    const rate = typeof rateRef === "string"
      ? await getStripe().shippingRates.retrieve(rateRef, {}, connection ? { stripeAccount: connection.external_account_id } : {})
      : rateRef;
    if (rate) {
      const reserved = snapshot.shippingOptions.find((option) => option.rateId === rate.metadata?.rate_id);
      return {
        name: rate.display_name ?? reserved?.name ?? "Shipping",
        amount: cost.amount_total,
        minDays: rate.delivery_estimate?.minimum?.value ?? reserved?.minDays ?? 0,
        maxDays: rate.delivery_estimate?.maximum?.value ?? reserved?.maxDays ?? 0,
      };
    }
  } catch {
    console.warn("Could not read the chosen shipping rate; matching by amount", { sessionId: session.id });
  }
  const match = snapshot.shippingOptions.find((option) => option.amount === cost.amount_total);
  return match ? { name: match.name, amount: cost.amount_total, minDays: match.minDays, maxDays: match.maxDays } : { name: "Shipping", amount: cost.amount_total, minDays: 0, maxDays: 0 };
}

function shippingAddress(session: Stripe.Checkout.Session): ShippingAddress {
  const details = session.collected_information?.shipping_details;
  const address = details?.address;
  return {
    name: details?.name ?? session.customer_details?.name ?? null,
    line1: address?.line1 ?? null, line2: address?.line2 ?? null, city: address?.city ?? null,
    state: address?.state ?? null, postal_code: address?.postal_code ?? null, country: address?.country ?? null,
    phone: session.customer_details?.phone ?? null,
  };
}

/** Records a paid physical checkout as a "needs ordering" order, then emails the confirmation once. */
export async function recordPhysicalOrder(session: Stripe.Checkout.Session, checkout: Checkout, email: string, connection: PaymentConnection | null) {
  const reserved = checkout.physical_snapshot!;
  const shipping = await chosenShipping(session, reserved, connection);
  const address = shippingAddress(session);
  if (!address.line1 || address.country !== "US") {
    // Stripe only allows US addresses here; keep the order so the owner can follow up rather than lose it.
    console.warn("Physical order has an incomplete or unexpected shipping address", { sessionId: session.id });
  }
  const { order, inserted } = await insertPhysicalOrder({
    sessionId: session.id, productId: checkout.product_id, email,
    amountTotal: session.amount_total, currency: session.currency,
    customerName: address.name, shippingAddress: address, snapshot: { ...reserved, shipping },
    storeId: connection?.store_id, connectionId: connection?.id,
  });
  if (order.email_status !== "sent") {
    await sendOrderConfirmation(order);
    await markConfirmationSent(order.id);
  }
  if (inserted && checkout.attribution) {
    // Ads measurement must never hold up an order: log and carry on.
    try {
      const product = await getCatalogProduct(checkout.product_id);
      await sendTikTokPurchase(parseBrand(product?.brand, checkout.store_id, checkout.product_id).tiktokPixelId, checkout, order);
    } catch (error) {
      console.warn("TikTok purchase event not sent", { sessionId: session.id, reason: error instanceof Error ? error.message : "unknown" });
    }
  }
  return order;
}
