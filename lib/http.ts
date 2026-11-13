import "server-only";
import { getEnv, ConfigurationError } from "./env";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== new URL(getEnv().APP_URL).origin) {
    throw new HttpError(403, "Please submit this form from the store.");
  }
}
/**
 * For plain HTML form posts (a navigation, not fetch). Under the site's no-referrer policy a browser
 * sends `Origin: null` for these, so the browser's own Sec-Fetch-Site header, which pages can't set,
 * vouches for the request instead. The owner cookie is SameSite=Lax, so it never rides a cross-site POST.
 */
export function sameOriginForm(req: Request) {
  const origin = req.headers.get("origin");
  if (origin === new URL(getEnv().APP_URL).origin) return;
  if ((origin === null || origin === "null") && req.headers.get("sec-fetch-site") === "same-origin") return;
  throw new HttpError(403, "Please submit this form from the store.");
}
export function apiError(error: unknown) {
  if (!(error instanceof HttpError)) console.error(error instanceof ConfigurationError ? error.message : "Store request failed");
  return Response.json({ error: error instanceof HttpError ? error.message : "Something went wrong. Please try again." }, {
    status: error instanceof HttpError ? error.status : 500,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function jsonObject(req: Request, maxBytes = 16000): Promise<Record<string, unknown>> {
  if (Number(req.headers.get("content-length")) > maxBytes) throw new HttpError(413, "Request is too large.");
  let text: string;
  try { text = await req.text(); } catch { throw new HttpError(400, "Provide a valid JSON object."); }
  // Content-Length can be absent; check what actually arrived too.
  if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413, "Request is too large.");
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch { /* handled below */ }
  throw new HttpError(400, "Provide a valid JSON object.");
}
export function validHttps(value: string, label: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && value.length <= 2000) return url.toString();
  } catch { /* handled below */ }
  throw new HttpError(400, `${label} must be a valid HTTPS URL.`);
}
