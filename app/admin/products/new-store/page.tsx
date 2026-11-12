import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ownerPage } from "@/lib/auth";
import { getStore } from "@/lib/catalog";
import { AdminShell } from "@/components/admin-shell";
import { NewStoreForm } from "@/components/store-editor/new-store-form";
import "../../store-editor.css";

export const dynamic = "force-dynamic";
export default async function NewStorePage() {
  const owner = await ownerPage();
  const store = await getStore();
  return <AdminShell storeName={store.name} owner={owner} active="/admin/products">
    <Link href="/admin/products" className="back-link"><ArrowLeft size={15} /> All products</Link>
    <div className="admin-page-heading"><div><span className="eyebrow">A STORE FOR ONE GREAT PRODUCT</span><h1>New physical store</h1><p>A premium single-product page, shipped from your supplier.</p></div></div>
    <NewStoreForm />
  </AdminShell>;
}
