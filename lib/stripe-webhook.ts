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
import { findAccountConnection, refreshConnection, stripeLivemode } from "./payment-connections";
import { getSupabase } from "./supabase";

export async function handleStripeWebhook(req: Request, connected = false) {
  const env = getEnv();
  const stripe = getStripe();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });
  const secret = connected ? process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim() : env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook not configured" }, { status: 503 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  if ((connected && !event.account) || (!connected && event.account) ||
      (typeof event.livemode === "boolean" && event.livemode !== stripeLivemode())) return Response.json({ received: true });
  let connection = null;
  if (connected) {
    try {
      connection = await findAccountConnection(event.account!, event.livemode);
      if (!connection) return Response.json({ received: true });
      if (event.type === "account.application.deauthorized") {
        // Do not let a delayed revocation undo a more recent authorization/check.
        if (typeof event.created === "number" && event.created < Math.floor(Date.parse(connection.updated_at) / 1000)) return Response.json({ received: true });
        const { error } = await getSupabase().from("payment_connections").update({ status: "disconnected", charges_enabled: false, payouts_enabled: false, updated_at: new Date().toISOString() })
          .eq("id", connection.id).eq("store_id", connection.store_id);
        if (error) throw new Error("Could not record account disconnection");
        return Response.json({ received: true });
      }
      if (event.type === "account.updated") {
        await refreshConnection(connection);
        return Response.json({ received: true });
      }
    } catch { return Response.json({ error: "Payment account update failed" }, { status: 500 }); }
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return Response.json({ received: true });
  }
  const session = event.data.object;
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
      const checkout = await findCheckout(session.metadata.checkout_id, connection?.store_id);
      if (!checkout || !validCheckoutSession(session, checkout) ||
          (checkout.payment_connection_id ?? null) !== (connection?.id ?? null) ||
          (checkout.checkout_origin && checkout.checkout_origin !== new URL(env.APP_URL).origin)) {
        console.warn("Checkout does not match its reserved purchase", { sessionId: session.id });
        return Response.json({ received: true });
      }
      if ((checkout.kind ?? "digital") !== "digital" || !checkout.product_snapshot) {
        // Physical fulfilment is added with physical checkout; never treat it as a download.
        console.warn("Physical checkout is not handled by the digital delivery path", { sessionId: session.id });
        return Response.json({ error: "Physical fulfilment unavailable" }, { status: 500 });
      }
      productId = checkout.product_id;
      productSnapshot = checkout.product_snapshot;
      await bindCheckoutSession(checkout.id, session.id, connection?.store_id);
    } else {
      if (connected) return Response.json({ received: true });
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
      storeId: connection?.store_id, connectionId: connection?.id,
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
