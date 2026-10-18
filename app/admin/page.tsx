import Link from "next/link";
import { ArrowUpRight, Plus, Package, CheckCircle2, ArrowRight } from "lucide-react";
import { ownerPage } from "@/lib/auth";
import { getStore, listProducts } from "@/lib/catalog";
import { recentOrders } from "@/lib/dashboard";
import { formatMoney } from "@/lib/store-config";
import { AdminShell } from "@/components/admin-shell";
import { OrdersTable } from "@/components/orders-table";

export const dynamic = "force-dynamic";
export default async function Dashboard() {
  await ownerPage();
  const [store, products, orders] = await Promise.all([getStore(), listProducts(), recentOrders()]);
  const totals = new Map<string, number>();
  for (const order of orders) if (order.currency) totals.set(order.currency, (totals.get(order.currency) ?? 0) + (order.amount_total ?? 0));
  const published = products.filter((product) => product.status === "published").length;
  return <AdminShell active="/admin" storeName={store.name}><div className="admin-page-heading"><div><span className="eyebrow">YOUR STUDIO, AT A GLANCE</span><h1>Good to see you.</h1><p>Here&apos;s how things are taking shape.</p></div><Link href="/admin/products/new" className="button primary"><Plus size={17} /> Add a product</Link></div><div className="metric-grid"><div className="metric"><span>Gross sales</span><strong>{totals.size ? [...totals].map(([currency, total]) => formatMoney(total, currency)).join(" · ") : "—"}</strong><small>Latest {orders.length} orders · before refunds & fees</small></div><div className="metric"><span>Orders</span><strong>{orders.length}{orders.length === 100 ? "+" : ""}</strong><small>Latest 100 purchases</small></div><div className="metric"><span>Published products</span><strong>{String(published).padStart(2, "0")}</strong><small>{products.length} in your collection</small></div><div className="metric"><span>Awaiting delivery</span><strong>{orders.filter((order) => order.email_status === "pending").length}</strong><small>Within the latest 100 orders</small></div></div>
    <section className="workspace-panel launch-panel"><div className="launch-icon"><Package size={28} /></div><div><span className="eyebrow">YOUR NEXT GOOD IDEA</span><h2>{published ? "Room for something new." : "Make your first product official."}</h2><p>{published ? "Create a new resource, give it a home, and share it with your audience." : "Add your download, set a price, and publish. Checkout and delivery are handled for you."}</p></div><Link className="text-link" href="/admin/products">Manage products <ArrowRight size={17} /></Link></section>
    <section className="workspace-panel"><div className="panel-heading"><div><h2>Recent orders</h2><p>The people putting your work to use.</p></div><Link href="/admin/orders" className="quiet-link">View orders <ArrowUpRight size={15} /></Link></div><OrdersTable orders={orders.slice(0, 5)} /></section><div className="workspace-note"><CheckCircle2 size={16} /> Payments are processed by Stripe. Paid orders trigger secure email delivery.</div></AdminShell>;
}
