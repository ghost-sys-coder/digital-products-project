import { requireOwner } from "@/lib/auth";
import { apiError, HttpError, jsonObject, sameOrigin } from "@/lib/http";
import { createResearch, createStoreFromResearch, deleteResearch, updateResearch } from "@/lib/research";
import { searchMetaAds } from "@/lib/meta-ads";
import { cjDetail, searchCj } from "@/lib/cj";
import { createDigitalFromResearch } from "@/lib/research-digital";

export const runtime = "nodejs";
export const maxDuration = 30;

/** The research board's one endpoint (/admin/research). Every action needs the owner. */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await requireOwner();
    const body = await jsonObject(req, 64_000);
    const query = () => {
      const value = typeof body.query === "string" ? body.query.replace(/\s+/g, " ").trim() : "";
      if (value.length < 2 || value.length > 100) throw new HttpError(400, "Search for 2 to 100 characters.");
      return value;
    };
    let result: unknown;
    switch (body.action) {
      case "create": result = { item: await createResearch(body) }; break;
      case "update": result = { item: await updateResearch(body) }; break;
      case "delete": result = await deleteResearch(body); break;
      case "create-store": result = await createStoreFromResearch(body); break;
      case "create-digital": result = await createDigitalFromResearch(body); break;
      case "meta-search": result = await searchMetaAds(query()); break;
      case "cj-search": result = { products: await searchCj(query()) }; break;
      case "cj-detail": result = { supplier: await cjDetail(typeof body.pid === "string" ? body.pid : "") }; break;
      default: throw new HttpError(400, "Unknown action.");
    }
    return Response.json({ ok: true, ...(result as object) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
