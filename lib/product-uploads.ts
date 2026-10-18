import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";
import { getSupabase } from "./supabase";
import { getCatalogProduct } from "./catalog";
import { HttpError } from "./http";
import { STORE_ID } from "./store-config";
import { productUploadLimit, productUploadLimitLabel, type ProductUploadKind } from "./upload-limits";

const formats = {
  pdf: "application/pdf", zip: "application/zip", png: "image/png", jpg: "image/jpeg", webp: "image/webp",
} as const;
type Extension = keyof typeof formats;
type UploadReceipt = { productId: string; revision: number; kind: ProductUploadKind; path: string; filename: string; contentType: string; size: number; expiresAt: number };

export function validateUploadSize(size: number, kind: ProductUploadKind) {
  if (!Number.isSafeInteger(size) || size <= 0) throw new HttpError(400, "This file is empty. Choose a different file.");
  if (size > productUploadLimit(kind)) throw new HttpError(400, `${kind === "cover" ? "Covers" : "Downloads"} must be ${productUploadLimitLabel(kind)} or smaller.`);
}
function fileDetails(name: string, extension: Extension) {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100) || "download";
  return { extension, filename: `${stem}.${extension}`, contentType: formats[extension] };
}
export async function inspectProductFile(file: Blob, name: string, kind: ProductUploadKind) {
  validateUploadSize(file.size, kind);
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  let extension: Extension | undefined;
  if (kind === "cover") {
    if (bytes[0] === 0x89 && Buffer.from(bytes.slice(1, 4)).toString() === "PNG") extension = "png";
    else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) extension = "jpg";
    else if (Buffer.from(bytes.slice(0, 4)).toString() === "RIFF" && Buffer.from(bytes.slice(8, 12)).toString() === "WEBP") extension = "webp";
  } else {
    if (Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-") extension = "pdf";
    else if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) extension = "zip";
  }
  if (!extension) throw new HttpError(400, kind === "cover" ? "Upload a PNG, JPEG, or WebP cover." : "Upload a PDF or ZIP download.");
  return fileDetails(name, extension);
}
function signature(payload: string) {
  // Separate this capability from other uses of the server-only service key.
  return createHmac("sha256", getEnv().SUPABASE_SERVICE_ROLE_KEY).update(`product-upload-v1:${payload}`).digest();
}
export async function prepareProductUpload(input: Record<string, unknown>) {
  const { productId, revision, kind, filename, size } = input;
  if (typeof productId !== "string" || !/^(lead-to-kickoff|[0-9a-f-]{36})$/.test(productId) || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0 || (kind !== "cover" && kind !== "download") || typeof filename !== "string" || filename.length > 255 || typeof size !== "number") throw new HttpError(400, "Invalid upload details.");
  validateUploadSize(size, kind);
  const rawExtension = filename.split(".").pop()?.toLowerCase();
  const extension = rawExtension === "jpeg" ? "jpg" : rawExtension;
  if (!extension || !(kind === "cover" ? ["png", "jpg", "webp"] : ["pdf", "zip"]).includes(extension)) throw new HttpError(400, "Choose a supported file format.");
  const product = await getCatalogProduct(productId);
  if ((!product && revision !== 0) || (product && product.revision !== revision)) throw new HttpError(409, "This product changed. Reload before uploading again.");
  const details = fileDetails(filename, extension as Extension);
  const path = `${STORE_ID}/${productId}/${kind === "cover" ? "covers" : "downloads"}/${randomUUID()}.${extension}`;
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
  const receipt: UploadReceipt = { productId, revision, kind, path, filename: details.filename, contentType: details.contentType, size, expiresAt };
  const payload = Buffer.from(JSON.stringify(receipt)).toString("base64url");
  const { data, error } = await getSupabase().storage.from(getEnv().SUPABASE_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new HttpError(503, "Could not prepare the upload. Please try again.");
  return { signedUrl: data.signedUrl, contentType: details.contentType, receipt: `${payload}.${signature(payload).toString("base64url")}`, expiresAt };
}
export async function resolveProductUpload(token: string, productId: string, revision: number, kind: ProductUploadKind) {
  if (token.length > 4096) throw new HttpError(400, "Invalid upload receipt.");
  const [payload, mac, extra] = token.split(".");
  const provided = Buffer.from(mac ?? "", "base64url");
  const expected = signature(payload ?? "");
  if (!payload || extra || provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new HttpError(400, "Invalid upload receipt.");
  let receipt: UploadReceipt;
  try { receipt = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { throw new HttpError(400, "Invalid upload receipt."); }
  if (receipt.productId !== productId || receipt.revision !== revision || receipt.kind !== kind || !receipt.path.startsWith(`${STORE_ID}/${productId}/${kind === "cover" ? "covers" : "downloads"}/`)) throw new HttpError(400, "This upload belongs to another product or revision.");
  if (receipt.expiresAt <= Date.now()) throw new HttpError(400, "This upload expired. Choose the file again and retry.");
  validateUploadSize(receipt.size, kind);
  const storage = getSupabase().storage.from(getEnv().SUPABASE_BUCKET);
  const { data: info, error: infoError } = await storage.info(receipt.path);
  if (infoError || !info) throw new HttpError(503, "Could not verify the uploaded file. Please try saving again.");
  if (info.size !== receipt.size || info.contentType !== receipt.contentType) throw new HttpError(400, "The uploaded file does not match its upload details. Choose the file again.");
  const { data: blob, error } = await storage.download(receipt.path);
  if (error || !blob) throw new HttpError(503, "Could not verify the uploaded file. Please try saving again.");
  if (blob.size !== receipt.size) throw new HttpError(400, "The uploaded file size does not match. Choose the file again.");
  const details = await inspectProductFile(blob, receipt.filename, kind);
  if (details.contentType !== receipt.contentType) throw new HttpError(400, "The uploaded file contents do not match its format.");
  return { path: receipt.path, filename: details.filename, contentType: details.contentType };
}
