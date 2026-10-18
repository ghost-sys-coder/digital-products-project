import { ShoppingBag } from "lucide-react";
import type { Order } from "@/lib/orders";
import { formatMoney } from "@/lib/store-config";
import { OrderResend } from "./order-resend";

export function OrdersTable({ orders, actions = false }: { orders: Order[]; actions?: boolean }) {
  if (!orders.length) return <div className="empty-state"><ShoppingBag size={28} /><h3>Your first sale starts here.</h3><p>When someone buys a product, their order will appear here.</p></div>;
  return <div className="table-scroll"><table className="orders-table"><thead><tr><th>Customer / product</th><th>Amount</th><th>Delivery</th><th>Date</th>{actions && <th>Support</th>}</tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.email}</strong><span>{order.product_snapshot?.name ?? order.product_id}</span></td><td>{order.amount_total !== null && order.currency ? formatMoney(order.amount_total, order.currency) : "—"}</td><td><span className={`badge ${order.email_status === "sent" ? "published" : "pending"}`}>{order.email_status === "sent" ? "Email sent" : "Pending"}</span></td><td><time dateTime={order.created_at}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(order.created_at))}</time></td>{actions && <td><OrderResend email={order.email} sessionId={order.stripe_session_id} /></td>}</tr>)}</tbody></table></div>;
}
