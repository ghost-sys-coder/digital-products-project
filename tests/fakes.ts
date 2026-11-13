import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type { Order } from "../lib/orders";
import type { CatalogProduct, Checkout, ProductVariant, ShippingProfile, ShippingRate, Store } from "../lib/catalog.types";
import { STORE_ID } from "../lib/store-config";
import type { PaymentConnection, PaymentOAuthAttempt, ProductPaymentRef } from "../lib/payment.types";

type DbError = { code: string; message: string } | null;
type Result = { data: unknown; error: DbError };
type Row = Record<string, unknown>;
export const OWNER_ID = "975ac870-5ab8-43a5-9d70-c051c42fc61f";
export const state = {
  orders: [] as Order[], products: [] as CatalogProduct[], checkouts: [] as Checkout[], stores: [] as Store[],
  payment_connections: [] as PaymentConnection[], payment_oauth_attempts: [] as PaymentOAuthAttempt[], product_payment_refs: [] as ProductPaymentRef[],
  product_variants: [] as ProductVariant[], shipping_rates: [] as ShippingRate[], shipping_profiles: [] as ShippingProfile[],
  research_products: [] as Row[], integration_tokens: [] as Row[],
  mcp_clients: [] as Row[], mcp_connections: [] as Row[], mcp_secrets: [] as Row[], mcp_activity: [] as Row[], mcp_uploads: [] as Row[],
  dbError: false, insertError: null as DbError, markSentError: false,
  stripeProducts: new Map<string, Row>(), stripePrices: new Map<string, Row>(), sessions: new Map<string, Row>(), stripeShippingRates: new Map<string, Row>(),
};
export function seedOrder(overrides: Partial<Order> = {}): Order {
  const order: Order = {
    id: randomUUID(), stripe_session_id: "cs_test_purchase", product_id: "lead-to-kickoff",
    email: "buyer@example.com", amount_total: 2900, currency: "usd",
    download_token_hash: "a".repeat(64), download_count: 0, max_downloads: 5,
    token_expires_at: new Date(Date.now() + 86400_000).toISOString(), email_status: "pending",
    email_sent_at: null, created_at: new Date().toISOString(), delivery_lock_id: null, delivery_locked_until: null,
    store_id: STORE_ID, product_snapshot: null, ...overrides,
  };
  state.orders.push(order); return order;
}
export function seedProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  const product: CatalogProduct = {
    id: randomUUID(), store_id: STORE_ID, slug: "studio-kit", name: "Studio Kit", tagline: "A useful kit.",
    description: "Practical resources for your studio.", includes: ["A guide", "Templates"], status: "published",
    stripe_product_id: "prod_seed", stripe_price_id: "price_seed", price_amount: 2900, currency: "usd", stripe_livemode: false,
    storage_path: `${STORE_ID}/kit/file.pdf`, download_filename: "Studio-Kit.pdf", templates_url: null,
    cover_path: null, cover_type: null, sort_order: 0, revision: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    kind: "digital", theme: null, brand: {}, page: null, shipping_profile_id: null, ...overrides,
  };
  state.products.push(product);
  if (product.stripe_product_id) state.stripeProducts.set(product.stripe_product_id, { id: product.stripe_product_id, name: product.name, livemode: false, metadata: { store_id: product.store_id, product_id: product.id } });
  if (product.stripe_price_id) state.stripePrices.set(product.stripe_price_id, { id: product.stripe_price_id, unit_amount: product.price_amount, currency: product.currency, active: true, livemode: false, type: "one_time", product: product.stripe_product_id });
  return product;
}
function rows(table: string): Row[] {
  if (!["orders", "products", "checkouts", "stores", "payment_connections", "payment_oauth_attempts", "product_payment_refs", "product_variants", "shipping_rates", "shipping_profiles", "research_products", "integration_tokens", "mcp_clients", "mcp_connections", "mcp_secrets", "mcp_activity", "mcp_uploads"].includes(table)) throw new Error(`Unexpected table: ${table}`);
  return state[table as "orders"] as unknown as Row[];
}
class Query implements PromiseLike<Result> {
  operation = "select"; values: Row = {}; filters: [string, unknown][] = [];
  sorting: [string, boolean][] = []; rowLimit = Infinity;
  greater: [string, unknown][] = []; nulls: [string, unknown][] = [];
  constructor(public table: string) {}
  insert(values: Row) { this.operation = "insert"; this.values = values; return this; }
  upsert(values: Row) { this.operation = "upsert"; this.values = values; return this; }
  update(values: Row) { this.operation = "update"; this.values = values; return this; }
  delete() { this.operation = "delete"; return this; }
  select() { return this; }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
  // Like Postgres: a column that was never set is null.
  is(key: string, value: unknown) { this.nulls.push([key, value]); return this; }
  gt(key: string, value: unknown) { this.greater.push([key, value]); return this; }
  order(key: string, options?: { ascending?: boolean }) { this.sorting.push([key, options?.ascending !== false]); return this; }
  limit(value: number) { this.rowLimit = value; return this; }
  single() { return Promise.resolve(this.execute(true)); }
  maybeSingle() { return Promise.resolve(this.execute(true)); }
  execute(single = false): Result {
    if (state.dbError) return { data: null, error: { code: "08000", message: "Database unavailable" } };
    const tableRows = rows(this.table);
    if (this.operation === "upsert") {
      const existing = this.table === "integration_tokens"
        ? tableRows.find(row => row.provider === this.values.provider)
        : tableRows.find(row => row.connection_id === this.values.connection_id && row.product_id === this.values.product_id);
      if (existing) Object.assign(existing, this.values); else tableRows.push({ ...this.values });
      return { data: null, error: null };
    }
    if (this.operation === "insert") {
      if (state.insertError) return { data: null, error: state.insertError };
      if (Array.isArray(this.values)) {
        const rows = (this.values as Row[]).map((values) => ({ created_at: new Date().toISOString(), ...values }));
        tableRows.push(...rows);
        return { data: rows.map((row) => ({ ...row })), error: null };
      }
      if (tableRows.some((row) => (this.values.id !== undefined && row.id === this.values.id) ||
        (this.table === "orders" && (row.stripe_session_id === this.values.stripe_session_id || (this.values.download_token_hash != null && row.download_token_hash === this.values.download_token_hash))) ||
        (this.table === "products" && row.store_id === this.values.store_id && row.slug === this.values.slug))) {
        return { data: null, error: { code: "23505", message: "Unique violation" } };
      }
      let data;
      if (this.table === "orders") data = seedOrder(this.values as Partial<Order>);
      else if (this.table === "products") data = seedProduct({ status: "draft", revision: 0, stripe_price_id: null, stripe_product_id: null, storage_path: null, download_filename: null, ...this.values } as Partial<CatalogProduct>);
      else {
        const defaults: Row = this.table === "mcp_connections" ? { id: randomUUID(), last_used_at: null, revoked_at: null, client_id: null }
          : this.table === "mcp_uploads" ? { id: randomUUID() } : this.table === "mcp_activity" ? { id: tableRows.length + 1 }
          : this.table === "mcp_secrets" ? { details: {}, expires_at: null, used_at: null } : {};
        data = { created_at: new Date().toISOString(), ...defaults, ...this.values }; tableRows.push(data);
      }
      return { data: { ...data }, error: null };
    }
    let matches = tableRows.filter((row) => this.filters.every(([key, value]) => row[key] === value) && this.greater.every(([key, value]) => String(row[key]) > String(value))
      && this.nulls.every(([key, value]) => (row[key] ?? null) === value));
    if (this.operation === "delete") {
      const doomed = new Set(matches);
      state[this.table as "research_products"] = tableRows.filter((row) => !doomed.has(row));
      return { data: null, error: null };
    }
    if (this.operation === "update") {
      if (state.markSentError && this.values.email_status === "sent") return { data: null, error: { code: "08000", message: "Write failed" } };
      matches.forEach((row) => Object.assign(row, this.values));
    }
    matches = matches.toSorted((a, b) => {
      for (const [key, asc] of this.sorting) {
        const comparison = a[key] === b[key] ? 0 : a[key]! > b[key]! ? 1 : -1;
        if (comparison) return asc ? comparison : -comparison;
      } return 0;
    }).slice(0, this.rowLimit);
    const copies = matches.map((row) => ({ ...row }));
    return { data: single ? copies[0] ?? null : copies, error: null };
  }
  then<TResult1 = Result, TResult2 = never>(onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}
export const signUrl = vi.fn();
export const upload = vi.fn();
export const storageDownload = vi.fn();
export const storageExists = vi.fn();
export const signedUpload = vi.fn();
export const storageInfo = vi.fn();
export const storageList = vi.fn();
export const storageRemove = vi.fn();
export const rpc = vi.fn(async (name: string, args: Row) => {
  if (state.dbError) return { data: null, error: { code: "08000" } };
  if (name === "activate_payment_connection") {
    if (!state.stores.some(s => s.id === args.p_store_id && s.owner_user_id === args.p_owner_id)) return { data: null, error: { code: "42501" } };
    const existing = state.payment_connections.find(c => c.external_account_id === args.p_account_id && c.livemode === args.p_livemode);
    if (existing && existing.store_id !== args.p_store_id) return { data: null, error: { code: "23505" } };
    state.payment_connections.filter(c => c.store_id === args.p_store_id && c.livemode === args.p_livemode).forEach(c => c.is_current = false);
    const connection = existing ?? { id: randomUUID(), store_id: args.p_store_id as string, provider: "stripe" as const, external_account_id: args.p_account_id as string, livemode: args.p_livemode as boolean, created_at: new Date().toISOString() };
    Object.assign(connection, { is_current: true, status: args.p_charges_enabled && args.p_payouts_enabled ? "connected" : "restricted", charges_enabled: args.p_charges_enabled, payouts_enabled: args.p_payouts_enabled, country: args.p_country, requirements: args.p_requirements, updated_at: new Date().toISOString() });
    if (!existing) state.payment_connections.push(connection as PaymentConnection);
    return { data: connection.id, error: null };
  }
  if (name === "consume_download") {
    const order = state.orders.find((order) => order.download_token_hash === args.p_token_hash && order.download_count < order.max_downloads && Date.parse(order.token_expires_at ?? "") > Date.now());
    if (!order) return { data: [], error: null };
    order.download_count++;
    return { data: [{ product_id: order.product_id, product_snapshot: order.product_snapshot }], error: null };
  }
  if (name === "claim_delivery") {
    const order = state.orders.find((order) => order.stripe_session_id === args.p_session_id && (args.p_force || order.email_status === "pending") && (!order.delivery_locked_until || Date.parse(order.delivery_locked_until) <= Date.now()));
    if (!order) return { data: [], error: null };
    order.delivery_lock_id = args.p_lock_id as string;
    order.delivery_locked_until = new Date(Date.now() + 300_000).toISOString();
    return { data: [{ ...order }], error: null };
  }
  if (name === "save_shipping_profile") {
    // Mirrors supabase/migrations/20261113090000_store_editor.sql.
    let profile = state.shipping_profiles.find((entry) => entry.id === args.p_profile_id);
    if (profile && profile.store_id !== args.p_store_id) return { data: null, error: { code: "42501" } };
    const rates = args.p_rates as Row[];
    if (rates.some((rate) => state.shipping_rates.some((existing) => existing.id === rate.id && existing.profile_id !== args.p_profile_id))) return { data: null, error: { code: "42501" } };
    if (!profile) state.shipping_profiles.push(profile = { id: args.p_profile_id as string, store_id: args.p_store_id as string, name: "", created_at: new Date().toISOString() });
    profile.name = args.p_name as string;
    state.shipping_rates = [...state.shipping_rates.filter((rate) => rate.profile_id !== profile!.id),
      ...rates.map((rate, position) => ({ ...rate, store_id: profile!.store_id, profile_id: profile!.id, position, created_at: new Date().toISOString() }) as ShippingRate)];
    return { data: profile.id, error: null };
  }
  if (name === "save_physical_store") {
    const product = state.products.find((entry) => entry.id === args.p_product_id && entry.store_id === args.p_store_id && entry.kind === "physical");
    if (!product || product.revision !== args.p_revision) return { data: null, error: { code: "PT409" } };
    const fields = args.p_product as Row;
    if (state.products.some((entry) => entry !== product && entry.store_id === product.store_id && entry.slug === fields.slug)) return { data: null, error: { code: "23505" } };
    const variants = args.p_variants as Row[];
    if (variants.some((variant) => state.product_variants.some((existing) => existing.id === variant.id && existing.product_id !== product.id))) return { data: null, error: { code: "42501" } };
    Object.assign(product, fields, { revision: product.revision + 1, updated_at: new Date().toISOString() });
    const now = new Date().toISOString();
    state.product_variants = [...state.product_variants.filter((variant) => variant.product_id !== product.id),
      ...variants.map((variant, position) => ({ ...variant, store_id: product.store_id, product_id: product.id, position, created_at: now, updated_at: now }) as ProductVariant)];
    return { data: product.revision, error: null };
  }
  throw new Error(`Unexpected RPC: ${name}`);
});
export const getUser = vi.fn();
export const signIn = vi.fn();
export const signOut = vi.fn();
export const supabase = {
  from: vi.fn((table: string) => new Query(table)), rpc,
  storage: { from: vi.fn(() => ({ createSignedUrl: signUrl, createSignedUploadUrl: signedUpload, info: storageInfo, upload, download: storageDownload, exists: storageExists, list: storageList, remove: storageRemove })) },
  auth: { getUser, signInWithPassword: signIn, signOut },
};
export const sendEmail = vi.fn();
export const constructEvent = vi.fn();
export const productsRetrieve = vi.fn();
export const productsCreate = vi.fn();
export const productsUpdate = vi.fn();
export const pricesRetrieve = vi.fn();
export const pricesCreate = vi.fn();
export const sessionsCreate = vi.fn();
export const sessionsRetrieve = vi.fn();
export const shippingRatesRetrieve = vi.fn();
export const refundsCreate = vi.fn();
export const accountsRetrieve = vi.fn();
export const oauthToken = vi.fn();
export const oauthDeauthorize = vi.fn();
export const oauthAuthorizeUrl = vi.fn();
export function resetFakes() {
  state.orders = []; state.products = []; state.checkouts = [];
  state.payment_connections = []; state.payment_oauth_attempts = []; state.product_payment_refs = [];
  state.product_variants = []; state.shipping_rates = []; state.shipping_profiles = [];
  state.research_products = []; state.integration_tokens = [];
  state.mcp_clients = []; state.mcp_connections = []; state.mcp_secrets = []; state.mcp_activity = []; state.mcp_uploads = [];
  shippingRatesRetrieve.mockReset().mockImplementation(async (id: string) => { const rate = state.stripeShippingRates.get(id); if (!rate) throw { code: "resource_missing" }; return { ...rate }; });
  state.stripeShippingRates.clear();
  refundsCreate.mockReset().mockImplementation(async (input: Row) => ({ id: "re_test_1", amount: 10795, payment_intent: input.payment_intent, status: "succeeded" }));
  state.stores = [{ id: STORE_ID, owner_user_id: OWNER_ID, name: "VeilCode Studio", tagline: "Good systems. Better work.", bio: "Practical studio tools.", support_email: "support@veilcode.studio", website_url: "https://veilcode.studio" }];
  state.dbError = false; state.insertError = null; state.markSentError = false;
  state.stripeProducts.clear(); state.stripePrices.clear(); state.sessions.clear();
  sendEmail.mockReset().mockResolvedValue({ data: { id: "email_1" }, error: null });
  signUrl.mockReset().mockResolvedValue({ data: { signedUrl: "https://example.supabase.co/private-file?signature=example" }, error: null });
  upload.mockReset().mockResolvedValue({ data: { path: "uploaded" }, error: null });
  storageDownload.mockReset().mockResolvedValue({ data: new Blob(["image"]), error: null });
  storageExists.mockReset().mockResolvedValue({ data: true, error: null });
  signedUpload.mockReset().mockImplementation(async (path: string) => ({ data: { path, signedUrl: "https://example.supabase.co/storage/v1/object/upload/sign/example?token=fixture", token: "fixture" }, error: null }));
  storageInfo.mockReset().mockResolvedValue({ data: { size: 5, contentType: "application/pdf" }, error: null });
  storageList.mockReset().mockResolvedValue({ data: [], error: null });
  storageRemove.mockReset().mockResolvedValue({ data: [], error: null });
  constructEvent.mockReset().mockImplementation((body: string) => JSON.parse(body));
  const scoped = (id: string, options?: { stripeAccount?: string }) => options?.stripeAccount ? `${options.stripeAccount}:${id}` : id;
  productsRetrieve.mockReset().mockImplementation(async (id: string, _params?: unknown, options?: { stripeAccount?: string }) => { const product = state.stripeProducts.get(scoped(id, options)); if (!product) throw { code: "resource_missing" }; return { ...product }; });
  productsCreate.mockReset().mockImplementation(async (input: Row, options?: { stripeAccount?: string }) => { const product = { livemode: false, ...input }; state.stripeProducts.set(scoped(input.id as string, options), product); return { ...product }; });
  productsUpdate.mockReset().mockImplementation(async (id: string, input: Row, options?: { stripeAccount?: string }) => {
    const product = { ...state.stripeProducts.get(scoped(id, options)), ...input };
    state.stripeProducts.set(scoped(id, options), product);
    return { ...product };
  });
  pricesRetrieve.mockReset().mockImplementation(async (id: string, _params?: unknown, options?: { stripeAccount?: string }) => ({ ...state.stripePrices.get(scoped(id, options)) }));
  pricesCreate.mockReset().mockImplementation(async (input: Row, options?: { stripeAccount?: string }) => { const price = { id: `price_${state.stripePrices.size}`, active: true, type: "one_time", livemode: false, ...input }; state.stripePrices.set(scoped(price.id, options), price); return { ...price }; });
  sessionsCreate.mockReset().mockImplementation(async (input: Row, options?: { idempotencyKey?: string }) => {
    const existing = [...state.sessions.values()].find((session) => options?.idempotencyKey && session._key === options.idempotencyKey);
    if (existing) return existing;
    const session = { id: `cs_test_${state.sessions.size}`, url: "https://checkout.stripe.com/c/pay/test", status: "open", _key: options?.idempotencyKey, ...input };
    state.sessions.set(session.id, session); return session;
  });
  sessionsRetrieve.mockReset().mockImplementation(async (id: string) => ({ ...state.sessions.get(id) }));
  accountsRetrieve.mockReset().mockImplementation(async (id: string) => ({ id, type: "standard", country: "GB", charges_enabled: true, payouts_enabled: true, capabilities: { card_payments: "active" }, requirements: { currently_due: [] } }));
  oauthToken.mockReset().mockResolvedValue({ stripe_user_id: "acct_seller", scope: "read_write", livemode: false });
  oauthDeauthorize.mockReset().mockResolvedValue({ stripe_user_id: "acct_seller" });
  oauthAuthorizeUrl.mockReset().mockImplementation((params: Record<string, string>) => `https://connect.stripe.com/oauth/authorize?${new URLSearchParams(params)}`);
  getUser.mockReset().mockResolvedValue({ data: { user: { id: OWNER_ID, email: "owner@example.com" } }, error: null });
  signIn.mockReset().mockResolvedValue({ data: { user: { id: OWNER_ID }, session: { access_token: "owner-token", expires_in: 3600 } }, error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
}

const PHYSICAL_ID = "glow-lamp";
export const PHYSICAL_PREFIX = `${STORE_ID}/${PHYSICAL_ID}/`;
export function seedPhysicalStore(overrides: Partial<CatalogProduct> = {}) {
  const product = seedProduct({
    id: PHYSICAL_ID, slug: "glow", name: "Glow Lamp", kind: "physical", theme: "bold-dark", price_amount: null,
    stripe_price_id: null, stripe_product_id: null, storage_path: null, download_filename: null, shipping_profile_id: "profile-1",
    brand: { name: "Lumora Co.", supportEmail: "help@lumora.example" },
    page: { version: 1, sections: [{ id: "hero", type: "hero", data: { headline: "Glow", media: [{ path: `${PHYSICAL_PREFIX}media/a.webp`, kind: "image", alt: "Lamp" }] } }] },
    policies: { version: 1, sellerName: "Lumora Co. Ltd", sellerAddress: "", processingDays: { min: 1, max: 3 }, returnWindowDays: 30, returnShippingPaidBy: "customer", refundDays: 5, lostParcelDays: 14, responseTime: "", governingLaw: "the State of Delaware, USA", extra: {}, updatedAt: "2026-11-12" },
    ...overrides,
  });
  const now = new Date().toISOString();
  const variant = (id: string, position: number, color: string, price: number): ProductVariant => ({
    id, store_id: STORE_ID, product_id: product.id, position, options: { Color: color }, sku: `GLW-${color}`,
    price_amount: price, compare_at_amount: null, image_path: `${PHYSICAL_PREFIX}media/${color.toLowerCase()}.webp`, active: true,
    supplier_url: "https://supplier.example/item/1", supplier_sku: `SUP-${color}`, created_at: now, updated_at: now,
  });
  state.product_variants.push(variant("0b5e3c3e-6f4a-4f63-9a3c-1f0d3a1e2b01", 0, "Black", 4900), variant("0b5e3c3e-6f4a-4f63-9a3c-1f0d3a1e2b02", 1, "White", 5400));
  const rate = (id: string, position: number, name: string, amount: number, min: number, max: number): ShippingRate => ({
    id, store_id: STORE_ID, profile_id: "profile-1", market: "US", name, amount, currency: "usd", min_days: min, max_days: max, position, active: true, created_at: now,
  });
  state.shipping_rates.push(rate("rate-free", 0, "Free tracked shipping", 0, 7, 12), rate("rate-express", 1, "Express", 995, 4, 6));
  return { product, variants: state.product_variants, rates: state.shipping_rates };
}

/** A paid physical order as the webhook records it. */
export function seedPhysicalOrder(overrides: Partial<Order> = {}) {
  return seedOrder({
    stripe_session_id: `cs_test_physical_${state.orders.length}`, product_id: "glow-lamp", kind: "physical",
    download_token_hash: null, token_expires_at: null, email_status: "sent", amount_total: 10795, currency: "usd",
    customer_name: "Ada Lovelace", fulfillment_status: "needs_ordering", supplier_order_ref: null,
    tracking_number: null, tracking_carrier: null, tracking_url: null, ordered_at: null, shipped_at: null, delivered_at: null, tracking_email_sent_at: null,
    shipping_address: { name: "Ada Lovelace", line1: "1 Main St", line2: null, city: "Austin", state: "TX", postal_code: "73301", country: "US", phone: "+15555550100" },
    physical_snapshot: {
      brand: { name: "Lumora Co.", supportEmail: "help@lumora.example" }, currency: "usd",
      items: [{ productId: "glow-lamp", variantId: "v1", name: "Glow Lamp", variantLabel: "Black", sku: "GLW-Black", unitAmount: 4900, quantity: 2, imagePath: null, supplierUrl: "https://supplier.example/item/1", supplierSku: "SUP-Black" }],
      shippingOptions: [], shipping: { name: "Express", amount: 995, minDays: 4, maxDays: 6 },
    },
    ...overrides,
  });
}
