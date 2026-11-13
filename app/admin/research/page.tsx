import { ownerPage } from "@/lib/auth";
import { getStore } from "@/lib/catalog";
import { listResearch } from "@/lib/research";
import { metaConfigured } from "@/lib/meta-ads";
import { cjConfigured } from "@/lib/cj";
import { AdminShell } from "@/components/admin-shell";
import { ResearchWorkspace } from "@/components/research/research-workspace";
import "../research.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Product research" };

export default async function ResearchPage() {
  const owner = await ownerPage();
  const [store, items] = await Promise.all([getStore(), listResearch()]);
  return <AdminShell owner={owner} active="/admin/research" storeName={store.name}>
    <div className="admin-page-heading">
      <div><span className="eyebrow">FIND THE NEXT WINNER</span><h1>Product research</h1><p>Spot what&apos;s selling, check the numbers, then turn it into a store.</p></div>
    </div>
    <ResearchWorkspace initialItems={items} meta={metaConfigured()} cj={cjConfigured()} />
  </AdminShell>;
}
