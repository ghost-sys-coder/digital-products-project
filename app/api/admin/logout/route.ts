import { cookies } from "next/headers";
import { OWNER_COOKIE } from "@/lib/auth";
import { sameOrigin, apiError } from "@/lib/http";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    (await cookies()).delete(OWNER_COOKIE);
    return Response.redirect(new URL("/admin/login", getEnv().APP_URL), 303);
  } catch (error) { return apiError(error); }
}
