import { readHomePhoto } from "@/lib/home-photos";

export const runtime = "nodejs";

// Serves a homepage photo at an address that changes whenever the file does (see lib/home-photos.ts),
// so it can be cached for good.
export async function GET(_req: Request, ctx: { params: Promise<{ name: string; version: string }> }) {
  const { name, version } = await ctx.params;
  const photo = readHomePhoto(name, version);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(photo.body, {
    headers: { "Content-Type": photo.type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
