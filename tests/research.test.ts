import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakes, state } from "./fakes";
import { parseResearchFields } from "../lib/research";
import { cardFee, longestRunning, unitEconomics } from "../lib/research.types";
import { searchMetaAds, summariseAds } from "../lib/meta-ads";
import { cjDetail, cjProductUrl, toCents } from "../lib/cj";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: vi.fn(), delete: vi.fn() }) }));

import { POST } from "../app/api/admin/research/route";

const ORIGIN = "https://delivery.example.com";
const research = (body: Record<string, unknown>) => POST(new Request(`${ORIGIN}/api/admin/research`, {
  method: "POST", headers: { "Content-Type": "application/json", origin: ORIGIN }, body: JSON.stringify(body),
}));
const json = async (response: Response) => ({ status: response.status, body: await response.json() as Record<string, unknown> & { item: Record<string, unknown> } });
const daysAgo = (days: number) => new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

beforeEach(() => {
  resetFakes(); jar.clear(); jar.set("veilcode_owner", "owner-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("research board", () => {
  it("saves an idea, updates it, links a draft store made from it, and deletes it", async () => {
    const created = await json(await research({ action: "create", title: "  Posture corrector ", ads: [{ url: "https://www.facebook.com/ads/library/?id=1", page: "Selure", startedAt: daysAgo(45), source: "meta" }] }));
    expect(created.status).toBe(200);
    expect(created.body.item).toMatchObject({ title: "Posture corrector", stage: "saved", supplier: null });
    const id = created.body.item.id as string;

    const updated = await json(await research({
      action: "update", id, stage: "sourcing", target_price: 2999,
      supplier: { source: "cj", id: "ABC-1", name: "Magnetic posture belt", url: "https://cjdropshipping.com/product/belt-p-ABC-1.html", cost: 119, shipping: 649, shippingName: "CJPacket", days: "5-11 days" },
    }));
    expect(updated.body.item).toMatchObject({ stage: "sourcing", target_price: 2999, ads: [expect.objectContaining({ page: "Selure" })] });

    const made = await json(await research({ action: "create-store", id, slug: "upright" }));
    expect(made.status).toBe(200);
    const store = state.products.find((product) => product.id === made.body.productId);
    expect(store).toMatchObject({ name: "Posture corrector", slug: "upright", kind: "physical", status: "draft" });
    expect(state.research_products[0]).toMatchObject({ store_product_id: store!.id, stage: "testing" });

    const { listResearch } = await import("../lib/research");
    expect((await listResearch())[0].store).toEqual({ slug: "upright", status: "draft" });
    expect((await research({ action: "create-store", id, slug: "upright-2" })).status).toBe(409);

    expect((await research({ action: "delete", id })).status).toBe(200);
    expect(state.research_products).toEqual([]);
    expect(state.products.some((product) => product.id === store!.id)).toBe(true);
  });

  it("checks what it saves", () => {
    expect(() => parseResearchFields({ title: "" }, true)).toThrow("Product name is required");
    expect(() => parseResearchFields({ stage: "winning" })).toThrow("Choose a stage");
    expect(() => parseResearchFields({ image_url: "http://example.com/a.jpg" })).toThrow("https://");
    expect(() => parseResearchFields({ target_price: -1 })).toThrow("amount");
    expect(() => parseResearchFields({ target_price: 12.5 })).toThrow("amount");
    expect(() => parseResearchFields({ ads: Array.from({ length: 21 }, () => ({ url: "https://example.com" })) })).toThrow("20 ads");
    expect(() => parseResearchFields({ ads: [{ url: "https://example.com", startedAt: "last week" }] })).toThrow("start date");
    expect(() => parseResearchFields({ supplier: { name: "", cost: 100 } })).toThrow("Supplier product name");
    expect(parseResearchFields({ notes: "a\u0000b", supplier: null, target_price: "" })).toEqual({ notes: "ab", supplier: null, target_price: null });
  });

  it("needs the owner and the store's own origin", async () => {
    jar.clear();
    expect((await research({ action: "create", title: "Lamp" })).status).toBe(401);
    jar.set("veilcode_owner", "owner-token");
    const foreign = await POST(new Request(`${ORIGIN}/api/admin/research`, { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }));
    expect(foreign.status).toBe(403);
    expect((await research({ action: "drop-tables" })).status).toBe(400);
    expect((await research({ action: "meta-search", query: "a" })).status).toBe(400);
  });
});

describe("profit per sale", () => {
  it("takes off the product, shipping and card fees", () => {
    expect(cardFee(2999)).toBe(117);
    const economics = unitEconomics({ target_price: 2999, supplier: { source: "cj", id: null, name: "Belt", url: null, cost: 119, shipping: 649, shippingName: null, days: null } });
    expect(economics).toMatchObject({ landed: 768, fees: 117, profit: 2114, shippingKnown: true });
    expect(economics!.margin).toBeCloseTo(0.705, 3);
    expect(unitEconomics({ target_price: null, supplier: null })).toBeNull();
  });

  it("reads how long the longest ad has run", () => {
    expect(longestRunning([
      { id: "1", url: "https://a.example", page: "", startedAt: daysAgo(12), source: "manual", note: "" },
      { id: "2", url: "https://b.example", page: "", startedAt: daysAgo(64), source: "meta", note: "" },
      { id: "3", url: "https://c.example", page: "", startedAt: null, source: "manual", note: "" },
    ])).toBe(64);
    expect(longestRunning([])).toBeNull();
  });
});

describe("Meta Ad Library", () => {
  it("groups an advertiser's versions of one ad and ranks long-running ones first", () => {
    const now = Date.parse("2026-11-13T12:00:00Z");
    const ads = summariseAds([
      { id: "new", page_id: "1", page_name: "Fresh Co", ad_creative_link_titles: ["New thing"], ad_delivery_start_time: "2026-11-10" },
      { id: "a", page_id: "2", page_name: "Selure", ad_creative_link_titles: ["Posture Bands Built In"], ad_delivery_start_time: "2026-09-01", eu_total_reach: 52000 },
      { id: "b", page_id: "2", page_name: "Selure", ad_creative_link_titles: ["posture bands built in"], ad_delivery_start_time: "2026-09-03" },
      { id: "c", page_id: "2", page_name: "Selure", ad_creative_link_titles: ["Posture Bands Built In"], ad_delivery_start_time: "2026-09-05" },
    ], now);
    expect(ads.map((ad) => ad.id)).toEqual(["a", "new"]);
    expect(ads[0]).toMatchObject({ page: "Selure", versions: 3, daysRunning: 73, reach: 52000, url: "https://www.facebook.com/ads/library/?id=a" });
  });

  it("explains what's missing instead of failing", async () => {
    vi.stubEnv("META_ACCESS_TOKEN", "");
    expect(await searchMetaAds("lamp")).toMatchObject({ status: "not_configured" });

    vi.stubEnv("META_ACCESS_TOKEN", "meta-token");
    const fetch = vi.fn(async () => Response.json({ error: { code: 10, error_subcode: 2332002, message: "Application does not have permission" } }, { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    expect(await searchMetaAds("lamp")).toMatchObject({ status: "not_approved" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("ads_archive?search_terms=lamp");
    expect(url).not.toContain("meta-token");
    expect(init.headers).toEqual({ Authorization: "Bearer meta-token" });

    fetch.mockImplementation(async () => Response.json({ error: { code: 190 } }, { status: 400 }));
    expect(await searchMetaAds("lamp")).toMatchObject({ status: "token_expired" });
  });
});

describe("CJ Dropshipping", () => {
  it("reads CJ prices and product links", () => {
    expect(toCents("0.95 -- 1.53")).toBe(95);
    expect(toCents("0.95-1.53")).toBe(95);
    expect(toCents(6.49)).toBe(649);
    expect(toCents("free")).toBeNull();
    expect(cjProductUrl("Magnetic Therapy Belt Posture Corrector!", "DC8C-1")).toBe("https://cjdropshipping.com/product/magnetic-therapy-belt-posture-corrector-p-DC8C-1.html");
  });

  it("finds the cheapest variant and US shipping, reusing one saved token", async () => {
    vi.stubEnv("CJ_API_KEY", "CJ123@api@key");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      calls.push(input.replace("https://developers.cjdropshipping.com/api2.0/v1", ""));
      if (input.endsWith("/authentication/getAccessToken")) return Response.json({ code: 200, result: true, data: { accessToken: "tok-1", accessTokenExpiryDate: "2027-05-12T07:11:03+08:00" } });
      expect((init?.headers as Record<string, string>)["CJ-Access-Token"]).toBe("tok-1");
      if (input.includes("/product/query")) return Response.json({ code: 200, result: true, data: { pid: "DC8C-1", productNameEn: "Posture Belt", bigImage: "https://cf.cjdropshipping.com/a.jpg", sellPrice: "0.95-1.53", variants: [{ vid: "v2", variantSellPrice: 1.53 }, { vid: "v1", variantSellPrice: 0.95 }] } });
      if (input.includes("/logistic/freightCalculate")) {
        expect(JSON.parse(String(init?.body))).toEqual({ startCountryCode: "CN", endCountryCode: "US", products: [{ quantity: 1, vid: "v1" }] });
        return Response.json({ code: 200, result: true, data: [{ logisticName: "USPS+", logisticPrice: 7.1, logisticAging: "4-8" }, { logisticName: "CJPacket", logisticPrice: 6.49, logisticAging: "5-11" }] });
      }
      throw new Error(`Unexpected ${input}`);
    }));
    expect(await cjDetail("DC8C-1")).toMatchObject({ source: "cj", name: "Posture Belt", cost: 95, shipping: 649, shippingName: "CJPacket", days: "5-11 days", variants: 2 });
    await cjDetail("DC8C-1");
    expect(calls.filter((call) => call.includes("getAccessToken"))).toHaveLength(1);
    expect(state.integration_tokens[0]).toMatchObject({ provider: "cj", access_token: "tok-1" });
    await expect(cjDetail("../etc")).rejects.toThrow("isn't valid");
  });
});
