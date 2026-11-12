import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakes, seedPhysicalStore, state } from "./fakes";
import { STORE_ID } from "../lib/store-config";
import { attributionFrom, e164 } from "../lib/tiktok";
import { pixelLoader } from "../lib/tiktok-pixel";
import { buildPolicy, parseStorePolicies } from "../lib/store-policies";
import { stubDevelopment } from "./env";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));

import { POST as physicalRoute } from "../app/api/checkout/physical/route";
import { POST as webhookRoute } from "../app/api/stripe-webhook/route";

const PIXEL = "C4ABCD1234EFGH5678IJ";
const BLACK = "0b5e3c3e-6f4a-4f63-9a3c-1f0d3a1e2b01";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

function checkoutRequest(checkoutId: string, headers: Record<string, string> = {}) {
  return new Request("https://delivery.example.com/api/checkout/physical", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", origin: "https://delivery.example.com", referer: "https://delivery.example.com/s/glow?ttclid=E.C.P.abc",
      cookie: "_ttp=2abcTTPcookie; st_ttclid=E.C.P.abc123; other=1", "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Mozilla/5.0 Test",
      ...headers,
    },
    body: JSON.stringify({ productId: "glow-lamp", variantId: BLACK, quantity: 2, checkoutId }),
  });
}
function paidEvent(checkoutId: string) {
  const checkout = state.checkouts.find((row) => row.id === checkoutId)!;
  return new Request("https://delivery.example.com/api/stripe-webhook", { method: "POST", headers: { "stripe-signature": "sig" }, body: JSON.stringify({ id: "evt_tt", livemode: false, type: "checkout.session.completed", data: { object: {
    id: checkout.stripe_session_id, client_reference_id: checkout.id, payment_status: "paid", mode: "payment", currency: "usd",
    amount_subtotal: checkout.amount, amount_total: checkout.amount, shipping_cost: { amount_total: 0, shipping_rate: null },
    customer_details: { email: " Buyer@Example.com ", name: "Ada Lovelace", phone: "(555) 555-0100" },
    collected_information: { shipping_details: { name: "Ada Lovelace", address: { line1: "1 Main St", line2: null, city: "Austin", state: "TX", postal_code: "73301", country: "US" } } },
    metadata: { app: "veilcode-store", kind: "physical", checkout_id: checkout.id, product_id: "glow-lamp", store_id: STORE_ID },
  } } }) });
}

let tiktok: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetFakes();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("TIKTOK_ACCESS_TOKENS", `${PIXEL}=tt-secret-token`);
  tiktok = vi.fn(async () => new Response(JSON.stringify({ code: 0, message: "OK" }), { status: 200 }));
  vi.stubGlobal("fetch", tiktok);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("ad attribution", () => {
  it("reads TikTok identifiers from the checkout request, and nothing after an opt-out", () => {
    expect(attributionFrom(checkoutRequest(randomUUID()))).toEqual({
      ttclid: "E.C.P.abc123", ttp: "2abcTTPcookie", ip: "203.0.113.7", userAgent: "Mozilla/5.0 Test", url: "https://delivery.example.com/s/glow?ttclid=E.C.P.abc",
    });
    expect(attributionFrom(checkoutRequest(randomUUID(), { "sec-gpc": "1" }))).toBeNull();
    expect(attributionFrom(checkoutRequest(randomUUID(), { cookie: "st_ads_optout=1; _ttp=x" }))).toBeNull();
    const hostile = attributionFrom(checkoutRequest(randomUUID(), { cookie: "_ttp=<script>; st_ttclid=a\"b", referer: "https://evil.example/x" }))!;
    expect(hostile).toMatchObject({ ttp: null, ttclid: null, url: null });
  });

  it("normalises US phone numbers the way TikTok matches them", () => {
    expect(e164("(555) 555-0100")).toBe("+15555550100");
    expect(e164("1 555 555 0100")).toBe("+15555550100");
    expect(e164("+44 20 7946 0958")).toBe("+442079460958");
    expect(e164("12")).toBeNull();
  });
});

