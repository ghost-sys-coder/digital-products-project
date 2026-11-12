import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakes, seedOrder, seedPhysicalOrder, sendEmail, state } from "./fakes";
import { buildTrackingEmail } from "../lib/physical-email";
import { stubDevelopment } from "./env";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: vi.fn(), delete: vi.fn() }) }));

import { POST } from "../app/api/admin/fulfillment/route";

function act(body: Record<string, unknown>, origin = "https://delivery.example.com") {
  return POST(new Request("https://delivery.example.com/api/admin/fulfillment", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) }));
}
const ship = (orderId: string, expected: string, extra: Record<string, unknown> = {}) =>
  act({ orderId, expected, action: "shipped", trackingNumber: "LP 0012 3456 78CN", carrier: "Cainiao", trackingUrl: "", notify: true, ...extra });

beforeEach(() => {
  resetFakes(); jar.clear(); jar.set("veilcode_owner", "owner-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("fulfilment access", () => {
  it("requires the signed-in owner and a same-site request", async () => {
    const order = seedPhysicalOrder();
    jar.clear();
    expect((await act({ orderId: order.id, expected: "needs_ordering", action: "ordered" })).status).toBe(401);
    jar.set("veilcode_owner", "owner-token");
    expect((await act({ orderId: order.id, expected: "needs_ordering", action: "ordered" }, "https://evil.example")).status).toBe(403);
    expect(state.orders[0].fulfillment_status).toBe("needs_ordering");
  });

  it("only touches this store's physical orders", async () => {
    const digital = seedOrder();
    const response = await act({ orderId: digital.id, expected: "needs_ordering", action: "ordered" });
    expect(response.status).toBe(404);
  });
});

describe("fulfilment steps", () => {
  it("moves an order from ordered to shipped and emails a 17TRACK link once", async () => {
    const order = seedPhysicalOrder();
    expect((await act({ orderId: order.id, expected: "needs_ordering", action: "ordered", supplierRef: "AE 8123" })).status).toBe(200);
    expect(state.orders[0]).toMatchObject({ fulfillment_status: "ordered", supplier_order_ref: "AE 8123" });
    expect(state.orders[0].ordered_at).toBeTruthy();

    const response = await ship(order.id, "ordered");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "shipped", trackingEmailSent: true });
    expect(state.orders[0]).toMatchObject({ fulfillment_status: "shipped", tracking_number: "LP00123456" + "78CN", tracking_carrier: "Cainiao", tracking_url: null });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [message, options] = sendEmail.mock.calls[0];
    expect(message).toMatchObject({ from: "Lumora Co. <orders@mail.veilcode.studio>", replyTo: "help@lumora.example", subject: "Lumora Co.: your order has shipped" });
    expect(message.text).toContain("Track your order: https://t.17track.net/en#nums=LP0012345678CN");
    expect(message.text).toContain("2 × Glow Lamp (Black)");
    expect(message.text).not.toContain("supplier");
    expect(options.idempotencyKey).toBe(`tracking-${order.stripe_session_id}-LP0012345678CN`);

    // Saving the same tracking again does not email the customer twice.
    expect((await ship(order.id, "shipped")).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    // A corrected tracking number does.
    expect((await ship(order.id, "shipped", { trackingNumber: "LP999", trackingUrl: "https://carrier.example/t/LP999" })).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[1][0].text).toContain("https://carrier.example/t/LP999");
  });

  it("lets the owner skip straight to shipped and choose not to email", async () => {
    const order = seedPhysicalOrder();
    expect((await ship(order.id, "needs_ordering", { notify: false })).status).toBe(200);
    expect(state.orders[0]).toMatchObject({ fulfillment_status: "shipped", tracking_email_sent_at: null });
    expect(state.orders[0].ordered_at).toBeTruthy();
    expect(sendEmail).not.toHaveBeenCalled();
    // Resending is always an explicit, fresh send.
    expect((await act({ orderId: order.id, expected: "shipped", action: "resend_tracking" })).status).toBe(200);
    expect((await act({ orderId: order.id, expected: "shipped", action: "resend_tracking" })).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[0][1].idempotencyKey).not.toBe(sendEmail.mock.calls[1][1].idempotencyKey);
  });

  it("keeps the shipped status when the tracking email fails, so it can be resent", async () => {
    const order = seedPhysicalOrder({ fulfillment_status: "ordered" });
    sendEmail.mockResolvedValueOnce({ data: null, error: { message: "Provider down" } });
    const response = await ship(order.id, "ordered");
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/Resend tracking email/);
    expect(state.orders[0]).toMatchObject({ fulfillment_status: "shipped", tracking_email_sent_at: null });
    expect((await act({ orderId: order.id, expected: "shipped", action: "resend_tracking" })).status).toBe(200);
    expect(state.orders[0].tracking_email_sent_at).toBeTruthy();
  });

  it("refuses moves that don't fit the current status", async () => {
    const shipped = seedPhysicalOrder({ fulfillment_status: "shipped", tracking_number: "LP1" });
    const cancelled = await act({ orderId: shipped.id, expected: "shipped", action: "cancelled" });
    expect(cancelled.status).toBe(409);
    expect((await cancelled.json()).error).toMatch(/refund in Stripe/);
    const fresh = seedPhysicalOrder();
    expect((await act({ orderId: fresh.id, expected: "needs_ordering", action: "delivered" })).status).toBe(409);
    expect((await act({ orderId: fresh.id, expected: "needs_ordering", action: "resend_tracking" })).status).toBe(409);
    expect((await act({ orderId: fresh.id, expected: "needs_ordering", action: "cancelled" })).status).toBe(200);
    expect(state.orders[1].fulfillment_status).toBe("cancelled");
    expect((await act({ orderId: shipped.id, expected: "shipped", action: "delivered" })).status).toBe(200);
    expect(state.orders[0].delivered_at).toBeTruthy();
  });

  it("refuses a change based on a stale view of the order", async () => {
    const order = seedPhysicalOrder({ fulfillment_status: "ordered" });
    const response = await act({ orderId: order.id, expected: "needs_ordering", action: "ordered", supplierRef: "new" });
    expect(response.status).toBe(409);
    expect(state.orders[0].supplier_order_ref).toBeNull();
  });

  it("validates every field", async () => {
    const order = seedPhysicalOrder({ fulfillment_status: "ordered" });
    for (const extra of [
      { trackingNumber: "" }, { trackingNumber: "<script>" }, { trackingNumber: "AB" },
      { trackingUrl: "http://carrier.example/t" }, { trackingUrl: "javascript:alert(1)" }, { trackingUrl: "https://user:pw@carrier.example" },
      { carrier: "x".repeat(61) }, { carrier: "<b>UPS</b>" },
    ]) expect((await ship(order.id, "ordered", extra)).status).toBe(400);
    expect((await act({ orderId: order.id, expected: "ordered", action: "refund" })).status).toBe(400);
    expect((await act({ orderId: "not-a-uuid", expected: "ordered", action: "delivered" })).status).toBe(400);
    expect((await act({ orderId: order.id, expected: "lost", action: "delivered" })).status).toBe(400);
    expect(state.orders[0].fulfillment_status).toBe("ordered");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("blocks preview tracking emails to people outside the allowlist", async () => {
    stubDevelopment();
    const order = seedPhysicalOrder({ fulfillment_status: "ordered", email: "stranger@example.com" });
    const response = await act({ orderId: order.id, expected: "ordered", action: "shipped", trackingNumber: "LP123", notify: true }, "http://localhost:3000");
    expect(response.status).toBe(502);
    expect(state.orders[0].fulfillment_status).toBe("shipped");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("tracking email content", () => {
  it("escapes customer and brand values", () => {
    const order = seedPhysicalOrder({ customer_name: "<img src=x>", tracking_number: "LP1", tracking_carrier: "<b>UPS</b>", tracking_url: "https://carrier.example/t?a=1&b=<2>" });
    order.physical_snapshot!.brand.name = "Glow <Co>";
    const message = buildTrackingEmail(order);
    expect(message.html).not.toMatch(/<img src=x>|<b>UPS|<Co>|b=<2>/);
    expect(message.html).toContain("https://carrier.example/t?a=1&amp;b=&lt;2&gt;");
  });
});
