import { registerClient, OAuthError } from "@/lib/mcp/oauth";
import { json, oauthError, preflight } from "@/lib/mcp/http";

export const runtime = "nodejs";

/** RFC 7591 dynamic client registration: how claude.ai and ChatGPT introduce themselves. */
export async function POST(req: Request) {
  try {
    const text = await req.text();
    if (text.length > 16_000) throw new OAuthError("invalid_client_metadata", "Request is too large.");
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new OAuthError("invalid_client_metadata", "Send client metadata as JSON."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new OAuthError("invalid_client_metadata", "Send client metadata as a JSON object.");
    return json(await registerClient(body as Record<string, unknown>), 201);
  } catch (error) { return oauthError(error); }
}
export const OPTIONS = preflight;
