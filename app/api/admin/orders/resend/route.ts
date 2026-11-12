import { requireOwner } from "@/lib/auth";
import { sameOrigin, apiError, HttpError, jsonObject } from "@/lib/http";
import { findOrder } from "@/lib/orders";
import { deliverOrder, DeliveryBusyError } from "@/lib/delivery";
import { STORE_ID } from "@/lib/store-config";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    sameOrigin(req); await requireOwner();
    const body = await jsonObject(req);
    if (typeof body.sessionId !== "string" || !/^cs_[A-Za-z0-9_]{1,250}$/.test(body.sessionId) ||
        (body.email && (typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(body.email)))) throw new HttpError(400, "Enter a valid order and email.");
    const order = await findOrder(body.sessionId);
    if (!order || order.store_id !== STORE_ID) throw new HttpError(404, "Order not found.");
    // Physical orders have no download link to resend.
    if (order.kind === "physical") throw new HttpError(409, "This order ships to the customer, so there is no download to resend.");
    await deliverOrder({ order, force: true, email: typeof body.email === "string" ? body.email : undefined });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error instanceof DeliveryBusyError ? new HttpError(409, "Delivery is in progress. Try again shortly.") : error); }
}
