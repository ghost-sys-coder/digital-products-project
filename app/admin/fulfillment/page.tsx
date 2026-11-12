import Link from "next/link";
import Image from "next/image";
import { Clock, ExternalLink, PackageOpen, RotateCcw, Truck } from "lucide-react";
import { ownerPage } from "@/lib/auth";
import { getStore } from "@/lib/catalog";
import { fulfillmentCounts, FULFILLMENT_STATUSES, listPhysicalOrders, trackingLink } from "@/lib/fulfillment";
import { storefrontMediaBase } from "@/lib/storefront";
import { isOverdue, originalShipBy, promisedShipBy } from "@/lib/order-dates";
import { formatMoney } from "@/lib/store-config";
import { AdminShell } from "@/components/admin-shell";
import { CopyField, FulfillmentActions } from "@/components/fulfillment-actions";
import type { FulfillmentStatus, Order } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const TABS: Record<FulfillmentStatus, { label: string; empty: string }> = {
  needs_ordering: { label: "Needs ordering", empty: "Nothing to order right now. New paid orders appear here first." },
  ordered: { label: "Ordered", empty: "No orders waiting for tracking." },
  shipped: { label: "Shipped", empty: "No orders in transit." },
  delivered: { label: "Delivered", empty: "Delivered orders will appear here." },
  cancelled: { label: "Cancelled", empty: "No cancelled orders." },
};

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const day = (value: string) => dayFormat.format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));

function waitingDays(order: Order) {
  return Math.floor((Date.now() - Date.parse(order.created_at)) / 86_400_000);
}

