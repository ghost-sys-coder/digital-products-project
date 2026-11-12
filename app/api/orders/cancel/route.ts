import { apiError, HttpError, jsonObject, sameOrigin } from "@/lib/http";
import { CANCELLABLE, cancelOrder, findOrderByCancelToken } from "@/lib/order-delays";
import { promisedShipBy } from "@/lib/order-dates";

export const runtime = "nodejs";
export const maxDuration = 30;

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

// The customer's side of a delay notice: "preview" shows the order the link belongs to, "cancel"
// cancels it with a full refund. The link's secret is the only credential, and it stops working
// once the order ships or is cancelled.
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await jsonObject(req);
    const order = await findOrderByCancelToken(body.token);
    if (!order) throw new HttpError(404, "This link has expired. It stops working once an order ships or is cancelled, or when a newer email replaces it.");
    const snapshot = order.physical_snapshot!;
    const status = order.fulfillment_status ?? "needs_ordering";
    const summary = {
      reference: order.stripe_session_id.slice(-8).toUpperCase(),
      brand: snapshot.brand.name, supportEmail: snapshot.brand.supportEmail,
      items: snapshot.items.map((item) => ({ name: item.name, variant: item.variantLabel, quantity: item.quantity })),
      total: order.amount_total, currency: order.currency ?? snapshot.currency,
      shipBy: promisedShipBy(order), cancellable: CANCELLABLE.includes(status), status,
    };
    if (body.action === "preview") return Response.json(summary, { headers });
    if (body.action !== "cancel") throw new HttpError(400, "Unknown action.");
    if (!summary.cancellable) throw new HttpError(409, "Your order has already shipped, so it can't be cancelled here. Reply to your email and we'll help with a return.");
    const cancelled = await cancelOrder(order, "customer", true);
    return Response.json({ ...summary, cancellable: false, status: "cancelled", refunded: cancelled.refunded_amount ?? order.amount_total }, { headers });
  } catch (error) { return apiError(error); }
}