describe("purchase events from the server", () => {
  it("sends the purchase once, matching the pixel's event id, then forgets the attribution", async () => {
    seedPhysicalStore({ brand: { name: "Lumora Co.", supportEmail: "help@lumora.example", tiktokPixelId: PIXEL } });
    const checkoutId = randomUUID();
    expect((await physicalRoute(checkoutRequest(checkoutId))).status).toBe(200);
    expect(state.checkouts[0].attribution).toMatchObject({ ttclid: "E.C.P.abc123", ip: "203.0.113.7" });

    expect((await webhookRoute(paidEvent(checkoutId))).status).toBe(200);
    expect(tiktok).toHaveBeenCalledTimes(1);
    const [url, init] = tiktok.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://business-api.tiktok.com/open_api/v1.3/event/track/");
    expect((init.headers as Record<string, string>)["Access-Token"]).toBe("tt-secret-token");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ event_source: "web", event_source_id: PIXEL });
    expect(body).not.toHaveProperty("test_event_code");
    expect(body.data[0]).toMatchObject({
      event: "Purchase", event_id: checkoutId,
      user: { email: sha("buyer@example.com"), phone: sha("+15555550100"), ttclid: "E.C.P.abc123", ttp: "2abcTTPcookie", ip: "203.0.113.7", user_agent: "Mozilla/5.0 Test" },
      properties: { currency: "USD", value: 98, content_type: "product", contents: [{ content_id: "glow-lamp", content_name: "Glow Lamp", quantity: 2, price: 49 }] },
    });
    expect(state.checkouts[0].attribution).toBeNull();
    expect(state.orders[0].physical_snapshot).not.toHaveProperty("attribution");

    // A replayed webhook doesn't report the purchase again.
    await webhookRoute(paidEvent(checkoutId));
    expect(tiktok).toHaveBeenCalledTimes(1);
  });

  it("collects nothing for shoppers who opted out, or stores without a pixel", async () => {
    seedPhysicalStore({ brand: { name: "Lumora Co.", supportEmail: "help@lumora.example", tiktokPixelId: PIXEL } });
    const optedOut = randomUUID();
    await physicalRoute(checkoutRequest(optedOut, { "sec-gpc": "1" }));
    expect(state.checkouts.find((row) => row.id === optedOut)!.attribution).toBeNull();
    await webhookRoute(paidEvent(optedOut));
    expect(tiktok).not.toHaveBeenCalled();

    resetFakes();
    seedPhysicalStore();
    const noPixel = randomUUID();
    await physicalRoute(checkoutRequest(noPixel));
    expect(state.checkouts.find((row) => row.id === noPixel)!.attribution).toBeNull();
  });

  it("only reports staging purchases to TikTok's test events", async () => {
    stubDevelopment();
    seedPhysicalStore({ brand: { name: "Lumora Co.", supportEmail: "help@lumora.example", tiktokPixelId: PIXEL } });
    const checkoutId = randomUUID();
    await physicalRoute(new Request(checkoutRequest(checkoutId), { headers: { ...Object.fromEntries(checkoutRequest(checkoutId).headers), origin: "http://localhost:3000" } }));
    await webhookRoute(paidEvent(checkoutId));
    expect(tiktok).not.toHaveBeenCalled();
  });

  it("never holds up an order when TikTok is down", async () => {
    seedPhysicalStore({ brand: { name: "Lumora Co.", supportEmail: "help@lumora.example", tiktokPixelId: PIXEL } });
    tiktok.mockResolvedValueOnce(new Response(JSON.stringify({ code: 40001, message: "bad" }), { status: 200 }));
    const checkoutId = randomUUID();
    await physicalRoute(checkoutRequest(checkoutId));
    expect((await webhookRoute(paidEvent(checkoutId))).status).toBe(200);
    expect(state.orders).toHaveLength(1);
  });
});

describe("pixel and privacy policy", () => {
  it("skips the pixel for Global Privacy Control and opted-out browsers", () => {
    const loader = pixelLoader(PIXEL);
    expect(loader).toContain(`ttq.load("${PIXEL}")`);
    expect(loader).toContain("navigator.globalPrivacyControl===true");
    expect(loader).toContain("st_ads_optout=1");
  });

  it("explains TikTok sharing and the opt-out only when the store uses a pixel", () => {
    const policies = parseStorePolicies({
      version: 1, sellerName: "Lumora Co. Ltd", sellerAddress: "", processingDays: { min: 1, max: 3 }, returnWindowDays: 30, returnShippingPaidBy: "customer",
      refundDays: 5, lostParcelDays: 14, responseTime: "", governingLaw: "England and Wales", extra: {}, updatedAt: "2026-11-13",
    });
    const ctx = { brand: "Lumora", productName: "Glow Lamp", supportEmail: "help@lumora.example", currency: "usd", rates: [], policies };
    const text = (adTracking: boolean) => buildPolicy("privacy", { ...ctx, adTracking }).sections.flatMap((section) => section.paragraphs).join("\n");
    expect(text(true)).toContain("TikTok pixel");
    expect(text(true)).toContain("Global Privacy Control");
    expect(text(true)).toContain("“sharing”");
    expect(text(false)).not.toContain("TikTok");
    expect(text(false)).toContain("only the cookies needed for it to work");
  });
});