function OrderCard({ order, mediaBase }: { order: Order; mediaBase: string }) {
  const snapshot = order.physical_snapshot;
  const address = order.shipping_address;
  const status = order.fulfillment_status ?? "needs_ordering";
  const currency = order.currency ?? snapshot?.currency ?? "usd";
  const days = waitingDays(order);
  const open = status === "needs_ordering" || status === "ordered";
  const shipBy = promisedShipBy(order);
  const overdue = isOverdue(order);
  const notices = order.delay_notices ?? [];
  const total = order.amount_total !== null ? formatMoney(order.amount_total, currency) : null;
  const entries: [string, string | null][] = address ? [
    ["Name", address.name], ["Phone", address.phone], ["Address line 1", address.line1], ["Address line 2", address.line2],
    ["City", address.city], ["State", address.state], ["ZIP code", address.postal_code], ["Country", address.country],
  ] : [];
  const fields = entries.filter((entry): entry is [string, string] => !!entry[1]);
  const fullAddress = fields.filter(([label]) => label !== "Phone").map(([, value]) => value).join("\n");

  return <article className="workspace-panel fulfil-card" id={`order-${order.id}`}>
    <header className="fulfil-card-head">
      <div>
        <h2>Order {order.stripe_session_id.slice(-8).toUpperCase()}</h2>
        <p className="muted"><time dateTime={order.created_at}>{dateFormat.format(new Date(order.created_at))} UTC</time> · <a href={`mailto:${order.email}`}>{order.email}</a></p>
      </div>
      <div className="fulfil-card-meta">
        {overdue ? <span className="badge danger">Overdue · was due {day(shipBy)}</span>
          : open ? <span className={`badge ${status === "needs_ordering" && days >= 2 ? "warning" : "pending"}`}>Ship by {day(shipBy)}</span> : null}
        <strong>{order.amount_total !== null ? formatMoney(order.amount_total, currency) : "—"}</strong>
      </div>
    </header>
    <div className="fulfil-card-body">
      <section>
        <h3>Items</h3>
        {snapshot?.items.map((item) => <div className="fulfil-item" key={item.variantId}>
          <span className="fulfil-thumb">{item.imagePath && <Image src={mediaBase + item.imagePath} alt="" fill sizes="56px" />}</span>
          <div>
            <strong>{item.quantity} × {item.name}</strong>
            <span>{[item.variantLabel, item.sku && `SKU ${item.sku}`, formatMoney(item.unitAmount, currency) + " each"].filter(Boolean).join(" · ")}</span>
            {item.supplierUrl?.startsWith("https://")
              ? <a className="fulfil-supplier" href={item.supplierUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><ExternalLink size={13} />Open supplier page{item.supplierSku ? ` · ${item.supplierSku}` : ""}</a>
              : <span className="fulfil-missing">No supplier link saved for this variant</span>}
          </div>
        </div>)}
        {snapshot?.shipping && <p className="fulfil-shipping"><Truck size={14} />{snapshot.shipping.name} · {snapshot.shipping.amount ? formatMoney(snapshot.shipping.amount, currency) : "Free"}{snapshot.shipping.maxDays ? ` · promised ${snapshot.shipping.minDays}–${snapshot.shipping.maxDays} business days` : ""}</p>}
        {notices.map((notice) => <p className="fulfil-shipping" key={notice.sentAt}><Clock size={14} />Delay notice sent {day(notice.sentAt)}: new ship-by {day(notice.shipBy)}{notice.reason ? ` (${notice.reason})` : ""}</p>)}
        {order.tracking_number && <p className="fulfil-shipping">Tracking: <a href={trackingLink(order.tracking_number, order.tracking_url)} target="_blank" rel="noopener noreferrer">{order.tracking_carrier ? `${order.tracking_carrier} ` : ""}{order.tracking_number}</a>{order.tracking_email_sent_at ? " · customer emailed" : " · not emailed yet"}</p>}
      </section>
      <section>
        <h3>Ship to</h3>
        {fields.length ? <div className="copy-list">{fields.map(([label, value]) => <CopyField key={label} label={label} value={value} />)}<CopyField label="Full address" value={fullAddress} /></div> : <p className="form-error">No shipping address was recorded. Contact the customer before ordering.</p>}
      </section>
      <section>
        <h3>Next step</h3>
        {status === "cancelled" && <p className="fulfil-cancelled"><RotateCcw size={14} />
          <span>Cancelled{order.cancelled_by === "customer" ? " by the customer" : ""}{order.cancelled_at ? ` on ${day(order.cancelled_at)}` : ""}. {order.refunded_amount != null
            ? `Refunded ${formatMoney(order.refunded_amount, currency)}.`
            : "Not refunded: refund the payment in your Stripe dashboard if you haven't already."}</span></p>}
        <FulfillmentActions orderId={order.id} orderRef={order.stripe_session_id.slice(-8).toUpperCase()} customer={(order.customer_name ?? address?.name ?? "").trim()} status={status} supplierRef={order.supplier_order_ref ?? null}
          tracking={{ number: order.tracking_number ?? null, carrier: order.tracking_carrier ?? null, url: order.tracking_url ?? null, emailed: !!order.tracking_email_sent_at }}
          delay={{ shipBy, originalShipBy: originalShipBy(order), notices: notices.length }} total={total} />
      </section>
    </div>
  </article>;
}

export default async function FulfillmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const owner = await ownerPage();
  const requested = (await searchParams).status;
  const status = FULFILLMENT_STATUSES.includes(requested as FulfillmentStatus) ? requested as FulfillmentStatus : "needs_ordering";
  const [store, counts, orders] = await Promise.all([getStore(), fulfillmentCounts(), listPhysicalOrders(status)]);
  const mediaBase = storefrontMediaBase();
  return <AdminShell storeName={store.name} owner={owner} active="/admin/fulfillment">
    <div className="admin-page-heading"><div><span className="eyebrow">FROM SUPPLIER TO DOORSTEP</span><h1>Fulfilment</h1><p>Order each item from its supplier, add tracking, and we&apos;ll keep the customer updated.</p></div></div>
    <nav className="fulfil-tabs" aria-label="Order status">
      {FULFILLMENT_STATUSES.map((key) => <Link key={key} href={`/admin/fulfillment?status=${key}`} className={key === status ? "active" : ""} aria-current={key === status ? "page" : undefined}>{TABS[key].label}<span>{counts[key]}</span></Link>)}
    </nav>
    {orders.length
      ? orders.map((order) => <OrderCard key={order.id} order={order} mediaBase={mediaBase} />)
      : <section className="workspace-panel"><div className="empty-state"><PackageOpen size={28} /><h3>{TABS[status].label}</h3><p>{TABS[status].empty}</p></div></section>}
  </AdminShell>;
}
