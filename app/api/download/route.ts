import { getEnv } from "@/lib/env";
import { hashToken } from "@/lib/tokens";
import { consumeDownload } from "@/lib/orders";
import { resolveDeliveryProduct } from "@/lib/catalog";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function GET(req: Request) {
  const env = getEnv();
  const invalid = () => new Response(null, {
    status: 302, headers: { ...headers, Location: new URL("/download-error", env.APP_URL).toString() },
  });
  const token = new URL(req.url).searchParams.get("token");
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return invalid();

  try {
    const grant = await consumeDownload(hashToken(token));
    if (!grant) return invalid();
    const product = await resolveDeliveryProduct(grant.product_id, grant.product_snapshot);
    if (!product) throw new Error("Unknown download product");
    const { data, error } = await getSupabase().storage.from(env.SUPABASE_BUCKET)
      .createSignedUrl(product.storagePath, 60, { download: product.downloadFilename });
    if (error || !data?.signedUrl) throw new Error("Could not sign download");
    return new Response(null, { status: 302, headers: { ...headers, Location: data.signedUrl } });
  } catch {
    console.error("Download service failed");
    return Response.json({ error: "Download unavailable. Please try again shortly." }, { status: 503, headers });
  }
}
