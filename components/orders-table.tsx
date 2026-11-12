import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import type { Order } from "@/lib/orders";
import { formatMoney } from "@/lib/store-config";
import { OrderResend } from "./order-resend";

const FULFILLMENT_LABELS = { needs_ordering: "Needs ordering", ordered: "Ordered", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" } as const;
function productName(order: Order) {
  const item = order.physical_snapshot?.items[0];
  if (item) return item.variantLabel ? `${item.name} · ${item.variantLabel} × ${item.quantity}` : `${item.name} × ${item.quantity}`;
  return order.product_snapshot?.name ?? order.product_id;
}
function status(order: Order) {
  if (order.kind === "physical") {
    const label = FULFILLMENT_LABELS[order.fulfillment_status ?? "needs_ordering"];
    return <span className={`badge ${order.fulfillment_status === "shipped" || order.fulfillment_status === "delivered" ? "published" : "pending"}`}>{label}</span>;
  }
  return <span className={`badge ${order.email_status === "sent" ? "published" : "pending"}`}>{order.email_status === "sent" ? "Email sent" : "Pending"}</span>;
}

export function OrdersTable({ orders, actions = false }: { orders: Order[]; actions?: boolean }) {
  if (!orders.length) return <div className="empty-state"><ShoppingBag size={28} /><h3>Your first sale starts here.</h3><p>When someone buys a product, their order will appear here.</p></div>;
  return <div className="table-scroll"><table className="orders-table"><thead><tr><th>Customer / product</th><th>Amount</th><th>Delivery</th><th>Date</th>{actions && <th>Support</th>}</tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.email}</strong><span>{productName(order)}</span></td><td>{order.amount_total !== null && order.currency ? formatMoney(order.amount_total, order.currency) : "—"}</td><td>{status(order)}</td><td><time dateTime={order.created_at}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(order.created_at))}</time></td>{actions && <td>{order.kind === "physical" ? <Link className="quiet-link" href={`/admin/fulfillment?status=${order.fulfillment_status ?? "needs_ordering"}#order-${order.id}`}>Manage in Fulfilment</Link> : <OrderResend email={order.email} sessionId={order.stripe_session_id} />}</td>}</tr>)}</tbody></table></div>;
}
