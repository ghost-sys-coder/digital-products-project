import "server-only";
import { getSupabase } from "./supabase";
import { HttpError } from "./http";
import { STORE_ID } from "./store-config";
import { sendTrackingEmail, trackingLink } from "./physical-email";
import { cancelOrder, parseShipBy, sendOrderDelay } from "./order-delays";
export { trackingLink };
import type { FulfillmentStatus, Order } from "./database.types";

// Manual fulfilment for physical orders: order from the supplier, add tracking, mark delivered.
// Every change is a conditional update from the status the owner saw, so two tabs cannot
// silently overwrite each other, and the server alone decides which moves are allowed.

export const FULFILLMENT_STATUSES: FulfillmentStatus[] = ["needs_ordering", "ordered", "shipped", "delivered", "cancelled"];

export type FulfillmentAction =
  | { action: "ordered"; supplierRef: string }
  | { action: "shipped"; carrier: string; trackingNumber: string; trackingUrl: string; notify: boolean }
  | { action: "delivered" }
  | { action: "cancelled"; refund: boolean }
  | { action: "delay_notice"; shipBy: unknown; reason: string }
  | { action: "resend_tracking" };

/** Which statuses each action may start from. Updating tracking on a shipped order is allowed. */
const ALLOWED_FROM: Record<FulfillmentAction["action"], FulfillmentStatus[]> = {
  ordered: ["needs_ordering", "ordered"],
  shipped: ["needs_ordering", "ordered", "shipped"],
  delivered: ["shipped"],
  cancelled: ["needs_ordering", "ordered"],
  delay_notice: ["needs_ordering", "ordered"],
  resend_tracking: ["shipped", "delivered"],
};

const PLAIN = /^[^\u0000-\u001f\u007f<>]*$/;
function plain(value: unknown, label: string, max: number, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new HttpError(400, `${label} must be text.`);
  const clean = value.trim();
  if (clean.length > max || !PLAIN.test(clean)) throw new HttpError(400, `${label} must be ${max} characters or fewer, without < or >.`);
  if (required && !clean) throw new HttpError(400, `Add the ${label.toLowerCase()}.`);
  return clean;
}

/** Parses an owner's request into one allowed action, rejecting anything else. */
export function parseFulfillmentAction(body: Record<string, unknown>): FulfillmentAction {
  switch (body.action) {
    case "ordered": return { action: "ordered", supplierRef: plain(body.supplierRef, "Supplier order number", 200) };
    case "shipped": {
      const trackingNumber = plain(body.trackingNumber, "Tracking number", 100, true).replace(/\s+/g, "");
      if (!/^[A-Za-z0-9-]{4,100}$/.test(trackingNumber)) throw new HttpError(400, "Tracking numbers use letters, numbers and dashes only.");
      const trackingUrl = plain(body.trackingUrl, "Tracking link", 2000);
      if (trackingUrl) {
        let url: URL;
        try { url = new URL(trackingUrl); } catch { throw new HttpError(400, "The tracking link must be a full https:// address."); }
        if (url.protocol !== "https:" || url.username || url.password) throw new HttpError(400, "The tracking link must be a full https:// address.");
      }
      return { action: "shipped", carrier: plain(body.carrier, "Carrier", 60), trackingNumber, trackingUrl, notify: body.notify !== false };
    }
    case "cancelled": return { action: "cancelled", refund: body.refund === true };
    case "delay_notice": return { action: "delay_notice", shipBy: body.shipBy, reason: plain(body.reason, "Reason", 300) };
    case "delivered": case "resend_tracking": return { action: body.action };
    default: throw new HttpError(400, "Unknown fulfilment action.");
  }
}

export async function listPhysicalOrders(status: FulfillmentStatus) {
  const { data, error } = await getSupabase().from("orders").select("*")
    .eq("store_id", STORE_ID).eq("kind", "physical").eq("fulfillment_status", status)
    // Oldest first while work is outstanding, so nothing waits at the bottom of the list.
    .order("created_at", { ascending: status === "needs_ordering" || status === "ordered" }).limit(200);
  if (error) throw new Error("Could not load orders");
  return (data ?? []) as Order[];
}

