import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { refundsCreate, resetFakes, seedPhysicalOrder, seedPhysicalStore, sendEmail, sessionsCreate, state } from "./fakes";
import { addBusinessDays, isOverdue, isoDate, originalShipBy, promisedShipBy } from "../lib/order-dates";
import { startPhysicalCheckout } from "../lib/physical-checkout";
import type { Order } from "../lib/database.types";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: vi.fn(), delete: vi.fn() }) }));

import { POST as fulfil } from "../app/api/admin/fulfillment/route";
import { POST as customerCancel } from "../app/api/orders/cancel/route";

const ORIGIN = "https://delivery.example.com";
const post = (handler: (req: Request) => Promise<Response>, path: string, body: Record<string, unknown>, origin = ORIGIN) =>
  handler(new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) }));
const owner = (body: Record<string, unknown>) => post(fulfil, "/api/admin/fulfillment", body);
const customer = (body: Record<string, unknown>, origin?: string) => post(customerCancel, "/api/orders/cancel", body, origin);
const inDays = (days: number) => isoDate(addBusinessDays(new Date(), days));

function paidOrder(overrides: Partial<Order> = {}) {
  const order = seedPhysicalOrder(overrides);
  state.sessions.set(order.stripe_session_id, { id: order.stripe_session_id, payment_intent: "pi_test_1", status: "complete" });
  return order;
}
async function delay(order: Order, shipBy = inDays(8), reason = "Our supplier is restocking.") {
  return owner({ orderId: order.id, expected: order.fulfillment_status, action: "delay_notice", shipBy, reason });
}
function tokenFromLastEmail() {
  const text = sendEmail.mock.calls.at(-1)![0].text as string;
  return /\/s\/glow\/cancel#([A-Za-z0-9_-]+)/.exec(text)![1];
}

