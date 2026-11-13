import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyBearer } from "@/lib/mcp/oauth";
import { buildMcpServer } from "@/lib/mcp/server";
import { CORS, preflight, unauthorized } from "@/lib/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The studio's MCP endpoint (Streamable HTTP, stateless JSON responses). Claude, ChatGPT, Codex and
 * Claude Code connect here with a bearer token from /oauth/authorize or a personal token from
 * /admin/connections. See lib/mcp/server.ts for the tools.
 */
async function handle(req: Request) {
  const authorization = req.headers.get("authorization");
  const caller = authorization ? await verifyBearer(authorization).catch(() => null) : null;
  if (!caller) return unauthorized(!!authorization);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = buildMcpServer(caller);
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(req);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  } finally {
    // Stateless: each request gets its own server, closed once its JSON response is produced.
    void server.close().catch(() => {});
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = preflight;
