import { requireOwner } from "@/lib/auth";
import { apiError, HttpError, jsonObject, sameOrigin } from "@/lib/http";
import { confirmStoreMedia, deleteStoreMedia, prepareStoreMedia } from "@/lib/manage-stores";

export const runtime = "nodejs";
export const maxDuration = 30;

// Files go straight from the browser to Storage with a one-file signed URL ("prepare"), are then
// checked here ("confirm"), and can be deleted while unused ("delete").
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await requireOwner();
    const body = await jsonObject(req);
    const result = body.action === "prepare" ? await prepareStoreMedia(body)
      : body.action === "confirm" ? await confirmStoreMedia(body)
      : body.action === "delete" ? await deleteStoreMedia(body)
      : (() => { throw new HttpError(400, "Unknown action."); })();
    return Response.json(result, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return apiError(error); }
}
