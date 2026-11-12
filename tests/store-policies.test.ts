import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakes, seedPhysicalStore, sessionsCreate } from "./fakes";
import { buildPolicy, parseStorePolicies, PoliciesError, POLICY_KINDS, storeReadinessProblems, type StorePolicies } from "../lib/store-policies";
import { startPhysicalCheckout } from "../lib/physical-checkout";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));

const settings = (overrides: Record<string, unknown> = {}) => ({
  version: 1, sellerName: "Lumora Co. Ltd", sellerAddress: "1 High St, London", processingDays: { min: 1, max: 3 },
  returnWindowDays: 30, returnShippingPaidBy: "customer", refundDays: 5, lostParcelDays: 14, responseTime: "",
  governingLaw: "the State of Delaware, USA", extra: {}, updatedAt: "2026-11-12", ...overrides,
});
const ctx = (policies: StorePolicies) => ({
  brand: "Lumora", productName: "Glow Lamp", supportEmail: "help@lumora.example", currency: "usd", policies,
  rates: [{ name: "Free tracked shipping", amount: 0, minDays: 7, maxDays: 12 }, { name: "Express", amount: 995, minDays: 4, maxDays: 6 }],
});
const allText = (doc: ReturnType<typeof buildPolicy>) => [doc.intro, ...doc.sections.flatMap((section) => [...section.paragraphs, ...(section.table ?? []).flat()])].join("\n");

beforeEach(() => { resetFakes(); vi.spyOn(console, "warn").mockImplementation(() => {}); });

describe("policy settings", () => {
  it("normalises valid settings and keeps only non-empty extra paragraphs", () => {
    const parsed = parseStorePolicies(settings({ sellerName: "  Lumora Co. Ltd ", extra: { returns: "  Sale items are final. ", terms: "", spam: "x" } }));
    expect(parsed).toMatchObject({ sellerName: "Lumora Co. Ltd", responseTime: "within 1–2 business days", extra: { returns: "Sale items are final." } });
    expect(parsed.extra).not.toHaveProperty("terms");
    expect(parsed.extra).not.toHaveProperty("spam");
  });

  it("refuses incomplete or out-of-range settings, naming the field", () => {
    for (const [overrides, field] of [
      [{ sellerName: "" }, /sellerName/], [{ governingLaw: "" }, /governingLaw/], [{ processingDays: { min: 3, max: 1 } }, /processingDays.max/],
      [{ returnWindowDays: 400 }, /returnWindowDays/], [{ returnShippingPaidBy: "nobody" }, /returnShippingPaidBy/],
      [{ refundDays: 0 }, /refundDays/], [{ version: 2 }, /version/], [{ updatedAt: "soon" }, /updatedAt/], [{ extra: { terms: "x".repeat(3001) } }, /extra.terms/],
    ] as const) expect(() => parseStorePolicies(settings(overrides))).toThrow(field);
    expect(() => parseStorePolicies({})).toThrow(PoliciesError);
  });
});

describe("generated policy pages", () => {
  it("builds the shipping policy from the live rates, including total delivery time", () => {
    const doc = buildPolicy("shipping", ctx(parseStorePolicies(settings())));
    const table = doc.sections.find((section) => section.table)!.table!;
    expect(table).toEqual([["Option", "Delivery time", "Cost"], ["Free tracked shipping", "7–12 business days", "Free"], ["Express", "4–6 business days", "$9.95"]]);
    const text = allText(doc);
    expect(text).toContain("within 1–3 business days of payment");
    expect(text).toContain("most orders arrive 5–15 business days after you order");
    expect(text).toContain("you can choose to cancel for a full refund");
    expect(text).toContain("may be outside the United States");
  });

  it("describes returns by window and by who pays return shipping", () => {
    expect(allText(buildPolicy("returns", ctx(parseStorePolicies(settings()))))).toContain("The cost of sending a change-of-mind return back to us is yours");
    expect(allText(buildPolicy("returns", ctx(parseStorePolicies(settings({ returnShippingPaidBy: "store" })))))).toContain("We cover the cost of return shipping.");
    const finalSale = buildPolicy("returns", ctx(parseStorePolicies(settings({ returnWindowDays: 0 }))));
    expect(finalSale.sections.map((section) => section.heading)).not.toContain("Changed your mind");
    expect(allText(finalSale)).toContain("damaged, faulty, or incorrect items");
  });

  it("names the seller and governing law, and appends the owner's extra paragraphs", () => {
    const policies = parseStorePolicies(settings({ extra: { terms: "First extra.\n\nSecond extra." } }));
    const terms = buildPolicy("terms", ctx(policies));
    expect(terms.intro).toContain("Lumora is operated by Lumora Co. Ltd, 1 High St, London.");
    expect(allText(terms)).toContain("governed by the laws of the State of Delaware, USA");
    expect(terms.sections.at(-1)).toEqual({ heading: "Additional information", paragraphs: ["First extra.", "Second extra."] });
    for (const kind of POLICY_KINDS) expect(buildPolicy(kind, ctx(policies)).updatedAt).toBe("2026-11-12");
  });

  it("reads naturally when a store has no support email", () => {
    const doc = buildPolicy("privacy", { ...ctx(parseStorePolicies(settings())), supportEmail: null });
    expect(allText(doc)).toContain("by contacting us through this site");
  });
});

describe("store readiness", () => {
  it("lists everything missing before a store can take payments", () => {
    expect(storeReadinessProblems({ pageProblems: [], activeVariants: 1, usRates: 1, supportEmail: "a@b.co", policies: settings() })).toEqual([]);
    const problems = storeReadinessProblems({ pageProblems: ["Add a hero image."], activeVariants: 0, usRates: 0, supportEmail: null, policies: {} });
    expect(problems).toHaveLength(5);
    expect(problems.at(-1)).toMatch(/Complete the store policies/);
  });

  it("refuses checkout for a store without policies", async () => {
    seedPhysicalStore({ policies: {} });
    await expect(startPhysicalCheckout({ productId: "glow-lamp", variantId: "0b5e3c3e-6f4a-4f63-9a3c-1f0d3a1e2b01", quantity: 1, checkoutId: randomUUID() }))
      .rejects.toMatchObject({ status: 503 });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});
