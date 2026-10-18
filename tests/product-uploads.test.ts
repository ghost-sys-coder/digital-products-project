import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakes, signedUpload, storageInfo, storageDownload, productsCreate, seedProduct } from "./fakes";
import { prepareProductUpload, resolveProductUpload } from "../lib/product-uploads";
import { saveProduct } from "../lib/manage-products";
import { DOWNLOAD_UPLOAD_LIMIT, COVER_UPLOAD_LIMIT } from "../lib/upload-limits";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
import { POST as uploadRoute } from "../app/api/admin/products/upload/route";

beforeEach(resetFakes);
const uploadInput = (overrides: Record<string, unknown> = {}) => ({ productId: randomUUID(), revision: 0, kind: "download", filename: "My guide.pdf", size: DOWNLOAD_UPLOAD_LIMIT, ...overrides });
function formFor(productId: string, receipt: string) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ id: productId, revision: "0", name: "My guide", slug: "my-guide", tagline: "A helpful guide", description: "All the details", includes: "The guide", price: "19.00", currency: "gbp", status: "draft", sort_order: "0", templates_url: "", download_upload: receipt })) form.set(key, value);
  return form;
}

describe("private direct product uploads", () => {
  it("accepts and attaches a full 5 MB PDF using a small receipt-only save", async () => {
    const input = uploadInput();
    const prepared = await prepareProductUpload(input);
    const pdf = new Blob(["%PDF-", new Uint8Array(DOWNLOAD_UPLOAD_LIMIT - 5)], { type: "application/pdf" });
    storageInfo.mockResolvedValueOnce({ data: { size: pdf.size, contentType: pdf.type }, error: null });
    storageDownload.mockResolvedValueOnce({ data: pdf, error: null });
    const form = formFor(input.productId as string, prepared.receipt);
    expect(form.get("download")).toBeNull();
    const saved = await saveProduct(form);
    expect(saved.download_filename).toBe("My-guide.pdf");
    expect(saved.storage_path).toContain(`/${input.productId}/downloads/`);
    expect(saved.revision).toBe(1);
    expect(signedUpload).toHaveBeenCalledWith(saved.storage_path, { upsert: false });
  });
  it("rejects a PDF one byte above 5 MB before issuing an upload URL", async () => {
    await expect(prepareProductUpload(uploadInput({ size: DOWNLOAD_UPLOAD_LIMIT + 1 }))).rejects.toMatchObject({ status: 400 });
    expect(signedUpload).not.toHaveBeenCalled();
  });
  it("preserves the existing 3 MB cover allowance, including 1 MB covers", async () => {
    await expect(prepareProductUpload(uploadInput({ kind: "cover", filename: "cover.png", size: 1024 * 1024 }))).resolves.toHaveProperty("receipt");
    await expect(prepareProductUpload(uploadInput({ kind: "cover", filename: "cover.png", size: COVER_UPLOAD_LIMIT }))).resolves.toHaveProperty("receipt");
    await expect(prepareProductUpload(uploadInput({ kind: "cover", filename: "cover.png", size: COVER_UPLOAD_LIMIT + 1 }))).rejects.toMatchObject({ status: 400 });
  });
  it("rejects stale revisions and unsupported formats before issuing capabilities", async () => {
    const product = seedProduct({ revision: 3 });
    await expect(prepareProductUpload(uploadInput({ productId: product.id, revision: 2 }))).rejects.toMatchObject({ status: 409 });
    await expect(prepareProductUpload(uploadInput({ filename: "code.html" }))).rejects.toMatchObject({ status: 400 });
    expect(signedUpload).not.toHaveBeenCalled();
  });
  it("rejects tampering and receipts used for another product, kind, or revision", async () => {
    const input = uploadInput({ size: 5 });
    const prepared = await prepareProductUpload(input);
    const [payload, mac] = prepared.receipt.split(".");
    const modified = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), path: "another-store/private.pdf" })).toString("base64url");
    await expect(resolveProductUpload(`${modified}.${mac}`, input.productId as string, 0, "download")).rejects.toMatchObject({ status: 400 });
    await expect(resolveProductUpload(prepared.receipt, randomUUID(), 0, "download")).rejects.toMatchObject({ status: 400 });
    await expect(resolveProductUpload(prepared.receipt, input.productId as string, 0, "cover")).rejects.toMatchObject({ status: 400 });
    await expect(resolveProductUpload(prepared.receipt, input.productId as string, 1, "download")).rejects.toMatchObject({ status: 400 });
    expect(storageDownload).not.toHaveBeenCalled();
  });
  it("rejects expired receipts", async () => {
    const input = uploadInput({ size: 5 });
    const prepared = await prepareProductUpload(input);
    const now = vi.spyOn(Date, "now").mockReturnValue(prepared.expiresAt + 1);
    try { await expect(resolveProductUpload(prepared.receipt, input.productId as string, 0, "download")).rejects.toMatchObject({ status: 400 }); }
    finally { now.mockRestore(); }
    expect(storageDownload).not.toHaveBeenCalled();
  });
  it("fails closed for missing objects, changed sizes, or disguised file contents", async () => {
    const input = uploadInput({ size: 5 });
    const prepared = await prepareProductUpload(input);
    storageInfo.mockResolvedValueOnce({ data: null, error: { message: "Not found" } });
    await expect(resolveProductUpload(prepared.receipt, input.productId as string, 0, "download")).rejects.toMatchObject({ status: 503 });
    storageInfo.mockResolvedValueOnce({ data: { size: DOWNLOAD_UPLOAD_LIMIT + 1, contentType: "application/pdf" }, error: null });
    await expect(resolveProductUpload(prepared.receipt, input.productId as string, 0, "download")).rejects.toMatchObject({ status: 400 });
    expect(storageDownload).not.toHaveBeenCalled();
    storageDownload.mockResolvedValueOnce({ data: new Blob(["<html"]), error: null });
    await expect(saveProduct(formFor(input.productId as string, prepared.receipt))).rejects.toMatchObject({ status: 400 });
    expect(productsCreate).not.toHaveBeenCalled();
  });
  it("requires an authenticated owner and rejects a foreign Origin", async () => {
    const request = (origin: string) => new Request("https://delivery.example.com/api/admin/products/upload", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(uploadInput()) });
    expect((await uploadRoute(request("https://delivery.example.com"))).status).toBe(401);
    expect((await uploadRoute(request("https://foreign.example.com"))).status).toBe(403);
    expect(signedUpload).not.toHaveBeenCalled();
  });
});
