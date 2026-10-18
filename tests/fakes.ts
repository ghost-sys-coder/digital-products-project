import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type { Order } from "../lib/orders";
import type { CatalogProduct, Checkout, Store } from "../lib/catalog.types";
import { STORE_ID } from "../lib/store-config";

type DbError = { code: string; message: string } | null;
type Result = { data: unknown; error: DbError };
type Row = Record<string, unknown>;
export const OWNER_ID = "975ac870-5ab8-43a5-9d70-c051c42fc61f";
export const state = {
  orders: [] as Order[], products: [] as CatalogProduct[], checkouts: [] as Checkout[], stores: [] as Store[],
  dbError: false, insertError: null as DbError, markSentError: false,
  stripeProducts: new Map<string, Row>(), stripePrices: new Map<string, Row>(), sessions: new Map<string, Row>(),
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
    cover_path: null, cover_type: null, sort_order: 0, revision: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...overrides,
  };
  state.products.push(product);
  if (product.stripe_product_id) state.stripeProducts.set(product.stripe_product_id, { id: product.stripe_product_id, name: product.name, livemode: false, metadata: { store_id: product.store_id, product_id: product.id } });
  if (product.stripe_price_id) state.stripePrices.set(product.stripe_price_id, { id: product.stripe_price_id, unit_amount: product.price_amount, currency: product.currency, active: true, livemode: false, type: "one_time", product: product.stripe_product_id });
  return product;
}
function rows(table: string): Row[] {
  if (!["orders", "products", "checkouts", "stores"].includes(table)) throw new Error(`Unexpected table: ${table}`);
  return state[table as "orders"] as unknown as Row[];
}
class Query implements PromiseLike<Result> {
  operation = "select"; values: Row = {}; filters: [string, unknown][] = [];
  sorting: [string, boolean][] = []; rowLimit = Infinity;
  constructor(public table: string) {}
  insert(values: Row) { this.operation = "insert"; this.values = values; return this; }
  update(values: Row) { this.operation = "update"; this.values = values; return this; }
  select() { return this; }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
  is(key: string, value: unknown) { return this.eq(key, value); }
  order(key: string, options?: { ascending?: boolean }) { this.sorting.push([key, options?.ascending !== false]); return this; }
  limit(value: number) { this.rowLimit = value; return this; }
  single() { return Promise.resolve(this.execute(true)); }
  maybeSingle() { return Promise.resolve(this.execute(true)); }
  execute(single = false): Result {
    if (state.dbError) return { data: null, error: { code: "08000", message: "Database unavailable" } };
    const tableRows = rows(this.table);
    if (this.operation === "insert") {
      if (state.insertError) return { data: null, error: state.insertError };
      if (tableRows.some((row) => (row.id === this.values.id) ||
        (this.table === "orders" && (row.stripe_session_id === this.values.stripe_session_id || row.download_token_hash === this.values.download_token_hash)) ||
        (this.table === "products" && row.store_id === this.values.store_id && row.slug === this.values.slug))) {
        return { data: null, error: { code: "23505", message: "Unique violation" } };
      }
      let data;
      if (this.table === "orders") data = seedOrder(this.values as Partial<Order>);
      else if (this.table === "products") data = seedProduct({ status: "draft", revision: 0, stripe_price_id: null, stripe_product_id: null, storage_path: null, download_filename: null, ...this.values } as Partial<CatalogProduct>);
      else { data = { created_at: new Date().toISOString(), ...this.values }; tableRows.push(data); }
      return { data: { ...data }, error: null };
    }
    let matches = tableRows.filter((row) => this.filters.every(([key, value]) => row[key] === value));
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
export const rpc = vi.fn(async (name: string, args: Row) => {
  if (state.dbError) return { data: null, error: { code: "08000" } };
  if (name === "consume_download") {
    const order = state.orders.find((order) => order.download_token_hash === args.p_token_hash && order.download_count < order.max_downloads && Date.parse(order.token_expires_at) > Date.now());
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
  throw new Error(`Unexpected RPC: ${name}`);
});
export const getUser = vi.fn();
export const signIn = vi.fn();
export const signOut = vi.fn();
export const supabase = {
  from: vi.fn((table: string) => new Query(table)), rpc,
  storage: { from: vi.fn(() => ({ createSignedUrl: signUrl, upload, download: storageDownload, exists: storageExists })) },
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
export function resetFakes() {
  state.orders = []; state.products = []; state.checkouts = [];
  state.stores = [{ id: STORE_ID, owner_user_id: OWNER_ID, name: "VeilCode Studio", tagline: "Good systems. Better work.", bio: "Practical studio tools.", support_email: "support@veilcode.studio", website_url: "https://veilcode.studio" }];
  state.dbError = false; state.insertError = null; state.markSentError = false;
  state.stripeProducts.clear(); state.stripePrices.clear(); state.sessions.clear();
  sendEmail.mockReset().mockResolvedValue({ data: { id: "email_1" }, error: null });
  signUrl.mockReset().mockResolvedValue({ data: { signedUrl: "https://example.supabase.co/private-file?signature=example" }, error: null });
  upload.mockReset().mockResolvedValue({ data: { path: "uploaded" }, error: null });
  storageDownload.mockReset().mockResolvedValue({ data: new Blob(["image"]), error: null });
  storageExists.mockReset().mockResolvedValue({ data: true, error: null });
  constructEvent.mockReset().mockImplementation((body: string) => JSON.parse(body));
  productsRetrieve.mockReset().mockImplementation(async (id: string) => { const product = state.stripeProducts.get(id); if (!product) throw { code: "resource_missing" }; return { ...product }; });
  productsCreate.mockReset().mockImplementation(async (input: Row) => { const product = { livemode: false, ...input }; state.stripeProducts.set(input.id as string, product); return { ...product }; });
  productsUpdate.mockReset().mockImplementation(async (id: string, input: Row) => {
    const product = { ...state.stripeProducts.get(id), ...input };
    state.stripeProducts.set(id, product);
    return { ...product };
  });
  pricesRetrieve.mockReset().mockImplementation(async (id: string) => ({ ...state.stripePrices.get(id) }));
  pricesCreate.mockReset().mockImplementation(async (input: Row) => { const price = { id: `price_${state.stripePrices.size}`, active: true, type: "one_time", livemode: false, ...input }; state.stripePrices.set(price.id, price); return { ...price }; });
  sessionsCreate.mockReset().mockImplementation(async (input: Row, options?: { idempotencyKey?: string }) => {
    const existing = [...state.sessions.values()].find((session) => options?.idempotencyKey && session._key === options.idempotencyKey);
    if (existing) return existing;
    const session = { id: `cs_test_${state.sessions.size}`, url: "https://checkout.stripe.com/c/pay/test", status: "open", _key: options?.idempotencyKey, ...input };
    state.sessions.set(session.id, session); return session;
  });
  sessionsRetrieve.mockReset().mockImplementation(async (id: string) => ({ ...state.sessions.get(id) }));
  getUser.mockReset().mockResolvedValue({ data: { user: { id: OWNER_ID, email: "owner@example.com" } }, error: null });
  signIn.mockReset().mockResolvedValue({ data: { user: { id: OWNER_ID }, session: { access_token: "owner-token", expires_in: 3600 } }, error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
}
