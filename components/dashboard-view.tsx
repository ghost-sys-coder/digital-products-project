import Link from "next/link";
import { ArrowRight, ArrowUpRight, BellRing, CheckCircle2, Package, Plus, Receipt, Settings, Store, Truck } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog.types";
import type { Order } from "@/lib/orders";
import { formatMoney } from "@/lib/store-config";
import { OrdersTable } from "./orders-table";

const DAYS = 14;
const day = (date: Date) => date.toISOString().slice(0, 10);

/** Daily sales for the last two weeks, in the currency that has sold the most. Dates are UTC, like the orders list. */
function salesSeries(orders: Order[], now: Date) {
  const byCurrency = new Map<string, number>();
  for (const order of orders) if (order.currency && order.amount_total) byCurrency.set(order.currency, (byCurrency.get(order.currency) ?? 0) + order.amount_total);
  const currency = [...byCurrency].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "usd";
  const days = Array.from({ length: DAYS }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - (DAYS - 1 - index));
    return { key: day(date), label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(date), total: 0 };
  });
  const index = new Map(days.map((entry, position) => [entry.key, position]));
  for (const order of orders) {
    if (order.currency !== currency || !order.amount_total) continue;
    const position = index.get(day(new Date(order.created_at)));
    if (position !== undefined) days[position].total += order.amount_total;
  }
  return { currency, days, total: days.reduce((sum, entry) => sum + entry.total, 0), peak: Math.max(...days.map((entry) => entry.total)) };
}

/** The owner's overview (app/admin/page.tsx). Kept separate from the page so it renders from plain data. */
export function DashboardView({ products, orders, now = new Date() }: { products: CatalogProduct[]; orders: Order[]; now?: Date }) {
  const totals = new Map<string, number>();
  for (const order of orders) if (order.currency) totals.set(order.currency, (totals.get(order.currency) ?? 0) + (order.amount_total ?? 0));
  const published = products.filter((product) => product.status === "published").length;
  const toDeliver = orders.filter((order) => order.kind !== "physical" && order.email_status === "pending").length;
  const toOrder = orders.filter((order) => order.kind === "physical" && (order.fulfillment_status ?? "needs_ordering") === "needs_ordering").length;
  const attention = toDeliver + toOrder;
  const series = salesSeries(orders, now);
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(now);

  return <div className="dash">
    <div className="admin-page-heading">
      <div><span className="eyebrow">{today.toUpperCase()}</span><h1>Good to see you.</h1><p>Here’s how the studio is doing.</p></div>
      <div className="admin-heading-actions">
        <Link href="/" target="_blank" rel="noopener noreferrer" className="button secondary">View store <ArrowUpRight size={16} /></Link>
        <Link href="/admin/products/new" className="button primary"><Plus size={17} /> Add a product</Link>
      </div>
    </div>

    <div className="dash-grid">
      <section className="dash-sales" aria-labelledby="dash-sales-title">
        <div className="dash-sales-top">
          <div>
            <h2 id="dash-sales-title">Gross sales</h2>
            <strong>{totals.size ? [...totals].map(([currency, total]) => formatMoney(total, currency)).join(" + ") : formatMoney(0, "usd")}</strong>
            <span>Latest {orders.length} {orders.length === 1 ? "order" : "orders"}, before refunds and fees</span>
          </div>
          <div className="dash-sales-period">
            <span>Last {DAYS} days</span>
            <b>{formatMoney(series.total, series.currency)}</b>
          </div>
        </div>
        <ol className="dash-chart" aria-label={`Daily sales for the last ${DAYS} days, in ${series.currency.toUpperCase()}`}>
          {series.days.map((entry) => (
            <li key={entry.key} title={`${entry.label}: ${formatMoney(entry.total, series.currency)}`}>
              <span className="dash-bar" data-empty={entry.total ? undefined : true} style={{ height: `${series.peak ? Math.max(4, (entry.total / series.peak) * 100) : 4}%` }} />
              <span className="dash-sr">{entry.label}: {formatMoney(entry.total, series.currency)}</span>
            </li>
          ))}
        </ol>
        <div className="dash-chart-axis" aria-hidden="true"><span>{series.days[0].label}</span><span>Today</span></div>
      </section>

      <div className="dash-stats">
        <Link href="/admin/orders" className="dash-stat">
          <span className="dash-stat-icon"><Receipt size={19} /></span>
          <div><span>Orders</span><strong>{orders.length}{orders.length === 100 ? "+" : ""}</strong></div>
          <ArrowUpRight className="dash-stat-go" size={17} />
        </Link>
        <Link href="/admin/products" className="dash-stat">
          <span className="dash-stat-icon"><Package size={19} /></span>
          <div><span>Live products</span><strong>{published}<small> of {products.length}</small></strong></div>
          <ArrowUpRight className="dash-stat-go" size={17} />
        </Link>
        <Link href={toOrder ? "/admin/fulfillment" : "/admin/orders"} className={`dash-stat${attention ? " is-alert" : ""}`}>
          <span className="dash-stat-icon">{attention ? <BellRing size={19} /> : <CheckCircle2 size={19} />}</span>
          <div><span>Needs attention</span><strong>{attention ? attention : "All clear"}</strong>
            {attention > 0 && <small className="dash-stat-note">{[toOrder && `${toOrder} to order`, toDeliver && `${toDeliver} email${toDeliver === 1 ? "" : "s"} pending`].filter(Boolean).join(", ")}</small>}
          </div>
          <ArrowUpRight className="dash-stat-go" size={17} />
        </Link>
      </div>
    </div>

    <div className="dash-lower">
      <section className="workspace-panel" aria-labelledby="dash-orders-title">
        <div className="panel-heading"><div><h2 id="dash-orders-title">Recent orders</h2><p>The people putting your work to use.</p></div><Link href="/admin/orders" className="quiet-link">All orders <ArrowUpRight size={15} /></Link></div>
        <OrdersTable orders={orders.slice(0, 5)} />
      </section>
      <nav className="dash-actions" aria-label="Quick actions">
        <h2>Quick actions</h2>
        <Link href="/admin/products/new"><Package size={18} /><span>New digital product<small>Upload a download and set a price</small></span><ArrowRight size={16} /></Link>
        <Link href="/admin/products/new-store"><Store size={18} /><span>New product store<small>A full page for a physical product</small></span><ArrowRight size={16} /></Link>
        <Link href="/admin/fulfillment"><Truck size={18} /><span>Fulfilment queue<small>Order, ship and track</small></span><ArrowRight size={16} /></Link>
        <Link href="/admin/settings"><Settings size={18} /><span>Store settings<small>Payments, email and details</small></span><ArrowRight size={16} /></Link>
      </nav>
    </div>
    <div className="workspace-note"><CheckCircle2 size={16} /> Payments are processed by Stripe. Paid orders trigger secure email delivery.</div>
  </div>;
}
