import "server-only";
import { OAuthError, protectedResourceMetadata, appOrigin } from "./oauth";

// Shared responses for the MCP and OAuth endpoints. They're called by assistant apps from other
// origins and authenticate with bearer tokens (never cookies), so open CORS is safe here.

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
};

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { ...CORS, "Cache-Control": "no-store", ...headers } });
}

export function oauthError(error: unknown) {
  if (error instanceof OAuthError) return json({ error: error.code, error_description: error.message }, error.status);
  console.error("OAuth request failed");
  return json({ error: "server_error", error_description: "Something went wrong. Try again." }, 500);
}

export function resourceMetadataUrl() { return `${appOrigin()}/.well-known/oauth-protected-resource/api/mcp`; }

/** 401 that tells MCP clients where to start signing in (RFC 9728). */
export function unauthorized(description = "Connect this app to VeilCode Studio to continue.") {
  return json({ error: "invalid_token", error_description: description }, 401, {
    "WWW-Authenticate": `Bearer realm="VeilCode Studio", error="invalid_token", error_description="${description}", resource_metadata="${resourceMetadataUrl()}"`,
  });
}

export { protectedResourceMetadata };

/** Parses an application/x-www-form-urlencoded body (or JSON, which some clients send). */
export async function formBody(req: Request, maxBytes = 16_000) {
  const text = await req.text();
  if (text.length > maxBytes) throw new OAuthError("invalid_request", "Request is too large.");
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      return new URLSearchParams(Object.entries(body).filter(([, value]) => typeof value === "string") as [string, string][]);
    } catch { throw new OAuthError("invalid_request", "Invalid JSON body."); }
  }
  return new URLSearchParams(text);
}
