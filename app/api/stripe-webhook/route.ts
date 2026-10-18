import type Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { findProductByPaymentLink } from "@/lib/products";
import { insertOrder } from "@/lib/orders";
import { issueToken } from "@/lib/tokens";
import { deliverOrder } from "@/lib/delivery";
import { findCheckout, validCheckoutSession, bindCheckoutSession } from "@/lib/checkout";
import { snapshotProduct, getCatalogProduct } from "@/lib/catalog";
import type { DeliveryProduct } from "@/lib/catalog.types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const env = getEnv();
  const stripe = getStripe();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return Response.json({ received: true });
  }
  const session = event.data.object;
  if (event.account || (typeof event.livemode === "boolean" && event.livemode !== /_(live)_/.test(env.STRIPE_SECRET_KEY))) return Response.json({ received: true });
  if (session.payment_status !== "paid") return Response.json({ received: true });
  const email = session.customer_details?.email;
  if (!email) {
    console.error("Paid checkout has no customer email", { sessionId: session.id });
    return Response.json({ received: true });
  }
  try {
    let productId: string;
    let productSnapshot: DeliveryProduct | undefined;
    if (session.metadata?.app === "veilcode-store" && session.metadata.checkout_id) {
      const checkout = await findCheckout(session.metadata.checkout_id);
      if (!checkout || !validCheckoutSession(session, checkout)) {
        console.warn("Checkout does not match its reserved purchase", { sessionId: session.id });
        return Response.json({ received: true });
      }
      productId = checkout.product_id;
      productSnapshot = checkout.product_snapshot;
      await bindCheckoutSession(checkout.id, session.id);
    } else {
      // Optional compatibility for outstanding links created before this release.
      const linkId = typeof session.payment_link === "string" ? session.payment_link : session.payment_link?.id ?? null;
      const legacy = linkId ? findProductByPaymentLink(linkId) : undefined;
      if (!legacy) {
        console.warn("Checkout was not created by this store", { sessionId: session.id });
        return Response.json({ received: true });
      }
      productId = legacy[0];
      const catalog = await getCatalogProduct(productId);
      productSnapshot = catalog?.storage_path ? snapshotProduct(catalog) : undefined;
    }
    const token = issueToken();
    const { order, inserted } = await insertOrder({
      sessionId: session.id, productId, productSnapshot, email,
      amountTotal: session.amount_total, currency: session.currency,
      tokenHash: token.hash, expiresAt: token.expiresAt,
    });
    if (order.email_status !== "sent") {
      await deliverOrder({ order, initialToken: inserted ? token : undefined });
    }
    return Response.json({ received: true });
  } catch {
    console.error("Checkout delivery failed; Stripe should retry", { sessionId: session.id });
    return Response.json({ error: "Delivery failed" }, { status: 500 });
  }
}
