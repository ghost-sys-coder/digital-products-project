import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakes, seedProduct, seedOrder, state, OWNER_ID, signIn, getUser, productsCreate, productsUpdate, pricesCreate, pricesRetrieve, sessionsCreate, sendEmail, upload, storageDownload, storageExists, signUrl } from "./fakes";
import { STORE_ID } from "../lib/store-config";
import { saveProduct } from "../lib/manage-products";
import { parseProductInput } from "../lib/product-input";
import { startCheckout } from "../lib/checkout";
import { snapshotProduct } from "../lib/catalog";
import { csvCell } from "../lib/csv";
import { issueToken } from "../lib/tokens";
import { CHECKOUT_COVER_TTL } from "../lib/stripe-product-details";

const jar = vi.hoisted(() => new Map<string, string>());
const setCookie = vi.hoisted(() => vi.fn((name: string, value: string) => { jar.set(name, value); }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: setCookie, delete: (name: string) => jar.delete(name) }) }));

import { POST as checkoutRoute } from "../app/api/checkout/route";
import { POST as loginRoute } from "../app/api/admin/login/route";
import { POST as productsRoute } from "../app/api/admin/products/route";
import { POST as settingsRoute } from "../app/api/admin/settings/route";
import { POST as ownerResend } from "../app/api/admin/orders/resend/route";
import { GET as exportRoute } from "../app/api/admin/orders/export/route";
import { GET as coverRoute } from "../app/api/products/[id]/cover/route";
import { POST as webhookRoute } from "../app/api/stripe-webhook/route";
import { GET as downloadRoute } from "../app/api/download/route";
import { stubDevelopment } from "./env";

function request(path: string, body: unknown, origin = "https://delivery.example.com") {
  return new Request(`https://delivery.example.com${path}`, { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });
}
function productForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ id: randomUUID(), revision: "0", name: "A useful kit", slug: "useful-kit", tagline: "A clear starting point", description: "Resources for your next project.", includes: "Guide\nTemplates", price: "29.50", currency: "usd", status: "draft", sort_order: "0", templates_url: "", ...overrides })) form.set(key, value);
  return form;
}
function signedEvent(session: Record<string, unknown>) {
  return new Request("https://delivery.example.com/api/stripe-webhook", { method: "POST", headers: { "stripe-signature": "sig" }, body: JSON.stringify({ id: "evt_app", livemode: false, type: "checkout.session.completed", data: { object: { payment_status: "paid", currency: "usd", amount_subtotal: 2900, amount_total: 2900, customer_details: { email: "buyer@example.com" }, ...session } } }) });
}
beforeEach(() => {
  resetFakes(); jar.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("owner authentication and access", () => {
  it("sets a secure HTTP-only session cookie for the allowed owner", async () => {
    const response = await loginRoute(request("/api/admin/login", { email: "owner@example.com", password: "secret" }));
    expect(response.status).toBe(200);
    expect(setCookie).toHaveBeenCalledWith("veilcode_owner", "owner-token", expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", maxAge: 3600 }));
  });
  it("rejects valid Supabase users who are not the configured owner", async () => {
    signIn.mockResolvedValueOnce({ data: { user: { id: randomUUID() }, session: { access_token: "other", expires_in: 3600 } }, error: null });
    expect((await loginRoute(request("/api/admin/login", { email: "other@example.com", password: "secret" }))).status).toBe(401);
    expect(jar.size).toBe(0);
  });
  it("rejects bad credentials and malformed login payloads", async () => {
    signIn.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: "Invalid password" } });
    expect((await loginRoute(request("/api/admin/login", { email: "owner@example.com", password: "bad" }))).status).toBe(401);
    expect((await loginRoute(request("/api/admin/login", null))).status).toBe(400);
  });
  it("rejects cross-site mutations before authenticating", async () => {
    expect((await loginRoute(request("/api/admin/login", {}, "https://evil.example"))).status).toBe(403);
    expect(signIn).not.toHaveBeenCalled();
    expect((await productsRoute(request("/api/admin/products", {}, "https://evil.example"))).status).toBe(403);
  });
  it("protects product writes and order exports without a session", async () => {
    expect((await productsRoute(request("/api/admin/products", {}))).status).toBe(401);
    expect((await exportRoute()).status).toBe(401);
    expect(productsCreate).not.toHaveBeenCalled();
  });
  it("revalidates the owner identity on each request", async () => {
    jar.set("veilcode_owner", "owner-token");
    getUser.mockResolvedValueOnce({ data: { user: { id: randomUUID() } }, error: null });
    expect((await exportRoute()).status).toBe(401);
    expect(getUser).toHaveBeenCalledWith("owner-token");
  });
});

