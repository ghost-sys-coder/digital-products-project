import { getCatalogProduct } from "@/lib/catalog";
import { getSupabase } from "@/lib/supabase";
import { getEnv } from "@/lib/env";
import { ownerUser } from "@/lib/auth";

export const runtime = "nodejs";
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const preview = new URL(req.url).searchParams.get("preview") === "1";
    if (preview && !await ownerUser()) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const product = await getCatalogProduct((await ctx.params).id);
    if (!product || (!preview && product.status !== "published") || !product.cover_path || !["image/png", "image/jpeg", "image/webp"].includes(product.cover_type ?? "")) return new Response(null, { status: 404 });
    const { data, error } = await getSupabase().storage.from(getEnv().SUPABASE_BUCKET).download(product.cover_path);
    if (error || !data) return new Response(null, { status: 404 });
    return new Response(data, { headers: { "Content-Type": product.cover_type!, "X-Content-Type-Options": "nosniff", "Cache-Control": preview ? "private, no-store" : "public, max-age=60", ...(preview ? { Vary: "Cookie" } : {}) } });
  } catch { return new Response(null, { status: 503 }); }
}
