import { cookies } from "next/headers";
import { requireOwner } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { completeStripeConnection, CONNECT_COOKIE } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  const jar = await cookies();
  let status = "failed";
  try {
    const owner = await requireOwner();
    status = await completeStripeConnection(owner.id, new URL(req.url).searchParams, jar.get(CONNECT_COOKIE)?.value);
  } catch { /* Never log OAuth parameters, codes, or provider payloads. */ }
  jar.set(CONNECT_COOKIE, "", { httpOnly: true, secure: getEnv().APP_URL.startsWith("https:"), sameSite: "lax", path: "/api/admin/payments/stripe", maxAge: 0 });
  return new Response(null, { status: 303, headers: {
    Location: new URL(`/admin/settings?payment=${status}`, getEnv().APP_URL).toString(),
    "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  } });
}
