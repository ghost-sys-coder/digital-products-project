import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakes, seedPhysicalStore, sendEmail, sessionsCreate, shippingRatesRetrieve, state } from "./fakes";
import { STORE_ID } from "../lib/store-config";
import { startPhysicalCheckout, statementSuffix } from "../lib/physical-checkout";
import { buildOrderConfirmation, senderName } from "../lib/physical-email";
import { stubDevelopment } from "./env";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: vi.fn(), delete: vi.fn() }) }));

import { POST as physicalRoute } from "../app/api/checkout/physical/route";
import { POST as digitalRoute } from "../app/api/checkout/route";
import { POST as webhookRoute } from "../app/api/stripe-webhook/route";
import { POST as resendRoute } from "../app/api/admin/orders/resend/route";

const BLACK = "0b5e3c3e-6f4a-4f63-9a3c-1f0d3a1e2b01";
const WHITE = "0b5e3c3e-6f4a-4f63-9a3c-1f0d3a1e2b02";

function request(path: string, body: unknown) {
  return new Request(`https://delivery.example.com${path}`, { method: "POST", headers: { "Content-Type": "application/json", origin: "https://delivery.example.com" }, body: JSON.stringify(body) });
}
function paidEvent(session: Record<string, unknown>) {
  return new Request("https://delivery.example.com/api/stripe-webhook", { method: "POST", headers: { "stripe-signature": "sig" }, body: JSON.stringify({ id: "evt_physical", livemode: false, type: "checkout.session.completed", data: { object: {
    payment_status: "paid", mode: "payment", currency: "usd", customer_details: { email: "buyer@example.com", name: "Ada Lovelace", phone: "+15555550100" },
    collected_information: { shipping_details: { name: "Ada Lovelace", address: { line1: "1 Main St", line2: null, city: "Austin", state: "TX", postal_code: "73301", country: "US" } } },
    ...session,
  } } }) });
}
/** Reserves a checkout, then builds the matching paid session Stripe would send back. */
async function paidSessionFor(quantity = 2, variantId = BLACK, shipping: { amount: number; rateId: string; name: string } = { amount: 995, rateId: "rate-express", name: "Express" }) {
  const checkoutId = randomUUID();
  await startPhysicalCheckout({ productId: "glow-lamp", variantId, quantity, checkoutId });
  const checkout = state.checkouts.find((row) => row.id === checkoutId)!;
  state.stripeShippingRates.set("shr_chosen", { id: "shr_chosen", display_name: shipping.name, metadata: { rate_id: shipping.rateId }, delivery_estimate: { minimum: { unit: "business_day", value: 4 }, maximum: { unit: "business_day", value: 6 } } });
  return {
    checkout,
    session: {
      id: checkout.stripe_session_id, client_reference_id: checkout.id, amount_subtotal: checkout.amount, amount_total: checkout.amount + shipping.amount,
      shipping_cost: { amount_total: shipping.amount, shipping_rate: "shr_chosen" },
      metadata: { app: "veilcode-store", kind: "physical", checkout_id: checkout.id, product_id: "glow-lamp", store_id: STORE_ID },
    },
  };
}

