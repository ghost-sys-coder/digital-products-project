import { revokeToken } from "@/lib/mcp/oauth";
import { formBody, json, oauthError, preflight } from "@/lib/mcp/http";

export const runtime = "nodejs";

/** RFC 7009 token revocation. Always answers 200, whether or not the token was known. */
export async function POST(req: Request) {
  try {
    await revokeToken(await formBody(req));
    return json({});
  } catch (error) { return oauthError(error); }
}
export const OPTIONS = preflight;
