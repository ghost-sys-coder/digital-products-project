import { requireOwner } from "@/lib/auth";
import { sameOrigin, apiError, HttpError, validHttps, jsonObject } from "@/lib/http";
import { getSupabase } from "@/lib/supabase";
import { STORE_ID } from "@/lib/store-config";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req); await requireOwner();
    const body = await jsonObject(req);
    for (const [field, max] of [["name", 80], ["tagline", 160], ["bio", 1000], ["support_email", 254], ["website_url", 2000]] as const) {
      if (typeof body[field] !== "string" || body[field].length > max) throw new HttpError(400, `Invalid ${field.replace(/_/g, " ")}.`);
    }
    const name = body.name as string, tagline = body.tagline as string, bio = body.bio as string;
    const supportEmail = body.support_email as string, websiteUrl = body.website_url as string;
    if (!name.trim() || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(supportEmail)) throw new HttpError(400, "Add a store name and valid support email.");
    const { error } = await getSupabase().from("stores").update({
      name: name.trim(), tagline: tagline.trim(), bio: bio.trim(),
      support_email: supportEmail, website_url: validHttps(websiteUrl.trim(), "Website"),
    }).eq("id", STORE_ID);
    if (error) throw new Error("Could not save settings");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