describe("application-managed catalog", () => {
  it("creates a Stripe Product and Price without a Payment Link", async () => {
    const saved = await saveProduct(productForm());
    expect(saved.price_amount).toBe(2950);
    expect(saved.status).toBe("draft");
    expect(saved.stripe_price_id).toMatch(/^price_/);
    expect(productsCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "A useful kit", metadata: expect.objectContaining({ store_id: STORE_ID }) }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
    expect(pricesCreate).toHaveBeenCalledWith(expect.objectContaining({ unit_amount: 2950, currency: "usd" }), expect.any(Object));
  });
  it("creates a new immutable price when the amount changes", async () => {
    const product = seedProduct();
    const saved = await saveProduct(productForm({ id: product.id, revision: "1", price: "39.00" }));
    expect(saved.stripe_price_id).not.toBe("price_seed");
    expect(state.stripePrices.get("price_seed")?.unit_amount).toBe(2900);
    expect(saved.price_amount).toBe(3900);
  });
  it("reuses the existing price when editing copy only", async () => {
    const product = seedProduct();
    const saved = await saveProduct(productForm({ id: product.id, revision: "1", price: "29.00", name: "A better name" }));
    expect(saved.stripe_price_id).toBe("price_seed");
    expect(pricesCreate).not.toHaveBeenCalled();
  });
  it("uploads a PDF into a store-scoped private path and publishes", async () => {
    const form = productForm({ status: "published" });
    form.set("download", new File(["%PDF-1.7 test"], "Useful Kit.pdf", { type: "application/pdf" }));
    const saved = await saveProduct(form);
    expect(saved.status).toBe("published");
    expect(saved.storage_path).toContain(`${STORE_ID}/${saved.id}/downloads/`);
    expect(saved.download_filename).toBe("Useful-Kit.pdf");
    expect(upload).toHaveBeenCalledWith(expect.stringContaining("/downloads/"), expect.any(Uint8Array), { contentType: "application/pdf", upsert: false });
  });
  it("keeps an incomplete product as a draft", async () => {
    await expect(saveProduct(productForm({ status: "published" }))).rejects.toMatchObject({ status: 400 });
    expect(state.products[0].status).toBe("draft");
    expect(productsCreate).not.toHaveBeenCalled();
  });
  it("does not publish a seeded file path whose object is absent from Storage", async () => {
    const product = seedProduct({ status: "draft" });
    storageExists.mockResolvedValueOnce({ data: false, error: { status: 400, message: "Object not found" } });
    await expect(saveProduct(productForm({ id: product.id, revision: String(product.revision), status: "published" }))).rejects.toMatchObject({ status: 503, message: expect.stringContaining("Upload the actual PDF or ZIP") });
    expect(product.status).toBe("draft");
    expect(productsUpdate).not.toHaveBeenCalled();
  });
  it("syncs the edited description and newly uploaded cover to Stripe on save", async () => {
    const oldCover = `${STORE_ID}/covers/old.png`;
    const product = seedProduct({ cover_path: oldCover });
    const form = productForm({ id: product.id, revision: String(product.revision), name: "Updated kit", description: "The complete eight-stage onboarding system.", price: "29.00" });
    form.set("cover", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "new-cover.png", { type: "image/png" }));
    const saved = await saveProduct(form);
    expect(saved.cover_path).not.toBe(oldCover);
    expect(signUrl).toHaveBeenCalledWith(saved.cover_path, CHECKOUT_COVER_TTL);
    expect(productsUpdate).toHaveBeenCalledWith(product.stripe_product_id, {
      name: "Updated kit", description: "The complete eight-stage onboarding system.",
      images: ["https://example.supabase.co/private-file?signature=example"], default_price: product.stripe_price_id,
    });
    expect(pricesCreate).not.toHaveBeenCalled();
  });
  it("rejects stale edits before changing Stripe", async () => {
    const product = seedProduct({ revision: 3 });
    await expect(saveProduct(productForm({ id: product.id, revision: "2" }))).rejects.toMatchObject({ status: 409 });
    expect(productsCreate).not.toHaveBeenCalled();
    expect(pricesCreate).not.toHaveBeenCalled();
  });
  it("validates resource URLs, money, and slugs", async () => {
    const invalid: Record<string, string>[] = [{ price: "-1" }, { price: "3.123" }, { price: "0.00" }, { slug: "../bad" }, { currency: "xxx" }];
    for (const overrides of invalid) expect(() => parseProductInput(productForm(overrides))).toThrow();
    await expect(saveProduct(productForm({ templates_url: "javascript:alert(1)" }))).rejects.toMatchObject({ status: 400 });
  });
  it("checks file contents rather than trusting the extension", async () => {
    const form = productForm(); form.set("download", new File(["<script>bad</script>"], "safe.pdf", { type: "application/pdf" }));
    await expect(saveProduct(form)).rejects.toMatchObject({ status: 400 });
    expect(upload).not.toHaveBeenCalled();
  });
  it("keeps foreign-store products out of the catalog", async () => {
    const product = seedProduct({ store_id: randomUUID() });
    await expect(startCheckout(product.id, randomUUID())).rejects.toMatchObject({ status: 404 });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

describe("per-purchase Stripe checkout and delivery", () => {
  it("stops checkout before creating a payment when the download does not exist", async () => {
    const product = seedProduct();
    storageExists.mockResolvedValueOnce({ data: false, error: { status: 400, message: "Object not found" } });
    await expect(startCheckout(product.id, randomUUID())).rejects.toMatchObject({ status: 503, message: expect.stringContaining("before purchasing") });
    expect(state.checkouts).toHaveLength(0);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
  it("fails closed with a retryable error during a Storage verification outage", async () => {
    const product = seedProduct();
    storageExists.mockRejectedValueOnce(new Error("Connection failed"));
    await expect(startCheckout(product.id, randomUUID())).rejects.toMatchObject({ status: 503 });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
  it("uses the saved Stripe price and ignores a browser-supplied amount", async () => {
    const product = seedProduct();
    const checkoutId = randomUUID();
    const response = await checkoutRoute(request("/api/checkout", { productId: product.id, checkoutId, amount: 1, price: "price_evil" }));
    expect(response.status).toBe(200);
    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: "price_seed", quantity: 1 }], client_reference_id: checkoutId,
      metadata: { app: "veilcode-store", checkout_id: checkoutId, product_id: product.id, store_id: STORE_ID },
      success_url: "https://delivery.example.com/thank-you", cancel_url: "https://delivery.example.com/p/studio-kit?checkout=cancelled",
    }), { idempotencyKey: `checkout-${checkoutId}` });
    expect(sessionsCreate.mock.calls[0][0]).not.toHaveProperty("payment_method_types");
    expect(state.checkouts[0].product_snapshot?.storagePath).toBe(product.storage_path);
  });
  it("reuses an open checkout for the same request", async () => {
    const product = seedProduct(); const id = randomUUID();
    await startCheckout(product.id, id); await startCheckout(product.id, id);
    expect(state.checkouts).toHaveLength(1);
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    expect(productsUpdate).toHaveBeenCalledTimes(1);
  });
  it("backfills existing Stripe product details before checkout using only the cover", async () => {
    stubDevelopment();
    const product = seedProduct({ cover_path: `${STORE_ID}/covers/current.png`, description: "An eight-stage guide with editable templates." });
    await startCheckout(product.id, randomUUID());
    expect(signUrl).toHaveBeenCalledExactlyOnceWith(product.cover_path, CHECKOUT_COVER_TTL);
    expect(productsUpdate).toHaveBeenCalledWith(product.stripe_product_id, {
      name: product.name, description: product.description,
      images: ["https://example.supabase.co/private-file?signature=example"],
    });
    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({ line_items: [{ price: product.stripe_price_id, quantity: 1 }] }), expect.anything());
    expect(productsUpdate.mock.invocationCallOrder[0]).toBeLessThan(sessionsCreate.mock.invocationCallOrder[0]);
  });
  it("falls back to the tagline and clears stale Stripe artwork when no cover is attached", async () => {
    const product = seedProduct({ description: "", cover_path: null });
    state.stripeProducts.get(product.stripe_product_id!)!.images = ["https://example.com/old.png"];
    await startCheckout(product.id, randomUUID());
    expect(productsUpdate).toHaveBeenCalledWith(product.stripe_product_id, { name: product.name, description: product.tagline, images: [] });
    expect(signUrl).not.toHaveBeenCalled();
  });
  it("allows a retry when cover signing fails without opening an incomplete checkout", async () => {
    const product = seedProduct({ cover_path: `${STORE_ID}/covers/current.png` });
    const id = randomUUID();
    signUrl.mockResolvedValueOnce({ data: null, error: { message: "Storage unavailable" } });
    await expect(startCheckout(product.id, id)).rejects.toMatchObject({ status: 503 });
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(productsUpdate).not.toHaveBeenCalled();
    await expect(startCheckout(product.id, id)).resolves.toContain("checkout.stripe.com");
    expect(state.checkouts).toHaveLength(1);
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });
  it("does not overwrite Stripe product details belonging to another store", async () => {
    const product = seedProduct();
    state.stripeProducts.get(product.stripe_product_id!)!.metadata = { store_id: randomUUID(), product_id: product.id };
    await expect(startCheckout(product.id, randomUUID())).rejects.toMatchObject({ status: 503 });
    expect(productsUpdate).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
  it("rejects a finished checkout and reuse for another product", async () => {
    const product = seedProduct(); const id = randomUUID();
    await startCheckout(product.id, id);
    const session = [...state.sessions.values()][0]; session.status = "complete";
    await expect(startCheckout(product.id, id)).rejects.toMatchObject({ status: 409 });
    const second = seedProduct({ slug: "another-kit" });
    await expect(startCheckout(second.id, id)).rejects.toMatchObject({ status: 409 });
  });
  it("uses the same Stripe idempotency key for concurrent submits", async () => {
    const product = seedProduct(); const id = randomUUID();
    await Promise.all([startCheckout(product.id, id), startCheckout(product.id, id)]);
    expect(state.checkouts).toHaveLength(1);
    expect(state.sessions.size).toBe(1);
    for (const call of sessionsCreate.mock.calls) expect(call[1]).toEqual({ idempotencyKey: `checkout-${id}` });
  });
  it("blocks drafts and rejects Stripe price mismatches", async () => {
    const product = seedProduct({ status: "draft" });
    await expect(startCheckout(product.id, randomUUID())).rejects.toMatchObject({ status: 404 });
    product.status = "published";
    pricesRetrieve.mockResolvedValueOnce({ id: "price_seed", active: true, type: "one_time", unit_amount: 1, currency: "usd", product: "prod_seed", livemode: false });
    await expect(startCheckout(product.id, randomUUID())).rejects.toMatchObject({ status: 503 });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
  it("fulfills the purchased snapshot after the product has changed", async () => {
    const product = seedProduct();
    const checkoutId = randomUUID();
    await startCheckout(product.id, checkoutId);
    const session = [...state.sessions.values()][0];
    const originalPath = product.storage_path;
    product.storage_path = "a-new-version.pdf"; product.name = "A changed name"; product.status = "draft";
    expect((await webhookRoute(signedEvent(session))).status).toBe(200);
    expect(state.orders[0].product_snapshot?.name).toBe("Studio Kit");
    expect(state.orders[0].product_snapshot?.storagePath).toBe(originalPath);
    expect(sendEmail.mock.calls[0][0].subject).toBe("Your Studio Kit is ready");
    expect((await webhookRoute(signedEvent(session))).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const token = new URL(sendEmail.mock.calls[0][0].text.match(/https:\/\/delivery\.example\.com\/api\/download\?token=\S+/)[0]).searchParams.get("token")!;
    expect((await downloadRoute(new Request(`https://delivery.example.com/api/download?token=${token}`))).status).toBe(302);
    const { signUrl } = await import("./fakes");
    expect(signUrl).toHaveBeenCalledWith(originalPath, 60, { download: "Studio-Kit.pdf" });
  });
  it("rejects mismatched reservations even on a signed paid event", async () => {
    const product = seedProduct(); await startCheckout(product.id, randomUUID());
    const session = [...state.sessions.values()][0];
    expect((await webhookRoute(signedEvent({ ...session, amount_subtotal: 1 }))).status).toBe(200);
    expect((await webhookRoute(signedEvent({ ...session, id: "cs_other" }))).status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.orders).toHaveLength(0);
  });
  it("works without a Payment Link environment variable", async () => {
    vi.stubEnv("STRIPE_PAYMENT_LINK_ID_L2K", "");
    const product = seedProduct(); await startCheckout(product.id, randomUUID());
    expect((await webhookRoute(signedEvent([...state.sessions.values()][0]))).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it("binds an unrecorded session when its paid webhook arrives", async () => {
    const product = seedProduct(); await startCheckout(product.id, randomUUID());
    state.checkouts[0].stripe_session_id = null;
    const session = [...state.sessions.values()][0];
    expect((await webhookRoute(signedEvent(session))).status).toBe(200);
    expect(state.checkouts[0].stripe_session_id).toBe(session.id);
  });
});

describe("owner operations and public boundaries", () => {
  it("resends orders from the dashboard and preserves the purchased assets", async () => {
    jar.set("veilcode_owner", "owner-token");
    const product = seedProduct(); const snapshot = snapshotProduct(product);
    const order = seedOrder({ product_id: product.id, product_snapshot: snapshot, email_status: "sent", download_count: 5 });
    expect((await ownerResend(request("/api/admin/orders/resend", { sessionId: order.stripe_session_id, email: "corrected@example.com" }))).status).toBe(200);
    expect(order.download_count).toBe(0);
    expect(order.email).toBe("corrected@example.com");
    expect(order.product_snapshot?.storagePath).toBe(snapshot.storagePath);
  });
  it("does not resend an order belonging to another store", async () => {
    jar.set("veilcode_owner", "owner-token"); seedOrder({ store_id: randomUUID() });
    expect((await ownerResend(request("/api/admin/orders/resend", { sessionId: "cs_test_purchase" }))).status).toBe(404);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("exports safe order fields without tokens or private download paths", async () => {
    jar.set("veilcode_owner", "owner-token");
    const token = issueToken(); seedOrder({ email: "=formula@example.com", download_token_hash: token.hash });
    const response = await exportRoute(); const csv = await response.text();
    expect(response.status).toBe(200); expect(csv).toContain("'=formula@example.com");
    expect(csv).not.toContain(token.hash); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(csvCell('a"b')).toBe('"a""b"');
  });
  it("only serves covers of published products", async () => {
    const product = seedProduct({ status: "draft", cover_path: "private/cover.png", cover_type: "image/png" });
    const context = { params: Promise.resolve({ id: product.id }) };
    expect((await coverRoute(new Request("https://delivery.example.com"), context)).status).toBe(404);
    expect(storageDownload).not.toHaveBeenCalled();
    product.status = "published";
    expect((await coverRoute(new Request("https://delivery.example.com"), context)).status).toBe(200);
  });
  it("previews draft covers for the owner without caching private images", async () => {
    const product = seedProduct({ status: "draft", cover_path: "private/cover.png", cover_type: "image/png" });
    jar.set("veilcode_owner", "owner-token");
    const response = await coverRoute(new Request("https://delivery.example.com/cover?preview=1"), { params: Promise.resolve({ id: product.id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(storageDownload).toHaveBeenCalledWith("private/cover.png");
  });
  it("denies cover previews to visitors and authenticated non-owners", async () => {
    const product = seedProduct({ status: "draft", cover_path: "private/cover.png", cover_type: "image/png" });
    const context = { params: Promise.resolve({ id: product.id }) };
    const preview = () => coverRoute(new Request("https://delivery.example.com/cover?preview=1"), context);
    expect((await preview()).status).toBe(404);
    jar.set("veilcode_owner", "other-token");
    getUser.mockResolvedValueOnce({ data: { user: { id: randomUUID() } }, error: null });
    expect((await preview()).status).toBe(404);
    expect(storageDownload).not.toHaveBeenCalled();
  });
  it("updates store settings only for an authenticated owner", async () => {
    const input = { name: "My studio", tagline: "Useful tools", bio: "Made for creatives", support_email: "hello@example.com", website_url: "https://example.com" };
    expect((await settingsRoute(request("/api/admin/settings", input))).status).toBe(401);
    jar.set("veilcode_owner", "owner-token");
    expect((await settingsRoute(request("/api/admin/settings", input))).status).toBe(200);
    expect(state.stores[0].name).toBe("My studio");
    expect(state.stores[0].owner_user_id).toBe(OWNER_ID);
  });
});
