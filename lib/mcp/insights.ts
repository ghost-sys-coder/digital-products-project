import "server-only";
import { getSupabase } from "../supabase";
import { HttpError } from "../http";
import { STORE_ID, formatMoney } from "../store-config";
import { getStore, listProducts } from "../catalog";
import { listResearch } from "../research";
import { unitEconomics, longestRunning, STAGES } from "../research.types";
import type { Order } from "../orders";
import type { CatalogProduct } from "../catalog.types";

// What assistants can read about the store (scope "read"). Lists and summaries leave out customer
// names, emails and addresses; only getOrder, for one order the owner asks about, returns them.

const DAY = 86400_000;
export const orderRef = (order: Pick<Order, "stripe_session_id">) => order.stripe_session_id.slice(-8).toUpperCase();
const money = (cents: number | null, currency: string | null) => (cents === null || !currency ? null : formatMoney(cents, currency));

function productName(order: Order) {
  if (order.kind === "physical") return order.physical_snapshot?.items.map((item) => `${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ""}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`).join(", ") || "Physical order";
  return order.product_snapshot?.name ?? order.product_id;
}

/** Where an order stands, in the owner's words. */
export function orderStatus(order: Order) {
  if (order.cancelled_at) return order.refunded_amount ? "cancelled and refunded" : "cancelled";
  if (order.kind === "physical") {
    return ({ needs_ordering: "needs ordering from the supplier", ordered: "ordered, waiting to ship", shipped: "shipped", delivered: "delivered", cancelled: "cancelled" } as const)[order.fulfillment_status ?? "needs_ordering"];
  }
  return order.email_status === "sent" ? "delivered by email" : "download email not sent yet";
}

async function ordersSince(since: number, limit = 1000) {
  const { data, error } = await getSupabase().from("orders").select("*").eq("store_id", STORE_ID)
    .gt("created_at", new Date(since).toISOString()).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new HttpError(500, "Could not load orders.");
  return (data ?? []) as Order[];
}

/** A masked order for lists: no names, emails or street addresses. */
function orderSummary(order: Order) {
  return {
    ref: orderRef(order), placedAt: order.created_at, kind: order.kind ?? "digital", product: productName(order),
    total: money(order.amount_total, order.currency), status: orderStatus(order),
    shipTo: order.kind === "physical" ? order.shipping_address?.country ?? null : undefined,
    tracking: order.tracking_number ? { carrier: order.tracking_carrier, number: order.tracking_number } : undefined,
  };
}

export async function storeOverview(days = 30) {
  const window = Math.min(Math.max(Math.round(days), 1), 365);
  const now = Date.now();
  const [store, orders, products, ideas] = await Promise.all([getStore(), ordersSince(now - window * DAY), listProducts(), listResearch()]);
  const paid = orders.filter((order) => order.amount_total !== null && order.currency);
  const byCurrency = new Map<string, { gross: number; refunded: number; orders: number }>();
  for (const order of paid) {
    const entry = byCurrency.get(order.currency!) ?? { gross: 0, refunded: 0, orders: 0 };
    entry.gross += order.amount_total!; entry.refunded += order.refunded_amount ?? 0; entry.orders += 1;
    byCurrency.set(order.currency!, entry);
  }
  const lastWeek = orders.filter((order) => Date.parse(order.created_at) > now - 7 * DAY);
  const best = new Map<string, { orders: number; revenue: Map<string, number> }>();
  for (const order of paid) {
    const name = order.kind === "physical" ? order.physical_snapshot?.items[0]?.name ?? "Physical order" : order.product_snapshot?.name ?? order.product_id;
    const entry = best.get(name) ?? { orders: 0, revenue: new Map() };
    entry.orders += 1; entry.revenue.set(order.currency!, (entry.revenue.get(order.currency!) ?? 0) + order.amount_total!);
    best.set(name, entry);
  }
  const live = orders.filter((order) => !order.cancelled_at);
  return {
    store: store.name, period: `last ${window} days`,
    sales: [...byCurrency].map(([currency, entry]) => ({
      currency: currency.toUpperCase(), orders: entry.orders, gross: formatMoney(entry.gross, currency), refunded: formatMoney(entry.refunded, currency),
      net: formatMoney(entry.gross - entry.refunded, currency), averageOrder: formatMoney(Math.round(entry.gross / entry.orders), currency),
    })),
    ordersLast7Days: lastWeek.length,
    needsAttention: {
      toOrderFromSupplier: live.filter((order) => order.kind === "physical" && (order.fulfillment_status ?? "needs_ordering") === "needs_ordering").length,
      waitingToShip: live.filter((order) => order.kind === "physical" && order.fulfillment_status === "ordered").length,
      downloadEmailsNotSent: live.filter((order) => order.kind !== "physical" && order.email_status === "pending").length,
    },
    bestSellers: [...best].sort((a, b) => b[1].orders - a[1].orders).slice(0, 5).map(([name, entry]) => ({
      product: name, orders: entry.orders, revenue: [...entry.revenue].map(([currency, total]) => formatMoney(total, currency)).join(" + "),
    })),
    catalogue: {
      digitalLive: products.filter((product) => product.kind === "digital" && product.status === "published").length,
      digitalDrafts: products.filter((product) => product.kind === "digital" && product.status === "draft").length,
      storesLive: products.filter((product) => product.kind === "physical" && product.status === "published").length,
      storeDrafts: products.filter((product) => product.kind === "physical" && product.status === "draft").length,
    },
    research: Object.fromEntries(STAGES.map((stage) => [stage, ideas.filter((idea) => idea.stage === stage).length])),
    note: orders.length >= 1000 ? "Only the latest 1,000 orders in this period were counted." : undefined,
  };
}

