import { requireOwner } from "@/lib/auth";
import { apiError, sameOrigin } from "@/lib/http";
import { approveAuthorization, OAuthError, parseScopes, readAuthorizeRequest, redirectWith } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

const FIELDS = ["client_id", "redirect_uri", "response_type", "state", "code_challenge", "code_challenge_method", "scope"] as const;

/** The owner's answer on /oauth/authorize: back to the app with a code, or with access_denied. */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await requireOwner();
    const form = await req.formData();
    const params: Record<string, string | undefined> = {};
    for (const key of FIELDS) { const value = form.get(key); params[key] = typeof value === "string" ? value : undefined; }
    const request = await readAuthorizeRequest(params);
    const granted = form.getAll("grant").filter((value): value is string => typeof value === "string");
    const location = form.get("decision") === "approve"
      ? await approveAuthorization(request, parseScopes(granted))
      : redirectWith(request.redirectUri, { error: "access_denied", error_description: "The owner declined.", state: request.state });
    return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OAuthError) return Response.json({ error: error.message }, { status: 400 });
    return apiError(error);
  }
}
