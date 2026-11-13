import { authorizationServerMetadata } from "@/lib/mcp/oauth";
import { json, preflight } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";

/** Some clients look here before RFC 8414; the same OAuth metadata is served (no OpenID sign-in). */
export function GET() { return json(authorizationServerMetadata(), 200, { "Cache-Control": "public, max-age=300" }); }
export const OPTIONS = preflight;
