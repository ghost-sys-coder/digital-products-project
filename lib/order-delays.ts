import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getSupabase } from "./supabase";
import { getStripe } from "./stripe";
import { getEnv } from "./env";
import { HttpError } from "./http";
import { STORE_ID } from "./store-config";
import { getCatalogProduct } from "./catalog";
import { daysBetween, isoDate, originalShipBy, promisedShipBy } from "./order-dates";
import { sendCancellationEmail, sendDelayNotice, sendOwnerCancellationAlert } from "./physical-email";
import type { FulfillmentStatus, Order } from "./database.types";

// Delays and cancellations for physical orders. When an order can't ship on time the owner emails a
// new date with a link to cancel for a full refund (the US Mail Order Rule expects that choice to be
// offered). Cancelling refunds in Stripe, on the account that took the payment.

export const CANCELLABLE: FulfillmentStatus[] = ["needs_ordering", "ordered"];
/** A delay beyond this many days after the original promise needs the customer's agreement. */
export const CONSENT_AFTER_DAYS = 30;

export function hashCancelToken(token: string) {
  return createHash("sha256").update(`order-cancel-v1:${token}`).digest("hex");
}

/** Refunds the whole payment. Safe to repeat: Stripe returns the same refund for the same order. */
export async function refundOrder(order: Order) {
  let options: { stripeAccount?: string } = {};
  if (order.payment_connection_id) {
    const { data, error } = await getSupabase().from("payment_connections").select("external_account_id").eq("id", order.payment_connection_id).maybeSingle();
    if (error || !data) throw new Error("Payment account not found");
    options = { stripeAccount: (data as { external_account_id: string }).external_account_id };
  }
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, {}, options);
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!intent) throw new Error("Payment has no payment intent");
  try {
    const refund = await stripe.refunds.create(
      { payment_intent: intent, reason: "requested_by_customer", metadata: { app: "veilcode-store", order_id: order.id } },
      { ...options, idempotencyKey: `refund-order-${order.id}` },
    );
    return { id: refund.id, amount: refund.amount };
  } catch (error) {
    // Refunded already, for example by hand in the Stripe dashboard: the money is back, so carry on.
    if ((error as { code?: string }).code === "charge_already_refunded") return { id: null, amount: order.amount_total ?? 0 };
    throw error;
  }
}

/**
 * Cancels an order still waiting to ship, optionally refunding it in full first. The refund comes
 * first so a failure leaves the order unchanged and the owner (or customer) can simply try again.
 */
export async function cancelOrder(order: Order, by: "owner" | "customer", refund: boolean) {
  const status = order.fulfillment_status ?? "needs_ordering";
  if (!CANCELLABLE.includes(status)) throw new HttpError(409, "This order has already shipped or been cancelled.");
  let refunded: { id: string | null; amount: number } | null = null;
  if (refund) {
    try { refunded = await refundOrder(order); } catch (error) {
      console.error("Refund failed", { orderId: order.id, code: (error as { code?: string }).code });
      throw new HttpError(502, by === "customer"
        ? "We couldn't process your refund just now, so your order hasn't been cancelled. Please try again in a few minutes, or reply to your email and we'll sort it out."
        : "The refund didn't go through, so the order is unchanged. Try again, or refund it in Stripe and cancel without a refund.");
    }
  }
  const { data, error } = await getSupabase().from("orders").update({
    fulfillment_status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: by, cancel_token_hash: null,
    ...(refunded ? { refund_id: refunded.id, refunded_amount: refunded.amount } : {}),
  }).eq("id", order.id).eq("store_id", STORE_ID).eq("kind", "physical").eq("fulfillment_status", status).select("*").maybeSingle();
  if (error) throw new Error("Could not update order");
  if (!data) {
    // Changed meanwhile: most often a second click that already cancelled it.
    const { data: latest } = await getSupabase().from("orders").select("*").eq("id", order.id).eq("store_id", STORE_ID).maybeSingle();
    if ((latest as Order | null)?.fulfillment_status === "cancelled") return latest as Order;
    if (refunded) console.error("Refunded, but the order changed before it was cancelled", { orderId: order.id });
    throw new HttpError(409, "This order changed in the meantime. Reload to see its latest status.");
  }
  const cancelled = data as Order;
  if (refunded) {
    try { await sendCancellationEmail(cancelled, refunded.amount); } catch { console.warn("Cancellation email not sent", { orderId: order.id }); }
  }
  if (by === "customer") {
    const { data: store } = await getSupabase().from("stores").select("support_email").eq("id", STORE_ID).maybeSingle();
    const ownerEmail = (store as { support_email?: string } | null)?.support_email;
    if (ownerEmail) {
      try { await sendOwnerCancellationAlert(cancelled, ownerEmail, refunded?.amount ?? 0); } catch { console.warn("Owner cancellation alert not sent", { orderId: order.id }); }
    }
  }
  return cancelled;
}

