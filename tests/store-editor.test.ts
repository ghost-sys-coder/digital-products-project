import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHYSICAL_PREFIX, resetFakes, rpc, seedPhysicalStore, signedUpload, state, storageInfo, storageList, storageRemove } from "./fakes";
import { STORE_ID } from "../lib/store-config";
import { parseMoney, parseShippingProfile, parseVariants, policiesForSave, slugify } from "../lib/store-input";
import { mediaUploadProblem, sniffMedia } from "../lib/store-media";
import { regenerateVariants, type VariantDraft } from "../components/store-editor/draft";
import { describePageError } from "../components/store-editor/section-specs";
import { SECTION_LABELS } from "../lib/store-page";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: vi.fn(), delete: vi.fn() }) }));

import { POST as storesPost } from "../app/api/admin/stores/route";
import { POST as mediaPost } from "../app/api/admin/stores/media/route";

const ORIGIN = "https://delivery.example.com";
const PROFILE = "7d1f6a52-3c39-4a8e-9b7e-0a6c2f1d9e01";
const RATE = "7d1f6a52-3c39-4a8e-9b7e-0a6c2f1d9e02";
const VARIANT = "0b5e3c3e-6f4a-4f63-9a3c-1f0d3a1e2b01";
const today = new Date().toISOString().slice(0, 10);

function post(handler: (req: Request) => Promise<Response>, path: string, body: Record<string, unknown>, origin = ORIGIN) {
  return handler(new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) }));
}
const stores = (body: Record<string, unknown>, origin?: string) => post(storesPost, "/api/admin/stores", body, origin);
const media = (body: Record<string, unknown>) => post(mediaPost, "/api/admin/stores/media", body);

const policies = {
  sellerName: "Lumora Co. Ltd", sellerAddress: "", processingDays: { min: 1, max: 3 }, returnWindowDays: 30, returnShippingPaidBy: "customer",
  refundDays: 5, lostParcelDays: 14, responseTime: "", governingLaw: "England and Wales", extra: {},
};
function saveBody(overrides: Record<string, unknown> = {}) {
  return {
    action: "save", id: "glow-lamp", revision: 1, status: "draft", name: "Glow Lamp", slug: "glow", tagline: "Lumora", theme: "bold-dark",
    brand: { name: "Lumora Co.", logoPath: null, accent: "#7c5cff", supportEmail: "help@lumora.example" },
    page: { version: 1, sections: [{ id: "hero", type: "hero", enabled: true, data: { headline: "Glow", media: [{ path: `${PHYSICAL_PREFIX}media/a.webp`, kind: "image", alt: "Lamp" }] } }] },
    variants: [{ id: VARIANT, options: { Color: "Black" }, price_amount: 4900, compare_at_amount: 6900, sku: " GLW-B ", image_path: null, active: true, supplier_url: "https://supplier.example/item/1", supplier_sku: "" }],
    profiles: [{ id: PROFILE, name: "Standard US", rates: [{ id: RATE, market: "US", name: "Free tracked shipping", amount: 0, min_days: 7, max_days: 12, active: true }] }],
    shippingProfileId: PROFILE, policies,
    ...overrides,
  };
}
const draftVariant = (options: Record<string, string>, price = "49"): VariantDraft => ({
  id: crypto.randomUUID(), options, price, compareAt: "", sku: "", image: null, supplierUrl: "https://supplier.example/x", supplierSku: "", active: true,
});

