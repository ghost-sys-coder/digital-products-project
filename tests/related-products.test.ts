import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakes, seedProduct, state } from "./fakes";
import { STORE_ID } from "../lib/store-config";
import { saveProduct } from "../lib/manage-products";
import { MAX_RELATED, parseProductInput } from "../lib/product-input";
import { relatedChoices, relatedProducts } from "../lib/related-products";
import { productPageHref } from "../lib/product-links";
import { getDigitalPage, listProducts } from "../lib/catalog";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: vi.fn(), delete: vi.fn() }) }));

beforeEach(() => {
  resetFakes(); jar.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** A product to suggest. No Stripe ids, so seeding it can't replace the main product's fake Stripe record. */
const extra = (slug: string, overrides: Parameters<typeof seedProduct>[0] = {}) => seedProduct({ slug, stripe_product_id: null, stripe_price_id: null, ...overrides });

function productForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ id: randomUUID(), revision: "0", name: "A useful kit", slug: "useful-kit", tagline: "A clear starting point", description: "Resources for your next project.", includes: "Guide\nTemplates", price: "29.50", currency: "usd", status: "draft", sort_order: "0", templates_url: "", ...overrides })) form.set(key, value);
  return form;
}

describe("related products input", () => {
  it("leaves the saved list alone when the form has no related field", () => {
    expect(parseProductInput(productForm()).related_ids).toBeUndefined();
  });
  it("reads ids in order, without duplicates or the product itself", () => {
    const [self, a, b] = [randomUUID(), randomUUID(), randomUUID()];
    expect(parseProductInput(productForm({ id: self, related: `${b}, ${a},${b},${self},` })).related_ids).toEqual([b, a]);
    expect(parseProductInput(productForm({ related: "" })).related_ids).toEqual([]);
  });
  it(`allows up to ${MAX_RELATED} valid ids`, () => {
    const many = Array.from({ length: MAX_RELATED + 1 }, () => randomUUID()).join(",");
    expect(() => parseProductInput(productForm({ related: many }))).toThrow(/up to 4/);
    expect(() => parseProductInput(productForm({ related: "../etc" }))).toThrow(/Invalid related product/);
  });
});

describe("saving related products", () => {
  it("keeps this store's digital products in the chosen order and drops anything else", async () => {
    const product = seedProduct({ slug: "main" });
    const second = extra("second");
    const draft = extra("upcoming", { status: "draft" });
    const store = extra("lamp", { kind: "physical" });
    const foreign = extra("elsewhere", { store_id: randomUUID() });
    const saved = await saveProduct(productForm({
      id: product.id, revision: "1", slug: "main",
      related: [draft.id, store.id, second.id, foreign.id].join(","),
    }));
    expect(saved.related_ids).toEqual([draft.id, second.id]);
  });
  it("keeps the saved list when an assistant's draft save doesn't send one", async () => {
    const suggested = extra("suggested");
    const product = seedProduct({ slug: "main", related_ids: [suggested.id] });
    const saved = await saveProduct(productForm({ id: product.id, revision: "1", slug: "main", name: "Renamed" }));
    expect(saved.name).toBe("Renamed");
    expect(saved.related_ids).toEqual([suggested.id]);
  });
  it("clears the list when the owner removes every suggestion", async () => {
    const suggested = extra("suggested");
    const product = seedProduct({ slug: "main", related_ids: [suggested.id] });
    const saved = await saveProduct(productForm({ id: product.id, revision: "1", slug: "main", related: "" }));
    expect(saved.related_ids).toEqual([]);
  });
});

describe("what a product page suggests", () => {
  it("shows chosen products that are published and priced, in the chosen order", async () => {
    const [a, b] = [extra("a"), extra("b")];
    const draft = extra("c", { status: "draft" });
    const unpriced = extra("d", { price_amount: null });
    const product = seedProduct({ slug: "main", related_ids: [b.id, draft.id, unpriced.id, a.id, randomUUID()] });
    expect(relatedProducts(product, await listProducts(true, "digital")).map((entry) => entry.slug)).toEqual(["b", "a"]);
  });
  it("shows nothing when the owner hasn't chosen any", async () => {
    extra("a");
    const product = seedProduct({ slug: "main" });
    expect(relatedProducts(product, await listProducts(true, "digital"))).toEqual([]);
  });
  it("offers the editor every other digital product, drafts included", async () => {
    const product = seedProduct({ slug: "main" });
    extra("upcoming", { status: "draft", cover_path: `${STORE_ID}/covers/c.png` });
    extra("lamp", { kind: "physical" });
    const choices = await relatedChoices(product.id);
    expect(choices).toEqual([expect.objectContaining({ slug: "upcoming", published: false, price: "$29", cover: expect.stringContaining("?preview=1") })]);
  });
});

describe("product page links and draft previews", () => {
  it("links to the public page, or the owner's preview for a draft", () => {
    expect(productPageHref({ kind: "digital", slug: "kit", status: "published" })).toBe("/p/kit");
    expect(productPageHref({ kind: "digital", slug: "kit", status: "draft" })).toBe("/p/kit?preview=1");
    expect(productPageHref({ kind: "physical", slug: "lamp", status: "published" })).toBe("/s/lamp");
    expect(productPageHref({ kind: "physical", slug: "lamp", status: "draft" })).toBe("/s/lamp?preview=1");
  });
  it("shows a draft only to the signed-in owner asking for a preview", async () => {
    extra("soon", { status: "draft" });
    expect(await getDigitalPage("soon", false)).toBeNull();
    expect(await getDigitalPage("soon", true)).toBeNull();
    jar.set("veilcode_owner", "owner-token");
    expect(await getDigitalPage("soon", false)).toBeNull();
    expect((await getDigitalPage("soon", true))?.slug).toBe("soon");
    expect(state.products).toHaveLength(1);
  });
  it("never serves a physical store or another store's product at /p/", async () => {
    jar.set("veilcode_owner", "owner-token");
    extra("lamp", { kind: "physical", status: "draft" });
    extra("theirs", { status: "draft", store_id: randomUUID() });
    expect(await getDigitalPage("lamp", true)).toBeNull();
    expect(await getDigitalPage("theirs", true)).toBeNull();
  });
});