/** Validates a new ship-by date: a real date, after the current promise, within four months. */
export function parseShipBy(value: unknown, order: Order, today = new Date()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new HttpError(400, "Choose the new date you expect it to ship by.");
  }
  const current = promisedShipBy(order);
  if (value <= current || value <= isoDate(today)) throw new HttpError(400, `Choose a date after ${current}, the date the customer was last given.`);
  if (daysBetween(isoDate(today), value) > 120) throw new HttpError(400, "Choose a date within the next four months.");
  return value;
}

/**
 * Emails a delay notice with a new ship-by date and a fresh cancel link, then records it. Only the
 * newest link works. If the email can't be sent nothing is recorded, so the owner can retry.
 */
export async function sendOrderDelay(order: Order, input: { shipBy: string; reason: string }) {
  const status = order.fulfillment_status ?? "needs_ordering";
  if (!CANCELLABLE.includes(status)) throw new HttpError(409, "Only orders that haven't shipped can be delayed.");
  const product = await getCatalogProduct(order.product_id);
  if (!product) throw new HttpError(409, "This order's store no longer exists, so the cancel link can't be made. Email the customer directly.");
  const notices = order.delay_notices ?? [];
  const original = originalShipBy(order);
  const needsConsent = notices.length > 0 || daysBetween(original, input.shipBy) > CONSENT_AFTER_DAYS;

  const token = randomBytes(32).toString("base64url");
  const db = getSupabase();
  const { data: armed, error } = await db.from("orders").update({ cancel_token_hash: hashCancelToken(token) })
    .eq("id", order.id).eq("store_id", STORE_ID).eq("kind", "physical").eq("fulfillment_status", status).select("id").maybeSingle();
  if (error) throw new Error("Could not update order");
  if (!armed) throw new HttpError(409, "This order changed in another tab. Reload to see its latest status.");

  // The secret sits after "#": browsers never send it to a server, so it stays out of logs.
  const cancelUrl = `${new URL(`/s/${product.slug}/cancel`, getEnv().APP_URL).toString()}#${token}`;
  try {
    await sendDelayNotice(order, { shipBy: input.shipBy, previousShipBy: promisedShipBy(order), reason: input.reason, cancelUrl, needsConsent });
  } catch {
    throw new HttpError(502, "The delay notice couldn't be sent, so nothing was recorded. Please try again.");
  }
  const { data, error: saveError } = await db.from("orders").update({ delay_notices: [...notices, { sentAt: new Date().toISOString(), shipBy: input.shipBy, reason: input.reason }] })
    .eq("id", order.id).eq("store_id", STORE_ID).select("*").maybeSingle();
  if (saveError || !data) throw new HttpError(500, "The email was sent, but the notice couldn't be recorded. Reload before sending another.");
  return { order: data as Order, needsConsent };
}

/** Finds the order a customer's cancel link belongs to. */
export async function findOrderByCancelToken(token: unknown) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const { data, error } = await getSupabase().from("orders").select("*")
    .eq("cancel_token_hash", hashCancelToken(token)).eq("store_id", STORE_ID).eq("kind", "physical").maybeSingle();
  if (error) throw new Error("Could not load order");
  return data as Order | null;
}
