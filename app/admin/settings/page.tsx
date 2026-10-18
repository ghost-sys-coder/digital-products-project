import { ownerPage } from "@/lib/auth";
import { getStore } from "@/lib/catalog";
import { AdminShell } from "@/components/admin-shell";
import { SettingsForm } from "@/components/settings-form";
import { PaymentSettings } from "@/components/payment-settings";
import { assertStoreOwner, connectEnabled, connectConfigured, currentStripeConnection, stripeLivemode } from "@/lib/payment-connections";

export const dynamic = "force-dynamic";
export default async function Settings({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const owner = await ownerPage();
  await assertStoreOwner(owner.id);
  const [store, connection, params] = await Promise.all([getStore(), currentStripeConnection(), searchParams]);
  const result = ["connected", "restricted", "cancelled", "failed"].includes(params.payment ?? "") ? params.payment : undefined;
  return <AdminShell owner={owner} active="/admin/settings" storeName={store.name}><div className="admin-page-heading"><div><span className="eyebrow">MAKE YOURSELF AT HOME</span><h1>Store settings</h1><p>A few details that make this space yours.</p></div></div><SettingsForm store={store} /><PaymentSettings enabled={connectEnabled()} configured={connectConfigured()} livemode={stripeLivemode()} connection={connection ? { accountId: connection.external_account_id, status: connection.status, country: connection.country, requirementsCount: connection.requirements.length } : null} result={result} /></AdminShell>;
}
