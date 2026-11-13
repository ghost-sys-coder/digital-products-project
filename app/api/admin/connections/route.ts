import { requireOwner } from "@/lib/auth";
import { apiError, HttpError, jsonObject, sameOrigin } from "@/lib/http";
import { createPersonalToken, parseScopes, revokeConnection, updateConnectionScopes } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

/** Assistant access from /admin/connections: personal tokens, access levels, switching off. */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await requireOwner();
    const body = await jsonObject(req);
    let result: object;
    switch (body.action) {
      case "create-token": {
        const { connection, token } = await createPersonalToken(typeof body.name === "string" ? body.name : "", parseScopes(body.scopes));
        result = { connection, token };
        break;
      }
      case "scopes": result = { connection: await updateConnectionScopes(body.id, parseScopes(body.scopes)) }; break;
      case "revoke": result = await revokeConnection(body.id); break;
      default: throw new HttpError(400, "Unknown action.");
    }
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
