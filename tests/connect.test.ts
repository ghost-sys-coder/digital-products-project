import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountsRetrieve, constructEvent, oauthToken, oauthDeauthorize, OWNER_ID, pricesCreate, productsUpdate, resetFakes, seedProduct, sendEmail, sessionsCreate, sessionsRetrieve, state } from "./fakes";
import { startStripeConnection, completeStripeConnection, disconnectStripe } from "../lib/stripe-connect";
import { currentStripeConnection, paymentContext } from "../lib/payment-connections";
import { startCheckout } from "../lib/checkout";
import { STORE_ID } from "../lib/store-config";
import type { PaymentConnection } from "../lib/payment.types";
import { POST as connectedWebhook } from "../app/api/stripe-connect-webhook/route";
import { POST as platformWebhook } from "../app/api/stripe-webhook/route";
import { POST as paymentAction } from "../app/api/admin/payments/stripe/[action]/route";
import { GET as callback } from "../app/api/admin/payments/stripe/callback/route";
import { stubDevelopment } from "./env";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value) }) }));
function connection(overrides: Partial<PaymentConnection> = {}) {
  const c: PaymentConnection = { id: randomUUID(), store_id: STORE_ID, provider: "stripe", external_account_id: "acct_seller", livemode: false, is_current: true, status: "connected", charges_enabled: true, payouts_enabled: true, country: "GB", requirements: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...overrides };
  state.payment_connections.push(c); return c;
}
function event(account = "acct_seller", changes: Record<string, unknown> = {}) {
  const checkout = state.checkouts[0];
  return new Request("https://delivery.example.com/api/stripe-connect-webhook", { method: "POST", headers: { "stripe-signature": "sig_connected" }, body: JSON.stringify({
    id: "evt_connected", type: "checkout.session.completed", livemode: false, account,
    data: { object: { id: checkout?.stripe_session_id, mode: "payment", payment_status: "paid", client_reference_id: checkout?.id,
      currency: checkout?.currency, amount_subtotal: checkout?.amount, amount_total: checkout?.amount,
      customer_details: { email: "buyer@example.com" }, metadata: { app: "veilcode-store", checkout_id: checkout?.id, store_id: checkout?.store_id, product_id: checkout?.product_id } } }, ...changes,
  }) });
}
beforeEach(() => {
  resetFakes(); jar.clear(); vi.stubEnv("STRIPE_CONNECT_ENABLED", "true");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("Stripe connection authorization", () => {
  it("does not allow linking before its connected-account webhook is configured", async () => {
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");
    await expect(startStripeConnection(OWNER_ID)).rejects.toThrow("setup is incomplete");
    expect(state.payment_oauth_attempts).toHaveLength(0);
  });
  it("starts read-write authorization bound to the owner, store, browser, and mode", async () => {
    const started = await startStripeConnection(OWNER_ID);
    const url = new URL(started.url);
    expect(url.origin).toBe("https://connect.stripe.com");
    expect(url.searchParams.get("scope")).toBe("read_write");
    expect(url.searchParams.get("redirect_uri")).toBe("https://delivery.example.com/api/admin/payments/stripe/callback");
    expect(state.payment_oauth_attempts[0]).toMatchObject({ store_id: STORE_ID, owner_user_id: OWNER_ID, livemode: false, consumed_at: null });
    expect(state.payment_oauth_attempts[0].state_hash).not.toContain(started.state);
    expect(oauthToken).not.toHaveBeenCalled();
  });
  it("rejects cross-origin, anonymous, and non-owner connection actions", async () => {
    const req = (origin: string) => new Request("https://delivery.example.com/api/admin/payments/stripe/start", { method: "POST", headers: { origin } });
    const params = { params: Promise.resolve({ action: "start" }) };
    expect((await paymentAction(req("https://evil.example"), params)).status).toBe(403);
    expect((await paymentAction(req("https://delivery.example.com"), params)).status).toBe(401);
    await expect(startStripeConnection(randomUUID())).rejects.toThrow("cannot manage");
    expect(state.payment_oauth_attempts).toHaveLength(0);
  });
  it("consumes authorization state once, even for concurrent callbacks", async () => {
    const { state: nonce } = await startStripeConnection(OWNER_ID);
    const params = new URLSearchParams({ state: nonce, code: "ac_authorized" });
    const results = await Promise.allSettled([completeStripeConnection(OWNER_ID, params, nonce), completeStripeConnection(OWNER_ID, params, nonce)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(oauthToken).toHaveBeenCalledTimes(1);
    expect(oauthToken).toHaveBeenCalledWith({ grant_type: "authorization_code", code: "ac_authorized" }, { maxNetworkRetries: 0 });
    expect((await currentStripeConnection())?.external_account_id).toBe("acct_seller");
    expect(JSON.stringify(state.payment_connections)).not.toContain("access_token");
  });
  it("rejects missing browser state, expired state, and mismatched payment modes", async () => {
    const { state: nonce } = await startStripeConnection(OWNER_ID);
    const params = new URLSearchParams({ state: nonce, code: "ac_authorized" });
    await expect(completeStripeConnection(OWNER_ID, params, "x".repeat(43))).rejects.toThrow("expired");
    state.payment_oauth_attempts[0].expires_at = new Date(Date.now() - 1000).toISOString();
    await expect(completeStripeConnection(OWNER_ID, params, nonce)).rejects.toThrow("expired");
    expect(oauthToken).not.toHaveBeenCalled();
    const next = await startStripeConnection(OWNER_ID);
    oauthToken.mockResolvedValueOnce({ stripe_user_id: "acct_live", scope: "read_write", livemode: true });
    await expect(completeStripeConnection(OWNER_ID, new URLSearchParams({ state: next.state, code: "ac_wrongmode" }), next.state)).rejects.toThrow("incompatible");
    expect(state.payment_connections).toHaveLength(0);
  });
  it("cancels without changing payment routing and sanitizes callback errors", async () => {
    const { state: nonce } = await startStripeConnection(OWNER_ID);
    expect(await completeStripeConnection(OWNER_ID, new URLSearchParams({ state: nonce, error: "access_denied" }), nonce)).toBe("cancelled");
    expect(oauthToken).not.toHaveBeenCalled();
    jar.set("veilcode_owner", "owner-token");
    const response = await callback(new Request("https://delivery.example.com/api/admin/payments/stripe/callback?code=private-code&state=invalid"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://delivery.example.com/admin/settings?payment=failed");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("retains earlier account records when linking a different account", async () => {
    const old = connection({ external_account_id: "acct_previous" });
    const { state: nonce } = await startStripeConnection(OWNER_ID);
    await completeStripeConnection(OWNER_ID, new URLSearchParams({ state: nonce, code: "ac_authorized" }), nonce);
    expect(state.payment_connections).toHaveLength(2);
    expect(old.is_current).toBe(false);
    expect((await currentStripeConnection())?.external_account_id).toBe("acct_seller");
  });
  it("does not link accounts with incompatible dashboard or responsibility settings", async () => {
    const { state: nonce } = await startStripeConnection(OWNER_ID);
    accountsRetrieve.mockResolvedValueOnce({ id: "acct_seller", type: "express", charges_enabled: true, payouts_enabled: true });
    await expect(completeStripeConnection(OWNER_ID, new URLSearchParams({ state: nonce, code: "ac_authorized" }), nonce)).rejects.toThrow("independent Stripe account");
    expect(state.payment_connections).toHaveLength(0);
  });
});

describe("connected-account checkout and delivery", () => {
  it("creates account-scoped products and prices, then fulfills duplicate paid events once", async () => {
    const c = connection(); const product = seedProduct();
    await startCheckout(product.id, randomUUID());
    expect(pricesCreate).toHaveBeenCalledWith(expect.objectContaining({ unit_amount: product.price_amount }), expect.objectContaining({ stripeAccount: c.external_account_id }));
    expect(productsUpdate).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ name: product.name }), { stripeAccount: c.external_account_id });
    expect(sessionsCreate).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ stripeAccount: c.external_account_id }));
    expect(state.checkouts[0].payment_connection_id).toBe(c.id);
    expect(state.product_payment_refs[0].connection_id).toBe(c.id);
    expect(product.stripe_price_id).toBe("price_seed");
    expect((await connectedWebhook(event())).status).toBe(200);
    expect((await connectedWebhook(event())).status).toBe(200);
    expect(state.orders[0]).toMatchObject({ store_id: STORE_ID, payment_connection_id: c.id, email_status: "sent" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(constructEvent).toHaveBeenCalledWith(expect.any(String), "sig_connected", "whsec_connected");
  });
  it("never fulfills a paid event from a different account, mode, or endpoint scope", async () => {
    connection(); const product = seedProduct(); await startCheckout(product.id, randomUUID());
    connection({ external_account_id: "acct_other", is_current: false });
    await connectedWebhook(event("acct_other"));
    await connectedWebhook(event("acct_seller", { livemode: true }));
    await platformWebhook(event());
    expect(sendEmail).not.toHaveBeenCalled(); expect(state.orders).toHaveLength(0);
  });
  it("does not let localhost delivery claim a checkout reserved on the public origin", async () => {
    connection(); const product = seedProduct(); await startCheckout(product.id, randomUUID());
    stubDevelopment();
    expect((await connectedWebhook(event())).status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("pauses checkout after disconnection without falling back, even if linking is disabled", async () => {
    connection();
    await disconnectStripe(OWNER_ID);
    expect(oauthDeauthorize).toHaveBeenCalledWith({ client_id: "ca_testApplication", stripe_user_id: "acct_seller" }, { maxNetworkRetries: 0 });
    vi.stubEnv("STRIPE_CONNECT_ENABLED", "false");
    await expect(paymentContext()).rejects.toThrow("finish its Stripe");
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
  it("checks current Stripe readiness and fails closed on provider outages", async () => {
    connection(); const product = seedProduct();
    accountsRetrieve.mockResolvedValueOnce({ id: "acct_seller", charges_enabled: true, payouts_enabled: false, capabilities: { card_payments: "active" }, requirements: { currently_due: ["external_account"] } });
    await expect(startCheckout(product.id, randomUUID())).rejects.toThrow("finish its Stripe");
    accountsRetrieve.mockRejectedValueOnce(new Error("network outage"));
    await expect(startCheckout(product.id, randomUUID())).rejects.toThrow("verification is temporarily unavailable");
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
  it("does not reuse a checkout after the selected account changes", async () => {
    const old = connection(); const product = seedProduct(); const id = randomUUID();
    await startCheckout(product.id, id);
    old.is_current = false; connection({ external_account_id: "acct_new" });
    await expect(startCheckout(product.id, id)).rejects.toThrow("payment account changed");
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });
  it("retrieves an existing session in the same connected-account scope", async () => {
    const c = connection(); const product = seedProduct(); const id = randomUUID();
    await startCheckout(product.id, id); await startCheckout(product.id, id);
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    expect(sessionsRetrieve).toHaveBeenCalledWith(state.checkouts[0].stripe_session_id, {}, { stripeAccount: c.external_account_id });
  });
  it("rejects modified totals and unknown connected accounts before delivery", async () => {
    connection(); const product = seedProduct(); await startCheckout(product.id, randomUUID());
    const request = event(); const body = await request.json(); body.data.object.amount_subtotal = 1;
    const altered = new Request(request.url, { method: "POST", headers: { "stripe-signature": "sig_connected" }, body: JSON.stringify(body) });
    await connectedWebhook(altered); await connectedWebhook(event("acct_unknown"));
    expect(sendEmail).not.toHaveBeenCalled(); expect(state.orders).toHaveLength(0);
  });
  it("fulfills already-paid historical purchases after disconnection and handles deauthorization", async () => {
    const c = connection(); const product = seedProduct(); await startCheckout(product.id, randomUUID());
    expect((await connectedWebhook(event("acct_seller", { type: "account.application.deauthorized" }))).status).toBe(200);
    expect(c.status).toBe("disconnected");
    expect((await connectedWebhook(event())).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it("ignores a revocation created before the account was reauthorized", async () => {
    const c = connection();
    await connectedWebhook(event("acct_seller", { type: "account.application.deauthorized", created: Math.floor(Date.now() / 1000) - 60 }));
    expect(c.status).toBe("connected");
  });
  it("does not allow the same Stripe account to be attached to another store", async () => {
    connection({ store_id: randomUUID() });
    const { state: nonce } = await startStripeConnection(OWNER_ID);
    await expect(completeStripeConnection(OWNER_ID, new URLSearchParams({ state: nonce, code: "ac_authorized" }), nonce)).rejects.toThrow("another store");
    expect(state.payment_connections).toHaveLength(1);
  });
});