beforeEach(() => {
  resetFakes(); jar.clear(); jar.set("veilcode_owner", "owner-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  seedPhysicalStore();
});

describe("ship-by dates", () => {
  it("counts business days and follows the newest delay notice", () => {
    expect(isoDate(addBusinessDays(new Date("2026-11-13T15:00:00Z"), 1))).toBe("2026-11-16"); // Friday → Monday
    expect(isoDate(addBusinessDays(new Date("2026-11-12T08:00:00Z"), 3))).toBe("2026-11-17");
    const order = { created_at: "2026-11-12T08:00:00Z", physical_snapshot: { processingDays: { min: 1, max: 5 } } } as unknown as Order;
    expect(originalShipBy(order)).toBe("2026-11-19");
    expect(originalShipBy({ ...order, physical_snapshot: { ...order.physical_snapshot!, processingDays: undefined } })).toBe("2026-11-17");
    expect(promisedShipBy({ ...order, delay_notices: [{ sentAt: "", shipBy: "2026-11-25", reason: "" }, { sentAt: "", shipBy: "2026-12-02", reason: "" }] })).toBe("2026-12-02");
    expect(isOverdue({ ...order, fulfillment_status: "ordered" }, new Date("2026-11-20T09:00:00Z"))).toBe(true);
    expect(isOverdue({ ...order, fulfillment_status: "shipped" }, new Date("2026-11-20T09:00:00Z"))).toBe(false);
  });

  it("saves the promised processing time with each checkout", async () => {
    await startPhysicalCheckout({ productId: "glow-lamp", variantId: "0b5e3c3e-6f4a-4f63-9a3c-1f0d3a1e2b01", quantity: 1, checkoutId: randomUUID() });
    expect(sessionsCreate).toHaveBeenCalled();
    expect(state.checkouts[0].physical_snapshot!.processingDays).toEqual({ min: 1, max: 3 });
  });
});

describe("delay notices", () => {
  it("emails a new date with a private cancel link, and records the notice", async () => {
    const order = paidOrder();
    const shipBy = inDays(8);
    const response = await delay(order, shipBy);
    expect(response.status).toBe(200);
    const email = sendEmail.mock.calls[0][0];
    expect(email).toMatchObject({ to: "buyer@example.com", subject: "Lumora Co.: an update on your order", replyTo: "help@lumora.example" });
    expect(email.text).toContain("Our supplier is restocking.");
    expect(email.text).toContain("there's nothing you need to do");
    expect(email.text).toContain("full refund of $107.95");
    const token = tokenFromLastEmail();
    const saved = state.orders.find((entry) => entry.id === order.id)!;
    expect(saved.delay_notices).toEqual([{ sentAt: expect.any(String), shipBy, reason: "Our supplier is restocking." }]);
    expect(saved.cancel_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(saved)).not.toContain(token);
    expect(promisedShipBy(saved)).toBe(shipBy);
  });

  it("asks the customer to agree to a second delay", async () => {
    const order = paidOrder();
    await delay(order, inDays(8));
    const second = await delay(state.orders.find((entry) => entry.id === order.id)!, inDays(12), "");
    expect(second.status).toBe(200);
    expect(sendEmail.mock.calls[1][0].text).toContain("please reply to this email to let us know");
    expect(state.orders.find((entry) => entry.id === order.id)!.delay_notices).toHaveLength(2);
  });

  it("refuses dates that aren't later, and orders that have shipped", async () => {
    const order = paidOrder();
    expect((await delay(order, inDays(1))).status).toBe(400);
    expect((await delay(order, "next week")).status).toBe(400);
    const shipped = paidOrder({ fulfillment_status: "shipped", tracking_number: "LP00123456789CN" });
    expect((await delay(shipped)).status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("records nothing when the email can't be sent", async () => {
    const order = paidOrder();
    sendEmail.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    expect((await delay(order)).status).toBe(502);
    expect(state.orders.find((entry) => entry.id === order.id)!.delay_notices ?? []).toHaveLength(0);
  });
});

describe("customer cancellation", () => {
  it("shows the order, then cancels and refunds it in full", async () => {
    const order = paidOrder({ supplier_order_ref: "AE-8123" , fulfillment_status: "ordered" });
    await delay(order);
    const token = tokenFromLastEmail();

    const preview = await customer({ token, action: "preview" });
    expect(await preview.json()).toMatchObject({ reference: order.stripe_session_id.slice(-8).toUpperCase(), brand: "Lumora Co.", cancellable: true, total: 10795 });

    const cancelled = await customer({ token, action: "cancel" });
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({ status: "cancelled", refunded: 10795 });
    expect(refundsCreate).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_test_1" }), expect.objectContaining({ idempotencyKey: `refund-order-${order.id}` }));
    expect(state.orders.find((entry) => entry.id === order.id)).toMatchObject({ fulfillment_status: "cancelled", cancelled_by: "customer", refund_id: "re_test_1", refunded_amount: 10795, cancel_token_hash: null });

    const emails = sendEmail.mock.calls.slice(1).map(([message]) => message);
    expect(emails[0]).toMatchObject({ to: "buyer@example.com", subject: "Lumora Co.: your order is cancelled" });
    expect(emails[1]).toMatchObject({ to: "support@veilcode.studio", subject: expect.stringContaining("cancelled by the customer") });
    expect(emails[1].text).toContain("AE-8123");

    // The link is spent.
    expect((await customer({ token, action: "cancel" })).status).toBe(404);
    expect(refundsCreate).toHaveBeenCalledTimes(1);
  });

  it("won't cancel once the order has shipped", async () => {
    const order = paidOrder();
    await delay(order);
    const token = tokenFromLastEmail();
    state.orders.find((entry) => entry.id === order.id)!.fulfillment_status = "shipped";
    const response = await customer({ token, action: "cancel" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/already shipped/);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("leaves the order alone if the refund fails", async () => {
    const order = paidOrder();
    await delay(order);
    const token = tokenFromLastEmail();
    refundsCreate.mockRejectedValueOnce(Object.assign(new Error("card_declined"), { code: "balance_insufficient" }));
    const response = await customer({ token, action: "cancel" });
    expect(response.status).toBe(502);
    expect(state.orders.find((entry) => entry.id === order.id)!.fulfillment_status).toBe("needs_ordering");
  });

  it("only answers its own site and real links", async () => {
    expect((await customer({ token: "x".repeat(43), action: "preview" })).status).toBe(404);
    expect((await customer({ token: "short", action: "preview" })).status).toBe(404);
    expect((await customer({ token: "x".repeat(43), action: "preview" }, "https://evil.example")).status).toBe(403);
  });
});

describe("owner cancellation", () => {
  it("can refund as it cancels, or leave the refund to Stripe", async () => {
    const refunded = paidOrder();
    const first = await owner({ orderId: refunded.id, expected: "needs_ordering", action: "cancelled", refund: true });
    expect(first.status).toBe(200);
    expect(state.orders.find((entry) => entry.id === refunded.id)).toMatchObject({ fulfillment_status: "cancelled", cancelled_by: "owner", refunded_amount: 10795 });
    expect(sendEmail.mock.calls[0][0].subject).toBe("Lumora Co.: your order is cancelled");

    const kept = paidOrder();
    await owner({ orderId: kept.id, expected: "needs_ordering", action: "cancelled" });
    const keptRow = state.orders.find((entry) => entry.id === kept.id)!;
    expect(keptRow.fulfillment_status).toBe("cancelled");
    expect(keptRow.refunded_amount ?? null).toBeNull();
    expect(refundsCreate).toHaveBeenCalledTimes(1);
  });

  it("treats a payment already refunded in Stripe as refunded", async () => {
    const order = paidOrder();
    refundsCreate.mockRejectedValueOnce(Object.assign(new Error("already"), { code: "charge_already_refunded" }));
    expect((await owner({ orderId: order.id, expected: "needs_ordering", action: "cancelled", refund: true })).status).toBe(200);
    expect(state.orders.find((entry) => entry.id === order.id)).toMatchObject({ fulfillment_status: "cancelled", refund_id: null, refunded_amount: 10795 });
  });
});
