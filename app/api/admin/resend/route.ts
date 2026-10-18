import { createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { findOrder } from "@/lib/orders";
import { deliverOrder, DeliveryBusyError } from "@/lib/delivery";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  getEnv();
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return Response.json({ error: "Legacy support API is not configured" }, { status: 503 });
  const supplied = req.headers.get("x-admin-secret") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const authorized = timingSafeEqual(digest(supplied), digest(adminSecret));
  const headers = { "Cache-Control": "no-store" };
  if (!supplied || !authorized) return Response.json({ error: "Unauthorized" }, { status: 401, headers });

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid request body" }, { status: 400, headers });
  }
  const { stripe_session_id: sessionId, email } = body as Record<string, unknown>;
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId) || sessionId.length > 255 ||
      (email !== undefined && (typeof email !== "string" || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))) {
    return Response.json({ error: "Provide stripe_session_id and an optional valid email" }, { status: 400, headers });
  }
  try {
    const order = await findOrder(sessionId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404, headers });
    const recipient = await deliverOrder({ order, force: true, email: email as string | undefined });
    return Response.json({ ok: true, email: recipient }, { headers });
  } catch (error) {
    console.error("Admin resend failed", { sessionId });
    return Response.json({ error: error instanceof DeliveryBusyError ? "Delivery in progress. Try again shortly." : "Delivery failed" }, {
      status: error instanceof DeliveryBusyError ? 409 : 500, headers,
    });
  }
}
