import { requireOwner } from "@/lib/auth";
import { apiError, jsonObject, sameOrigin } from "@/lib/http";
import { assertStoreOwner } from "@/lib/payment-connections";
import { prepareProductUpload } from "@/lib/product-uploads";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const owner = await requireOwner();
    await assertStoreOwner(owner.id);
    const upload = await prepareProductUpload(await jsonObject(req));
    return Response.json(upload, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return apiError(error); }
}
