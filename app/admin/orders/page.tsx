import { Download } from "lucide-react";
import { ownerPage } from "@/lib/auth";
import { recentOrders } from "@/lib/dashboard";
import { getStore } from "@/lib/catalog";
import { AdminShell } from "@/components/admin-shell";
import { OrdersTable } from "@/components/orders-table";

export const dynamic = "force-dynamic";
export default async function OrdersPage() {
  const owner = await ownerPage();
  const [store, orders] = await Promise.all([getStore(), recentOrders(100)]);
  return <AdminShell storeName={store.name} owner={owner} active="/admin/orders"><div className="admin-page-heading"><div><span className="eyebrow">FROM YOUR STUDIO TO THEIR INBOX</span><h1>Orders</h1><p>Your latest 100 purchases and their delivery status.</p></div><a href="/api/admin/orders/export" className="button secondary"><Download size={17} /> Export recent CSV</a></div><section className="workspace-panel"><div className="panel-heading"><h2>Purchase history</h2><span className="muted">{orders.length} orders shown</span></div><OrdersTable orders={orders} actions /></section><p className="workspace-note">Amounts are gross payments. Process refunds in Stripe; refund and dispute statuses are not included here.</p></AdminShell>;
}