beforeEach(() => {
  resetFakes(); jar.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("physical checkout", () => {
  it("charges the database price, offers the store's US rates, and never trusts the browser", async () => {
    seedPhysicalStore();
    const checkoutId = randomUUID();
    const response = await physicalRoute(request("/api/checkout/physical", { productId: "glow-lamp", variantId: WHITE, quantity: 3, checkoutId, amount: 1, unit_amount: 1 }));
    expect(response.status).toBe(200);
    const [params, options] = sessionsCreate.mock.calls[0];
    expect(options).toEqual({ idempotencyKey: `checkout-${checkoutId}` });
    expect(params.line_items).toEqual([{ quantity: 3, price_data: { currency: "usd", unit_amount: 5400, product_data: {
      name: "Glow Lamp", description: "White", images: [`https://example.supabase.co/storage/v1/object/public/storefront/${STORE_ID}/glow-lamp/media/white.webp`],
      metadata: { product_id: "glow-lamp", variant_id: WHITE },
    } } }]);
    expect(params.shipping_address_collection).toEqual({ allowed_countries: ["US"] });
    expect(params.phone_number_collection).toEqual({ enabled: true });
    expect(params.shipping_options.map((option: { shipping_rate_data: { display_name: string; fixed_amount: { amount: number } } }) => [option.shipping_rate_data.display_name, option.shipping_rate_data.fixed_amount.amount]))
      .toEqual([["Free tracked shipping", 0], ["Express", 995]]);
    expect(params.payment_intent_data).toEqual({ statement_descriptor_suffix: "LUMORA CO" });
    expect(params.metadata).toEqual({ app: "veilcode-store", kind: "physical", checkout_id: checkoutId, product_id: "glow-lamp", store_id: STORE_ID });
    expect(params.success_url).toBe("https://delivery.example.com/s/glow/thank-you");
    expect(params.cancel_url).toBe("https://delivery.example.com/s/glow?checkout=cancelled");
    // Supplier details stay in the private reservation and never go to Stripe.
    expect(JSON.stringify(params)).not.toContain("supplier");
    expect(state.checkouts[0]).toMatchObject({ kind: "physical", variant_id: WHITE, quantity: 3, amount: 16200, stripe_price_id: null, product_snapshot: null });
    expect(state.checkouts[0].physical_snapshot?.items[0]).toMatchObject({ supplierUrl: "https://supplier.example/item/1", supplierSku: "SUP-White", unitAmount: 5400 });
  });

  it("reuses an open checkout for the same selection and refuses a changed one", async () => {
    seedPhysicalStore();
    const checkoutId = randomUUID();
    await startPhysicalCheckout({ productId: "glow-lamp", variantId: BLACK, quantity: 1, checkoutId });
    await startPhysicalCheckout({ productId: "glow-lamp", variantId: BLACK, quantity: 1, checkoutId });
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    await expect(startPhysicalCheckout({ productId: "glow-lamp", variantId: BLACK, quantity: 2, checkoutId })).rejects.toMatchObject({ status: 409 });
    await expect(startPhysicalCheckout({ productId: "glow-lamp", variantId: WHITE, quantity: 1, checkoutId })).rejects.toMatchObject({ status: 409 });
  });

  it("validates the request shape before touching the database", async () => {
    seedPhysicalStore();
    for (const body of [
      { productId: "glow-lamp", variantId: BLACK, quantity: 0, checkoutId: randomUUID() },
      { productId: "glow-lamp", variantId: BLACK, quantity: 11, checkoutId: randomUUID() },
      { productId: "glow-lamp", variantId: BLACK, quantity: 1.5, checkoutId: randomUUID() },
      { productId: "glow-lamp", variantId: "not-a-uuid", quantity: 1, checkoutId: randomUUID() },
      { productId: "glow-lamp", variantId: BLACK, quantity: 1, checkoutId: "abc" },
    ]) expect((await physicalRoute(request("/api/checkout/physical", body))).status).toBe(400);
    expect(state.checkouts).toHaveLength(0);
  });

  it("refuses drafts, missing variants, missing shipping, and the wrong checkout path", async () => {
    const { product, variants, rates } = seedPhysicalStore();
    variants[1].active = false;
    await expect(startPhysicalCheckout({ productId: product.id, variantId: WHITE, quantity: 1, checkoutId: randomUUID() })).rejects.toMatchObject({ status: 409 });
    rates.forEach((rate) => { rate.active = false; });
    await expect(startPhysicalCheckout({ productId: product.id, variantId: BLACK, quantity: 1, checkoutId: randomUUID() })).rejects.toMatchObject({ status: 503 });
    product.status = "draft";
    await expect(startPhysicalCheckout({ productId: product.id, variantId: BLACK, quantity: 1, checkoutId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    product.status = "published";
    // The digital checkout never sells a physical product.
    expect((await digitalRoute(request("/api/checkout", { productId: product.id, checkoutId: randomUUID() }))).status).toBe(404);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("keeps card statement suffixes short and plain", () => {
    expect(statementSuffix("Lumora Co.")).toBe("LUMORA CO");
    expect(statementSuffix("Nova <Glow> & Light Studio")).toBe("NOVA GLOW");
    expect(statementSuffix("1234")).toBeNull();
  });
});

describe("physical order fulfilment", () => {
  it("records a paid checkout as needing ordering and emails a branded confirmation once", async () => {
    seedPhysicalStore();
    const { session } = await paidSessionFor();
    expect((await webhookRoute(paidEvent(session))).status).toBe(200);
    expect(state.orders).toHaveLength(1);
    const order = state.orders[0];
    expect(order).toMatchObject({
      kind: "physical", fulfillment_status: "needs_ordering", email_status: "sent", download_token_hash: null, token_expires_at: null,
      amount_total: 10795, customer_name: "Ada Lovelace",
      shipping_address: { name: "Ada Lovelace", line1: "1 Main St", city: "Austin", state: "TX", postal_code: "73301", country: "US", phone: "+15555550100" },
    });
    expect(order.physical_snapshot?.shipping).toEqual({ name: "Express", amount: 995, minDays: 4, maxDays: 6 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [message, options] = sendEmail.mock.calls[0];
    expect(message).toMatchObject({ from: "Lumora Co. <orders@mail.veilcode.studio>", replyTo: "help@lumora.example", to: "buyer@example.com", subject: "Lumora Co.: order confirmed" });
    expect(message.text).toContain("Glow Lamp (Black): 2 × $49");
    expect(message.text).toContain("Shipping: Express · $9.95 · usually 4–6 business days");
    expect(message.text).not.toContain("supplier");
    expect(options.idempotencyKey).toBe(`order-confirmation-${session.id}`);

    // A replayed webhook neither duplicates the order nor re-sends the email.
    expect((await webhookRoute(paidEvent(session))).status).toBe(200);
    expect(state.orders).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("falls back to the charged amount when the shipping rate cannot be read", async () => {
    seedPhysicalStore();
    const { session } = await paidSessionFor(1, BLACK, { amount: 0, rateId: "rate-free", name: "Free tracked shipping" });
    shippingRatesRetrieve.mockRejectedValueOnce(new Error("Stripe unavailable"));
    expect((await webhookRoute(paidEvent(session))).status).toBe(200);
    expect(state.orders[0].physical_snapshot?.shipping).toEqual({ name: "Free tracked shipping", amount: 0, minDays: 7, maxDays: 12 });
  });

  it("keeps the order and asks Stripe to retry when a preview email is not allowed", async () => {
    stubDevelopment();
    seedPhysicalStore();
    const { session } = await paidSessionFor();
    expect((await webhookRoute(paidEvent(session))).status).toBe(500);
    expect(state.orders[0]).toMatchObject({ fulfillment_status: "needs_ordering", email_status: "pending" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("ignores sessions that do not match their reservation", async () => {
    seedPhysicalStore();
    const { session } = await paidSessionFor();
    expect((await webhookRoute(paidEvent({ ...session, amount_subtotal: 1 }))).status).toBe(200);
    expect((await webhookRoute(paidEvent({ ...session, metadata: { ...session.metadata, kind: undefined } }))).status).toBe(200);
    expect(state.orders).toHaveLength(0);
  });

  it("never offers a download resend for a shipped order", async () => {
    seedPhysicalStore();
    const { session } = await paidSessionFor();
    await webhookRoute(paidEvent(session));
    jar.set("veilcode_owner", "owner-token");
    const response = await resendRoute(request("/api/admin/orders/resend", { sessionId: session.id }));
    expect(response.status).toBe(409);
  });
});

describe("confirmation email content", () => {
  it("escapes every customer and brand value in the HTML", () => {
    const message = buildOrderConfirmation({
      id: "o1", stripe_session_id: "cs_test_abcdefgh12345678", product_id: "p", email: "a@example.com", amount_total: 4900, currency: "usd",
      download_token_hash: null, download_count: 0, max_downloads: 5, token_expires_at: null, email_status: "pending", email_sent_at: null,
      created_at: "", delivery_lock_id: null, delivery_locked_until: null, store_id: STORE_ID, product_snapshot: null, kind: "physical",
      customer_name: "<script>x</script>",
      shipping_address: { name: "<b>Ada</b>", line1: "1 <i>Main</i>", line2: null, city: "Austin", state: "TX", postal_code: "73301", country: "US", phone: null },
      physical_snapshot: { brand: { name: "Glow <Co>", supportEmail: null }, currency: "usd", shippingOptions: [], shipping: null,
        items: [{ productId: "p", variantId: "v", name: "Lamp <img>", variantLabel: "", sku: null, unitAmount: 4900, quantity: 1, imagePath: null, supplierUrl: "https://supplier.example", supplierSku: "S" }] },
    });
    expect(message.html).not.toMatch(/<script>|<b>Ada|<i>Main|<img>|<Co>/);
    expect(message.html).toContain("&lt;b&gt;Ada&lt;/b&gt;");
    expect(message.html + message.text).not.toContain("supplier");
    expect(message.text).toContain("Order reference 12345678");
    expect(senderName("Glow <Co> \"Evil\"\r\nBcc: x@y")).toBe("Glow Co EvilBcc xy");
  });
});
