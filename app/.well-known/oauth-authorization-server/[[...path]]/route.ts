import { authorizationServerMetadata } from "@/lib/mcp/oauth";
import { json, preflight } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";

/** RFC 8414 authorization server metadata, for MCP clients signing in. */
export function GET() { return json(authorizationServerMetadata(), 200, { "Cache-Control": "public, max-age=300" }); }
export const OPTIONS = preflight;
