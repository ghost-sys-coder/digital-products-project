import { exchangeToken } from "@/lib/mcp/oauth";
import { formBody, json, oauthError, preflight } from "@/lib/mcp/http";

export const runtime = "nodejs";

/** Exchanges an authorization code (with PKCE) or a refresh token for an access token. */
export async function POST(req: Request) {
  try {
    return json(await exchangeToken(await formBody(req), req.headers.get("authorization")), 200, { Pragma: "no-cache" });
  } catch (error) { return oauthError(error); }
}
export const OPTIONS = preflight;
