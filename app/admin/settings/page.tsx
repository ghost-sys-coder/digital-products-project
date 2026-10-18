import { ownerPage } from "@/lib/auth";
import { getStore } from "@/lib/catalog";
import { AdminShell } from "@/components/admin-shell";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";
export default async function Settings() {
  await ownerPage();
  const store = await getStore();
  return <AdminShell active="/admin/settings" storeName={store.name}><div className="admin-page-heading"><div><span className="eyebrow">MAKE YOURSELF AT HOME</span><h1>Store settings</h1><p>A few details that make this space yours.</p></div></div><SettingsForm store={store} /></AdminShell>;
}
