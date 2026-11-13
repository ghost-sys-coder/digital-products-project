import { ownerPage } from "@/lib/auth";
import { getStore, listProducts } from "@/lib/catalog";
import { recentOrders } from "@/lib/dashboard";
import { AdminShell } from "@/components/admin-shell";
import { DashboardView } from "@/components/dashboard-view";

export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const owner = await ownerPage();
  const [store, products, orders] = await Promise.all([getStore(), listProducts(), recentOrders()]);
  return <AdminShell owner={owner} active="/admin" storeName={store.name}><DashboardView products={products} orders={orders} /></AdminShell>;
}
