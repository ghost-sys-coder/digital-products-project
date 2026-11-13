import "server-only";
import { HttpError } from "./http";
import { getSupabase } from "./supabase";
import { STORE_ID } from "./store-config";
import { createDigitalDraft } from "./mcp/digital";
import type { ResearchProduct } from "./research.types";

/** The research board's next step for a digital idea: a draft digital product named after it, linked back. */
export async function createDigitalFromResearch(raw: Record<string, unknown>) {
  if (typeof raw.id !== "string" || !/^[0-9a-f-]{36}$/i.test(raw.id)) throw new HttpError(400, "That product idea wasn't found.");
  const { data } = await getSupabase().from("research_products").select("*").eq("store_id", STORE_ID).eq("id", raw.id).maybeSingle();
  const idea = data as ResearchProduct | null;
  if (!idea) throw new HttpError(404, "That product idea wasn't found. It may have been deleted.");
  if (idea.kind !== "digital") throw new HttpError(400, "Digital drafts are for digital ideas. Create a store instead.");
  if (idea.store_product_id) throw new HttpError(409, "This idea already has a product. Open it from the card.");
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  const product = await createDigitalDraft({ name: idea.title, slug, tagline: "", description: idea.notes.slice(0, 10000), price: idea.target_price ?? 1900 }, idea.id);
  return { productId: product.id };
}