beforeEach(() => {
  resetFakes(); jar.clear(); jar.set("veilcode_owner", "owner-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("store editor input", () => {
  it("reads prices the way owners type them", () => {
    expect(parseMoney("49")).toBe(4900);
    expect(parseMoney("$1,049.99")).toBe(104999);
    expect(parseMoney("49.9")).toBe(4990);
    for (const bad of ["", "49.999", "abc", "-5"]) expect(parseMoney(bad)).toBeNaN();
    expect(slugify("Nebula Galaxy Projector!")).toBe("nebula-galaxy-projector");
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });

  it("validates variants and keeps supplier details private-only fields tidy", () => {
    const variant = { id: VARIANT, options: { Color: "Black" }, price_amount: 4900, compare_at_amount: null, sku: "", image_path: null, active: true, supplier_url: "", supplier_sku: "" };
    expect(parseVariants([variant], STORE_ID, "glow-lamp")[0]).toMatchObject({ sku: null, supplier_url: null, supplier_sku: null });
    const other = { ...variant, id: "0b5e3c3e-6f4a-4f63-9a3c-1f0d3a1e2b02" };
    expect(() => parseVariants([variant, { ...other, options: { color: "black" } }], STORE_ID, "glow-lamp")).toThrow(/two "black" variants/i);
    expect(() => parseVariants([variant, { ...other, options: { Size: "M" } }], STORE_ID, "glow-lamp")).toThrow(/value for each option/);
    expect(() => parseVariants([{ ...variant, compare_at_amount: 4900 }], STORE_ID, "glow-lamp")).toThrow(/compare-at/);
    expect(() => parseVariants([{ ...variant, price_amount: 49 }], STORE_ID, "glow-lamp")).toThrow(/at least \$0.50/);
    expect(() => parseVariants([{ ...variant, supplier_url: "http://supplier.example" }], STORE_ID, "glow-lamp")).toThrow(/https/);
    expect(() => parseVariants([{ ...variant, image_path: `${STORE_ID}/other-product/media/a.webp` }], STORE_ID, "glow-lamp")).toThrow(/this store's media/);
    expect(() => parseVariants([{ ...variant, image_path: `${PHYSICAL_PREFIX}media/clip.mp4` }], STORE_ID, "glow-lamp")).toThrow(/this store's media/);
  });

  it("keeps variant details when options change", () => {
    const black = draftVariant({ Color: "Black" }, "49");
    const withWhite = regenerateVariants([{ name: "Color", values: ["Black", "White"] }], [black]);
    expect(withWhite.map((variant) => variant.options.Color)).toEqual(["Black", "White"]);
    expect(withWhite[0].id).toBe(black.id);
    expect(withWhite[1]).toMatchObject({ price: "49", supplierUrl: "https://supplier.example/x" });
    expect(withWhite[1].id).not.toBe(black.id);

    const withSize = regenerateVariants([{ name: "Color", values: ["Black", "White"] }, { name: "Size", values: ["S", "M"] }], withWhite);
    expect(withSize).toHaveLength(4);
    expect(withSize[0]).toMatchObject({ id: black.id, options: { Color: "Black", Size: "S" } });
    expect(new Set(withSize.map((variant) => variant.id)).size).toBe(4);

    const single = draftVariant({}, "25");
    expect(regenerateVariants([{ name: "Size", values: ["S"] }], [single])[0]).toMatchObject({ id: single.id, options: { Size: "S" }, price: "25" });
    expect(regenerateVariants([{ name: "Size", values: [] }], [single])).toEqual([{ ...single, options: {} }]);
  });

  it("validates shipping profiles against what checkout can offer", () => {
    const rate = (index: number) => ({ id: `7d1f6a52-3c39-4a8e-9b7e-0a6c2f1d9e1${index}`, market: "US", name: `Rate ${index}`, amount: 0, min_days: 3, max_days: 5, active: true });
    expect(parseShippingProfile({ id: PROFILE, name: " Standard ", rates: [rate(1)] })).toMatchObject({ name: "Standard", rates: [{ currency: "usd", market: "US" }] });
    expect(() => parseShippingProfile({ id: PROFILE, name: "Standard", rates: [1, 2, 3, 4, 5, 6].map(rate) })).toThrow(/at most 5/);
    expect(() => parseShippingProfile({ id: PROFILE, name: "Standard", rates: [{ ...rate(1), min_days: 9, max_days: 4 }] })).toThrow(/slowest/);
    expect(() => parseShippingProfile({ id: "profile-1", name: "Standard", rates: [] })).toThrow(/invalid id/);
  });

  it("keeps incomplete policies on drafts without the publishable marker", () => {
    const partial = policiesForSave({ ...policies, sellerName: "" }, {}, today, false);
    expect(partial).not.toHaveProperty("version");
    expect(partial).toMatchObject({ governingLaw: "England and Wales", processingDays: { min: 1, max: 3 } });
    expect(() => policiesForSave({ ...policies, sellerName: "" }, {}, today, true)).toThrow(/sellerName/);

    const complete = policiesForSave(policies, {}, today, false);
    expect(complete).toMatchObject({ version: 1, updatedAt: today, responseTime: "within 1–2 business days" });
    expect(policiesForSave(policies, { ...complete, updatedAt: "2026-01-02" }, today, false).updatedAt).toBe("2026-01-02");
    expect(policiesForSave({ ...policies, refundDays: 7 }, { ...complete, updatedAt: "2026-01-02" }, today, false).updatedAt).toBe(today);
  });

  it("describes page problems in the owner's words", () => {
    const page = saveBody().page as never;
    expect(describePageError("page.sections[0].data.media[0].path: is not a file from this store", page, SECTION_LABELS))
      .toEqual({ section: 0, text: "Hero and buy box › Gallery 1 › File is not a file from this store" });
  });
});

describe("store media rules", () => {
  it("explains files it can't take", () => {
    expect(mediaUploadProblem("clip.MOV", 1000)).toMatch(/convert it to MP4/);
    expect(mediaUploadProblem("logo.svg", 1000)).toMatch(/SVG/);
    expect(mediaUploadProblem("loop.gif", 6 * 1024 * 1024)).toMatch(/GIFs must be 5\.0 MB or smaller/);
    expect(mediaUploadProblem("clip.mp4", 26 * 1024 * 1024)).toMatch(/Videos must be 25 MB/);
    expect(mediaUploadProblem("photo.JPEG", 1000)).toBeNull();
  });

  it("checks file contents, not just names", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffMedia(png, "png")).toBe(true);
    expect(sniffMedia(png, "webp")).toBe(false);
    const mp4 = new Uint8Array([0, 0, 0, 0x20, ...new TextEncoder().encode("ftypisom")]);
    expect(sniffMedia(mp4, "mp4")).toBe(true);
    expect(sniffMedia(new TextEncoder().encode("<html><script>"), "gif")).toBe(false);
  });
});

describe("store editor API", () => {
  it("requires the signed-in owner and a same-site request", async () => {
    jar.clear();
    expect((await stores({ action: "create", name: "Glow", slug: "glow-2" })).status).toBe(401);
    expect((await media({ action: "prepare", productId: "glow-lamp", filename: "a.png", size: 10 })).status).toBe(401);
    jar.set("veilcode_owner", "owner-token");
    expect((await stores({ action: "create", name: "Glow", slug: "glow-2" }, "https://evil.example")).status).toBe(403);
    expect(state.products).toHaveLength(0);
  });

  it("creates a draft store from the starter page", async () => {
    const response = await stores({ action: "create", name: "Nebula Galaxy Projector", slug: "nebula", theme: "vibrant-pop" });
    expect(response.status).toBe(200);
    const { id } = await response.json();
    const product = state.products.find((entry) => entry.id === id)!;
    expect(product).toMatchObject({ kind: "physical", status: "draft", slug: "nebula", theme: "vibrant-pop", brand: { name: "Nebula Galaxy Projector" }, policies: {} });
    expect((product.page as { sections: { type: string }[] }).sections.map((section) => section.type)).toContain("hero");
    expect((await stores({ action: "create", name: "Again", slug: "nebula" })).status).toBe(409);
    expect((await stores({ action: "create", name: "Bad", slug: "Not A Slug" })).status).toBe(400);
  });

  it("saves the product, variants, shipping and policies together", async () => {
    seedPhysicalStore();
    const response = await stores(saveBody());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, revision: 2, slug: "glow", status: "draft" });
    const product = state.products[0];
    expect(product).toMatchObject({ revision: 2, shipping_profile_id: PROFILE, brand: { accent: "#7c5cff" }, policies: { version: 1, sellerName: "Lumora Co. Ltd", updatedAt: today } });
    expect(state.product_variants.filter((variant) => variant.product_id === "glow-lamp")).toEqual([expect.objectContaining({ id: VARIANT, sku: "GLW-B", compare_at_amount: 6900, supplier_sku: null })]);
    expect(state.shipping_profiles).toEqual([expect.objectContaining({ id: PROFILE, name: "Standard US" })]);
    expect(state.shipping_rates.filter((rate) => rate.profile_id === PROFILE)).toEqual([expect.objectContaining({ id: RATE, currency: "usd", min_days: 7 })]);
    expect(rpc).toHaveBeenCalledWith("save_physical_store", expect.objectContaining({ p_store_id: STORE_ID, p_revision: 1 }));
  });

  it("refuses a save made from an out-of-date editor", async () => {
    seedPhysicalStore();
    const response = await stores(saveBody({ revision: 0, name: "Stale" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/another tab/);
    expect(state.products[0].name).toBe("Glow Lamp");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("only publishes a complete store, and says what's missing", async () => {
    seedPhysicalStore();
    const response = await stores(saveBody({ status: "published", brand: { name: "Lumora", supportEmail: null }, policies: { ...policies, governingLaw: "" } }));
    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error).toMatch(/^Policies: governingLaw/);
    const missingEmail = await stores(saveBody({ status: "published", brand: { name: "Lumora", supportEmail: null } }));
    expect((await missingEmail.json()).error).toMatch(/Before publishing: Add a support email/);
    expect(state.products[0].revision).toBe(1);

    const published = await stores(saveBody({ status: "published" }));
    expect(published.status).toBe(200);
    expect(state.products[0].status).toBe("published");
  });

  it("refuses media and variants that belong to another product", async () => {
    seedPhysicalStore();
    const foreign = saveBody({ page: { version: 1, sections: [{ id: "hero", type: "hero", data: { media: [{ path: `${STORE_ID}/other/media/a.webp`, kind: "image", alt: "" }] } }] } });
    expect((await stores(foreign)).status).toBe(400);
    state.product_variants.push({ ...state.product_variants[0], id: "0b5e3c3e-6f4a-4f63-9a3c-1f0d3a1e2b99", product_id: "someone-else" });
    const stolen = saveBody({ variants: [{ ...(saveBody().variants as Record<string, unknown>[])[0], id: "0b5e3c3e-6f4a-4f63-9a3c-1f0d3a1e2b99" }] });
    const response = await stores(stolen);
    expect(response.status).toBe(409);
    expect(state.products[0].revision).toBe(1);
  });

  it("prepares direct uploads into the store's media folder only", async () => {
    seedPhysicalStore();
    const refused = await media({ action: "prepare", productId: "glow-lamp", filename: "clip.mov", size: 1000 });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatch(/MP4/);
    const prepared = await (await media({ action: "prepare", productId: "glow-lamp", filename: "Clip Final.MP4", size: 5000 })).json();
    expect(prepared.path).toMatch(new RegExp(`^${PHYSICAL_PREFIX}media/[0-9a-f-]{36}\\.mp4$`));
    expect(prepared.contentType).toBe("video/mp4");
    const poster = await (await media({ action: "prepare", productId: "glow-lamp", filename: "poster.webp", size: 500, posterFor: prepared.path })).json();
    expect(poster.path).toBe(prepared.path.replace(/\.mp4$/, ".poster.webp"));
    expect(signedUpload).toHaveBeenLastCalledWith(poster.path, { upsert: true });
    expect((await media({ action: "prepare", productId: "lead-to-kickoff", filename: "a.png", size: 10 })).status).toBe(404);
  });

  it("verifies an upload's contents and removes impostors", async () => {
    seedPhysicalStore();
    const path = `${PHYSICAL_PREFIX}media/0f8b1c2a-1111-4222-8333-944455566677.png`;
    storageInfo.mockResolvedValue({ data: { size: 2048, contentType: "image/png" }, error: null });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new TextEncoder().encode("<svg onload=alert(1)>"), { status: 206 })));
    const impostor = await media({ action: "confirm", productId: "glow-lamp", path });
    expect(impostor.status).toBe(400);
    expect(storageRemove).toHaveBeenCalledWith([path]);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), { status: 206 })));
    const ok = await media({ action: "confirm", productId: "glow-lamp", path });
    expect(await ok.json()).toMatchObject({ path, kind: "image", size: 2048 });
    expect((await media({ action: "confirm", productId: "glow-lamp", path: `${PHYSICAL_PREFIX}media/../../x.png` })).status).toBe(400);
  });

  it("deletes only media the saved store doesn't use", async () => {
    seedPhysicalStore();
    expect((await media({ action: "delete", productId: "glow-lamp", path: `${PHYSICAL_PREFIX}media/a.webp` })).status).toBe(409);
    expect((await media({ action: "delete", productId: "glow-lamp", path: `${PHYSICAL_PREFIX}media/black.webp` })).status).toBe(409);
    const clip = `${PHYSICAL_PREFIX}media/clip.mp4`;
    expect((await media({ action: "delete", productId: "glow-lamp", path: clip })).status).toBe(200);
    expect(storageRemove).toHaveBeenCalledWith([clip, `${PHYSICAL_PREFIX}media/clip.poster.webp`, `${PHYSICAL_PREFIX}media/clip.poster.jpg`, `${PHYSICAL_PREFIX}media/clip.poster.png`]);
    expect(storageList).not.toHaveBeenCalled();
  });
});
