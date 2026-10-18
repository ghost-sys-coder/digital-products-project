import { startCheckout } from "@/lib/checkout";
import { sameOrigin, apiError, HttpError, jsonObject } from "@/lib/http";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await jsonObject(req);
    if (typeof body.productId !== "string" || body.productId.length > 100 || typeof body.checkoutId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.checkoutId)) throw new HttpError(400, "Invalid checkout request.");
    const url = await startCheckout(body.productId, body.checkoutId);
    return Response.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
