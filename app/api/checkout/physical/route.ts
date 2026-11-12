import { startPhysicalCheckout, MAX_QUANTITY } from "@/lib/physical-checkout";
import { sameOrigin, apiError, HttpError, jsonObject } from "@/lib/http";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The browser names the product, variant and quantity; every price and shipping amount is loaded server-side.
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await jsonObject(req);
    const { productId, variantId, quantity, checkoutId } = body;
    if (typeof productId !== "string" || productId.length > 100 || typeof variantId !== "string" || !UUID.test(variantId) ||
        typeof checkoutId !== "string" || !UUID_V4.test(checkoutId) ||
        typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new HttpError(400, "Invalid checkout request.");
    }
    const url = await startPhysicalCheckout({ productId, variantId, quantity, checkoutId });
    return Response.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
