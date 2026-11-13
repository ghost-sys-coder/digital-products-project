import { ownerPage } from "@/lib/auth";
import { getStore } from "@/lib/catalog";
import { listConnections, mcpResource } from "@/lib/mcp/oauth";
import { recentActivity } from "@/lib/mcp/activity";
import { AdminShell } from "@/components/admin-shell";
import { ConnectionsView } from "@/components/connections/connections-view";
import "../connections.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connections" };

export default async function ConnectionsPage() {
  const owner = await ownerPage();
  const [store, connections, activity] = await Promise.all([getStore(), listConnections(), recentActivity()]);
  return <AdminShell owner={owner} active="/admin/connections" storeName={store.name}>
    <div className="admin-page-heading">
      <div><span className="eyebrow">YOUR ASSISTANTS</span><h1>Connections</h1><p>Let Claude, ChatGPT, Codex and Claude Code read the store, research products and build drafts.</p></div>
    </div>
    <ConnectionsView endpoint={mcpResource()} initialConnections={connections} activity={activity} />
  </AdminShell>;
}