export async function fulfillmentCounts() {
  const { data, error } = await getSupabase().from("orders").select("fulfillment_status")
    .eq("store_id", STORE_ID).eq("kind", "physical").limit(10000);
  if (error) throw new Error("Could not load order counts");
  const counts = Object.fromEntries(FULFILLMENT_STATUSES.map((status) => [status, 0])) as Record<FulfillmentStatus, number>;
  for (const row of (data ?? []) as Pick<Order, "fulfillment_status">[]) if (row.fulfillment_status) counts[row.fulfillment_status]++;
  return counts;
}

async function loadOrder(orderId: string) {
  const { data, error } = await getSupabase().from("orders").select("*").eq("id", orderId).eq("store_id", STORE_ID).eq("kind", "physical").maybeSingle();
  if (error) throw new Error("Could not load order");
  if (!data) throw new HttpError(404, "Order not found.");
  return data as Order;
}

/**
 * Applies one action to an order the owner last saw in `expected` status. The row only changes if
 * it is still in that status. Tracking emails go out after the change is saved; if sending fails
 * the order stays updated and the owner can resend.
 */
export async function applyFulfillment(orderId: string, expected: FulfillmentStatus, input: FulfillmentAction) {
  const order = await loadOrder(orderId);
  const current = order.fulfillment_status ?? "needs_ordering";
  if (current !== expected) throw new HttpError(409, "This order changed in another tab. Reload to see its latest status.");
  if (!ALLOWED_FROM[input.action].includes(current)) {
    throw new HttpError(409, input.action === "cancelled" ? "Shipped orders can't be cancelled here. Arrange a return, then refund in Stripe." : "That step doesn't apply to this order's current status.");
  }

  // Cancelling (with its refund) and delay notices have their own steps and emails.
  if (input.action === "cancelled") return cancelOrder(order, "owner", input.refund);
  if (input.action === "delay_notice") return (await sendOrderDelay(order, { shipBy: parseShipBy(input.shipBy, order), reason: input.reason })).order;

  const now = new Date().toISOString();
  let changes: Partial<Order> = {};
  let emailTracking = false;
  switch (input.action) {
    case "ordered":
      changes = { fulfillment_status: "ordered", supplier_order_ref: input.supplierRef || null, ordered_at: order.ordered_at ?? now };
      break;
    case "shipped": {
      const trackingChanged = input.trackingNumber !== order.tracking_number;
      changes = {
        fulfillment_status: "shipped", tracking_number: input.trackingNumber, tracking_carrier: input.carrier || null,
        tracking_url: input.trackingUrl || null, shipped_at: order.shipped_at ?? now, ordered_at: order.ordered_at ?? now,
        // A new tracking number deserves a new email; an unchanged one is only re-sent on request.
        ...(trackingChanged ? { tracking_email_sent_at: null } : {}),
      };
      emailTracking = input.notify && (trackingChanged || !order.tracking_email_sent_at);
      break;
    }
    case "delivered": changes = { fulfillment_status: "delivered", delivered_at: now }; break;
    case "resend_tracking":
      if (!order.tracking_number) throw new HttpError(409, "Add tracking before sending a tracking email.");
      emailTracking = true;
      break;
  }

  let updated = order;
  if (Object.keys(changes).length) {
    const { data, error } = await getSupabase().from("orders").update(changes)
      .eq("id", order.id).eq("store_id", STORE_ID).eq("kind", "physical").eq("fulfillment_status", current).select("*").maybeSingle();
    if (error) throw new Error("Could not update order");
    if (!data) throw new HttpError(409, "This order changed in another tab. Reload to see its latest status.");
    updated = data as Order;
  }

  if (emailTracking) {
    try {
      await sendTrackingEmail(updated, { resend: input.action === "resend_tracking" });
    } catch {
      throw new HttpError(502, input.action === "resend_tracking"
        ? "The tracking email could not be sent. Please try again."
        : "Saved, but the tracking email could not be sent. Use “Resend tracking email” to try again.");
    }
    const { data, error } = await getSupabase().from("orders").update({ tracking_email_sent_at: new Date().toISOString() })
      .eq("id", updated.id).eq("store_id", STORE_ID).select("*").maybeSingle();
    if (!error && data) updated = data as Order;
  }
  return updated;
}
