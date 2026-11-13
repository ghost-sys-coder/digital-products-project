import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getSupabase } from "../supabase";
import { HttpError } from "../http";
import type { McpUpload } from "../database.types";

// Files an assistant hands the studio: a link the server downloads (CJ photos, ChatGPT's file links),
// or bytes sent in base64 pieces by assistants that can read a file themselves.

const MAX_REDIRECTS = 3;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const PART_CHARS = 1_000_000;

/** Private, loopback, link-local and other non-public addresses, which a download must never reach. */
export function privateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? privateAddress(mapped[1]) : false;
  }
  const [a, b] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

async function assertPublicUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new HttpError(400, "That isn't a valid link."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new HttpError(400, "Only https:// links can be imported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new HttpError(400, "That link points to a private address.");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
  if (!addresses.length) throw new HttpError(400, "Couldn't find that link's server.");
  if (addresses.some(privateAddress)) throw new HttpError(400, "That link points to a private address.");
  return url;
}

/** Downloads a public https file, following up to 3 redirects (each checked) and stopping at the size limit. */
export async function downloadFile(link: string, maxBytes = MAX_FILE_BYTES) {
  let url = await assertPublicUrl(link);
  for (let hop = 0; ; hop++) {
    let response: Response;
    try {
      response = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "VeilCodeStudio/1.0 (+media import)" } });
    } catch { throw new HttpError(502, "Couldn't download that file. Check the link and try again."); }
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next || hop >= MAX_REDIRECTS) throw new HttpError(502, "That link redirected too many times.");
      url = await assertPublicUrl(new URL(next, url).toString());
      continue;
    }
    if (!response.ok || !response.body) throw new HttpError(502, `The link returned an error (${response.status}).`);
    if (Number(response.headers.get("content-length")) > maxBytes) throw new HttpError(400, "That file is too large.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel().catch(() => {}); throw new HttpError(400, "That file is too large."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const name = decodeURIComponent(url.pathname.split("/").pop() ?? "").slice(0, 200) || "file";
    return { bytes, name, contentType: response.headers.get("content-type") ?? "" };
  }
}

export function decodeBase64(data: string) {
  const clean = data.replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(clean)) throw new HttpError(400, "That isn't valid base64.");
  return new Uint8Array(Buffer.from(clean.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
}

// â”€â”€ Uploads in pieces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function startUpload(connectionId: string, productId: string, filename: string, size: number) {
  const name = filename.replace(/[^\w.\- ]+/g, "").trim().slice(0, 200) || "file";
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES) throw new HttpError(400, "Uploads can be up to 25 MB.");
  const { data, error } = await getSupabase().from("mcp_uploads").insert({ connection_id: connectionId, product_id: productId, filename: name, size, parts: [], received: 0 }).select("id").single();
  if (error || !data) throw new HttpError(500, "Could not start the upload.");
  return { uploadId: (data as { id: string }).id, maxPartCharacters: PART_CHARS };
}

async function loadUpload(connectionId: string, uploadId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new HttpError(404, "That upload wasn't found.");
  const { data } = await getSupabase().from("mcp_uploads").select("*").eq("id", uploadId).eq("connection_id", connectionId).maybeSingle();
  const upload = data as McpUpload | null;
  if (!upload) throw new HttpError(404, "That upload wasn't found. Start a new one.");
  if (Date.parse(upload.created_at) < Date.now() - 3600_000) throw new HttpError(410, "That upload expired. Start a new one.");
  return upload;
}

/** Adds the next piece. Pieces must arrive in order; resending the last piece is harmless. */
export async function appendUpload(connectionId: string, uploadId: string, index: number, data: string) {
  const upload = await loadUpload(connectionId, uploadId);
  if (typeof data !== "string" || !data || data.length > PART_CHARS) throw new HttpError(400, `Send pieces of up to ${PART_CHARS.toLocaleString("en-US")} base64 characters.`);
  if (data.replace(/\s+/g, "").length % 4 !== 0) throw new HttpError(400, "Each piece must be a whole number of 4-character base64 groups. Split the base64 text at multiples of 4.");
  if (index === upload.parts.length - 1 && upload.parts[index] === data) return { received: upload.received, parts: upload.parts.length };
  if (index !== upload.parts.length) throw new HttpError(409, `Send piece ${upload.parts.length} next.`);
  const bytes = decodeBase64(data).length;
  if (upload.received + bytes > upload.size) throw new HttpError(400, "More data arrived than the upload's size.");
  const { error } = await getSupabase().from("mcp_uploads").update({ parts: [...upload.parts, data], received: upload.received + bytes }).eq("id", upload.id).eq("received", upload.received);
  if (error) throw new HttpError(500, "Could not save that piece. Send it again.");
  return { received: upload.received + bytes, parts: upload.parts.length + 1 };
}

/** Joins the pieces, removes the upload, and returns the file. */
export async function finishUpload(connectionId: string, uploadId: string) {
  const upload = await loadUpload(connectionId, uploadId);
  const bytes = decodeBase64(upload.parts.join(""));
  if (bytes.length !== upload.size) throw new HttpError(400, `The upload is incomplete: ${bytes.length.toLocaleString("en-US")} of ${upload.size.toLocaleString("en-US")} bytes arrived.`);
  await getSupabase().from("mcp_uploads").delete().eq("id", upload.id);
  return { bytes, productId: upload.product_id, filename: upload.filename };
}
