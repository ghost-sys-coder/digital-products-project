import { json, preflight, protectedResourceMetadata } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";

/** RFC 9728: tells MCP clients which authorization server protects /api/mcp. */
export function GET() { return json(protectedResourceMetadata(), 200, { "Cache-Control": "public, max-age=300" }); }
export const OPTIONS = preflight;
