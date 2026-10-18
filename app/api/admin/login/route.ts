import { cookies } from "next/headers";
import { authClient, getOwnerId, OWNER_COOKIE } from "@/lib/auth";
import { sameOrigin, apiError, HttpError, jsonObject } from "@/lib/http";
import { getSupabase } from "@/lib/supabase";
import { STORE_ID } from "@/lib/store-config";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await jsonObject(req);
    if (typeof body.email !== "string" || typeof body.password !== "string" || body.email.length > 254 || body.password.length > 1024) throw new HttpError(400, "Enter your email and password.");
    const ownerId = getOwnerId();
    const client = authClient();
    const { data, error } = await client.auth.signInWithPassword({ email: body.email.trim(), password: body.password });
    if (error || !data.session || data.user?.id !== ownerId) {
      if (data.session) await client.auth.signOut();
      throw new HttpError(401, "Email or password is incorrect, or this account cannot manage the store.");
    }
    const { error: storeError } = await getSupabase().from("stores").update({ owner_user_id: ownerId }).eq("id", STORE_ID);
    if (storeError) throw new HttpError(503, "The store is not ready. Apply the storefront migration first.");
    (await cookies()).set(OWNER_COOKIE, data.session.access_token, {
      httpOnly: true, secure: new URL(getEnv().APP_URL).protocol === "https:", sameSite: "lax", path: "/",
      maxAge: Math.min(data.session.expires_in, 3600),
    });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
