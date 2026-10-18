import { productUploadLimit, productUploadLimitLabel, type ProductUploadKind } from "./upload-limits";

export type UploadedProductFile = { file: File; receipt: string; expiresAt: number };
export async function uploadProductFromBrowser(productId: string, revision: number, kind: ProductUploadKind, file: File): Promise<UploadedProductFile> {
  if (!file.size || file.size > productUploadLimit(kind)) throw new Error(`${kind === "cover" ? "Covers" : "Downloads"} must be ${productUploadLimitLabel(kind)} or smaller.`);
  const response = await fetch("/api/admin/products/upload", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, revision, kind, filename: file.name, size: file.size }),
  });
  const upload = await response.json();
  if (!response.ok) throw new Error(upload.error || "Could not prepare the upload. Please try again.");
  // This URL grants an upload to exactly one new private object; no API key goes to the browser.
  const result = await fetch(upload.signedUrl, { method: "PUT", headers: { "Content-Type": upload.contentType, "x-upsert": "false" }, body: file });
  if (!result.ok) throw new Error("The file upload failed. Check your connection and try again.");
  return { file, receipt: upload.receipt, expiresAt: upload.expiresAt };
}
