import { requireOwner } from "@/lib/auth";
import { apiError, HttpError, jsonObject, sameOrigin } from "@/lib/http";
import { createStore, saveStore } from "@/lib/manage-stores";

export const runtime = "nodejs";
export const maxDuration = 30;

/** A full store save (page, variants, shipping and policies) fits well inside this. */
const MAX_BODY = 512_000;

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await requireOwner();
    const body = await jsonObject(req, MAX_BODY);
    const result = body.action === "create" ? await createStore(body)
      : body.action === "save" ? await saveStore(body)
      : (() => { throw new HttpError(400, "Unknown action."); })();
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
