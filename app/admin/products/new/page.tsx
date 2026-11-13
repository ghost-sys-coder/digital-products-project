import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ownerPage } from "@/lib/auth";
import { getStore } from "@/lib/catalog";
import { relatedChoices } from "@/lib/related-products";
import { AdminShell } from "@/components/admin-shell";
import { ProductEditor } from "@/components/product-editor";

export const dynamic = "force-dynamic";
export default async function NewProduct() {
  const owner = await ownerPage();
  const [store, related] = await Promise.all([getStore(), relatedChoices(null)]);
  return <AdminShell storeName={store.name} owner={owner} active="/admin/products"><Link href="/admin/products" className="back-link"><ArrowLeft size={15} /> All products</Link><div className="admin-page-heading"><div><span className="eyebrow">FROM IDEA TO INBOX</span><h1>Something worth sharing.</h1><p>Give your next digital product a home.</p></div></div><ProductEditor id={randomUUID()} product={null} related={related} /></AdminShell>;
}
