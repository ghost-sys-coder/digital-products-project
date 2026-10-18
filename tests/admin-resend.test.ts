import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakes, seedOrder, sendEmail, state } from "./fakes";
import { POST } from "../app/api/admin/resend/route";

function request(body: unknown = { stripe_session_id: "cs_test_purchase" }, secret: string | null = "a-long-test-admin-secret") {
  return new Request("https://delivery.example.com/api/admin/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret === null ? {} : { "x-admin-secret": secret }) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => { resetFakes(); vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("support resends", () => {
  it.each([null, "wrong", "x".repeat(100)])("rejects a missing or wrong admin secret: %s", async (secret) => {
    expect((await POST(request(undefined, secret))).status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("issues a fresh token, resets count and expiry, and sends to the corrected address", async () => {
    const order = seedOrder({ email_status: "sent", download_count: 5, token_expires_at: "2020-01-01T00:00:00Z" });
    const oldHash = order.download_token_hash;
    const before = Date.now();
    const response = await POST(request({ stripe_session_id: order.stripe_session_id, email: "corrected@example.com" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, email: "corrected@example.com" });
    expect(order).toMatchObject({ email: "corrected@example.com", download_count: 0, email_status: "sent", delivery_lock_id: null });
    expect(order.download_token_hash).not.toBe(oldHash);
    expect(Date.parse(order.token_expires_at)).toBeGreaterThanOrEqual(before + 14 * 86400_000);
    expect(sendEmail.mock.calls[0][0].to).toBe("corrected@example.com");
  });

  it("preserves the purchase address when no override is supplied", async () => {
    seedOrder({ email_status: "sent" });
    expect((await POST(request())).status).toBe(200);
    expect(sendEmail.mock.calls[0][0].to).toBe("buyer@example.com");
  });

  it("returns 404 for an unknown order", async () => {
    expect((await POST(request())).status).toBe(404);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { stripe_session_id: "bad" }, { stripe_session_id: "cs_test_purchase", email: "bad" }])("validates the request body", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    expect((await POST(new Request("https://delivery.example.com/api/admin/resend", {
      method: "POST", headers: { "x-admin-secret": "a-long-test-admin-secret" }, body: "{",
    }))).status).toBe(400);
  });

  it("keeps a failed resend pending and permits a later retry", async () => {
    seedOrder({ email_status: "sent", download_count: 5 });
    sendEmail.mockResolvedValueOnce({ data: null, error: { message: "Provider offline" } });
    expect((await POST(request())).status).toBe(500);
    expect(state.orders[0]).toMatchObject({ email_status: "pending", download_count: 0, delivery_lock_id: null });
    expect((await POST(request())).status).toBe(200);
    expect(state.orders[0].email_status).toBe("sent");
  });

  it("returns 409 while another delivery owns the order", async () => {
    const order = seedOrder({ delivery_lock_id: "active", delivery_locked_until: new Date(Date.now() + 300_000).toISOString() });
    const hash = order.download_token_hash;
    expect((await POST(request())).status).toBe(409);
    expect(order.download_token_hash).toBe(hash);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
