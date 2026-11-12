import { beforeEach, describe, expect, it, vi } from "vitest";
import { constructEvent, resetFakes, seedOrder, sendEmail, state, storageExists } from "./fakes";
import { hashToken } from "../lib/tokens";

import { POST } from "../app/api/stripe-webhook/route";

function request(session = {}, type = "checkout.session.completed") {
  return new Request("https://delivery.example.com/api/stripe-webhook", {
    method: "POST", headers: { "stripe-signature": "sig_test" },
    body: JSON.stringify({ id: "evt_test", type, data: { object: {
      id: "cs_test_purchase", payment_status: "paid", payment_link: "plink_l2k",
      customer_details: { email: "buyer@example.com" }, amount_total: 2900, currency: "usd", ...session,
    } } }),
  });
}

beforeEach(() => { resetFakes(); vi.spyOn(console, "error").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });

describe("Stripe fulfillment", () => {
  it("verifies the unchanged raw body and rejects an invalid signature", async () => {
    constructEvent.mockImplementationOnce(() => { throw new Error("bad signature"); });
    const req = request();
    const raw = await req.clone().text();
    expect((await POST(req)).status).toBe(400);
    expect(constructEvent).toHaveBeenCalledWith(raw, "sig_test", "whsec_example");
    expect(state.orders).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects a missing signature", async () => {
    expect((await POST(new Request("https://delivery.example.com/api/stripe-webhook", { method: "POST" }))).status).toBe(400);
  });

  it("ignores unrelated events and unpaid sessions", async () => {
    expect((await POST(request({}, "payment_intent.succeeded"))).status).toBe(200);
    expect((await POST(request({ payment_status: "unpaid" }))).status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.orders).toHaveLength(0);
  });

  it("inserts a paid order, sends both email formats, and marks it sent", async () => {
    const before = Date.now();
    expect((await POST(request())).status).toBe(200);
    expect(state.orders).toHaveLength(1);
    const order = state.orders[0];
    expect(order).toMatchObject({ email_status: "sent", amount_total: 2900, currency: "usd", max_downloads: 5, delivery_lock_id: null });
    expect(order.email_sent_at).toBeTruthy();
    expect(Date.parse(order.token_expires_at!)).toBeGreaterThanOrEqual(before + 14 * 86400_000);
    const [email, options] = sendEmail.mock.calls[0];
    expect(email).toMatchObject({ from: "VeilCode Studio <orders@mail.veilcode.studio>", replyTo: "support@veilcode.studio", to: "buyer@example.com", subject: "Your Lead to Kickoff kit is ready" });
    expect(email.html).toContain("00 Start Here");
    expect(email.text).toContain("File > Make a copy");
    const token = new URL(email.text.match(/https:\/\/delivery\.example\.com\/api\/download\?token=\S+/)[0]).searchParams.get("token")!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(order.download_token_hash).toBe(hashToken(token));
    expect(JSON.stringify(order)).not.toContain(token);
    expect(options.idempotencyKey).toBe(`delivery-cs_test_purchase-${order.download_token_hash!.slice(0, 16)}`);
  });

  it("does not send twice when the event is replayed", async () => {
    await POST(request());
    const hash = state.orders[0].download_token_hash;
    expect((await POST(request())).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(state.orders[0].download_token_hash).toBe(hash);
  });
  it("records a paid order but waits to email until its purchased file is restored", async () => {
    storageExists.mockResolvedValueOnce({ data: false, error: { status: 400, message: "Object not found" } });
    expect((await POST(request())).status).toBe(500);
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0]).toMatchObject({ email_status: "pending", email_sent_at: null, delivery_lock_id: null });
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await POST(request())).status).toBe(200);
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0].email_status).toBe("sent");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("leaves a failed send pending and retries with a new token", async () => {
    sendEmail.mockResolvedValueOnce({ data: null, error: { message: "Invalid key" } });
    expect((await POST(request())).status).toBe(500);
    const oldHash = state.orders[0].download_token_hash;
    const firstKey = sendEmail.mock.calls[0][1].idempotencyKey;
    expect(state.orders[0]).toMatchObject({ email_status: "pending", email_sent_at: null, delivery_lock_id: null });
    expect((await POST(request())).status).toBe(200);
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0].email_status).toBe("sent");
    expect(state.orders[0].download_token_hash).not.toBe(oldHash);
    expect(sendEmail.mock.calls[1][1].idempotencyKey).not.toBe(firstKey);
  });

  it("returns 500 for a thrown provider error or a database failure", async () => {
    sendEmail.mockRejectedValueOnce(new Error("network error"));
    expect((await POST(request())).status).toBe(500);
    expect(state.orders[0].email_status).toBe("pending");
    state.dbError = true;
    expect((await POST(request())).status).toBe(500);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown payment links and missing emails", async () => {
    expect((await POST(request({ payment_link: "plink_unknown" }))).status).toBe(200);
    expect((await POST(request({ customer_details: { email: null } }))).status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.orders).toHaveLength(0);
  });

  it("fulfills async success once after an unpaid completion", async () => {
    await POST(request({ payment_status: "unpaid" }));
    expect((await POST(request({}, "checkout.session.async_payment_succeeded"))).status).toBe(200);
    await POST(request());
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent deliveries without rotating the active token", async () => {
    let finish!: (value: unknown) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    sendEmail.mockImplementationOnce(() => { entered(); return new Promise((resolve) => { finish = resolve; }); });
    const first = POST(request());
    await started;
    const hash = state.orders[0].download_token_hash;
    expect((await POST(request({}, "checkout.session.async_payment_succeeded"))).status).toBe(500);
    expect(state.orders[0].download_token_hash).toBe(hash);
    finish({ data: { id: "email_1" }, error: null });
    expect((await first).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("recovers an expired delivery lease", async () => {
    seedOrder({ delivery_lock_id: "old-lock", delivery_locked_until: new Date(Date.now() - 1000).toISOString() });
    expect((await POST(request())).status).toBe(200);
    expect(state.orders[0].email_status).toBe("sent");
  });

  it("does not acknowledge delivery if the sent-state update fails", async () => {
    state.markSentError = true;
    expect((await POST(request())).status).toBe(500);
    expect(state.orders[0].email_status).toBe("pending");
  });

  it("does not treat unrelated insert failures as replays", async () => {
    state.insertError = { code: "23514", message: "Check violation" };
    expect((await POST(request())).status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