export const ORDER_FILTERS = ["all", "needs_ordering", "ordered", "shipped", "delivered", "cancelled", "email_pending"] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];

export async function listOrders({ filter = "all", kind, days = 30, limit = 25 }: { filter?: OrderFilter; kind?: "digital" | "physical"; days?: number; limit?: number }) {
  const orders = await ordersSince(Date.now() - Math.min(Math.max(days, 1), 365) * DAY);
  const matches = orders.filter((order) => {
    if (kind && (order.kind ?? "digital") !== kind) return false;
    switch (filter) {
      case "all": return true;
      case "cancelled": return !!order.cancelled_at;
      case "email_pending": return !order.cancelled_at && order.kind !== "physical" && order.email_status === "pending";
      default: return !order.cancelled_at && order.kind === "physical" && (order.fulfillment_status ?? "needs_ordering") === filter;
    }
  });
  const shown = matches.slice(0, Math.min(Math.max(limit, 1), 50));
  return { count: matches.length, shown: shown.length, orders: shown.map(orderSummary), privacy: "Customer names, emails and addresses are left out. Ask for one order by its reference to see them." };
}

/** One order in full, including the customer's details, found by its reference (last 8 characters). */
export async function getOrder(ref: string) {
  const wanted = ref.trim().toUpperCase().replace(/^#/, "");
  if (!/^[A-Z0-9_]{6,80}$/.test(wanted)) throw new HttpError(400, "Give the order reference from the confirmation email, like 7KQ2M9XA.");
  const orders = await ordersSince(Date.now() - 400 * DAY, 2000);
  const order = orders.find((entry) => orderRef(entry) === wanted.slice(-8) || entry.stripe_session_id.toUpperCase() === wanted);
  if (!order) throw new HttpError(404, `No order with reference ${wanted} in the last 400 days.`);
  const address = order.shipping_address;
  return {
    ...orderSummary(order),
    customer: { name: order.customer_name ?? address?.name ?? null, email: order.email },
    shippingAddress: order.kind === "physical" && address ? [address.line1, address.line2, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(", ") : undefined,
    items: order.physical_snapshot?.items.map((item) => ({ name: item.name, option: item.variantLabel, quantity: item.quantity, price: money(item.unitAmount, order.currency), supplier: item.supplierUrl, supplierSku: item.supplierSku })),
    shipping: order.physical_snapshot?.shipping ?? undefined,
    supplierOrderRef: order.supplier_order_ref ?? undefined,
    tracking: order.tracking_number ? { carrier: order.tracking_carrier, number: order.tracking_number, url: order.tracking_url } : undefined,
    delays: order.delay_notices?.length ? order.delay_notices : undefined,
    refunded: order.refunded_amount ? money(order.refunded_amount, order.currency) : undefined,
    manage: order.kind === "physical" ? "Fulfil, add tracking, send delay notices or cancel in the admin under Fulfilment." : "Resend the download email from the admin under Orders.",
  };
}

function productSummary(product: CatalogProduct) {
  return {
    id: product.id, kind: product.kind, name: product.name, slug: product.slug, status: product.status, tagline: product.tagline,
    price: product.kind === "digital" ? money(product.price_amount, product.currency) : undefined,
    url: product.kind === "physical" ? `/s/${product.slug}` : `/p/${product.slug}`,
    updatedAt: product.updated_at,
  };
}

export async function listCatalogue(kind?: "digital" | "physical") {
  return { products: (await listProducts(false, kind)).map(productSummary) };
}

export async function researchBoard(stage?: string) {
  const ideas = await listResearch();
  return {
    ideas: ideas.filter((idea) => !stage || idea.stage === stage).map((idea) => {
      const economics = unitEconomics(idea);
      return {
        id: idea.id, kind: idea.kind, title: idea.title, stage: idea.stage, longestAdDays: longestRunning(idea.ads), ads: idea.ads.length,
        supplier: idea.supplier ? { name: idea.supplier.name, cost: money(idea.supplier.cost, "usd"), shipping: money(idea.supplier.shipping, "usd") } : null,
        price: money(idea.target_price, "usd"), profitPerSale: economics ? money(economics.profit, "usd") : null,
        margin: economics ? `${Math.round(economics.margin * 100)}%` : null,
        store: idea.store ? { slug: idea.store.slug, status: idea.store.status, productId: idea.store_product_id } : null,
      };
    }),
  };
}
