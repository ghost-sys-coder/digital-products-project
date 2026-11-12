import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { ownerPage } from "@/lib/auth";
import { getCatalogProduct, getStore } from "@/lib/catalog";
import { loadStoreEditor } from "@/lib/manage-stores";
import { AdminShell } from "@/components/admin-shell";
import { ProductEditor } from "@/components/product-editor";
import { StoreEditor } from "@/components/store-editor/store-editor";
import { getDownloadAvailability } from "@/lib/product-files";
import "../../store-editor.css";

export const dynamic = "force-dynamic";
export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const owner = await ownerPage();
  const [store, product] = await Promise.all([getStore(), getCatalogProduct((await params).id)]);
  if (!product) notFound();
  if (product.kind === "physical") {
    const data = await loadStoreEditor(product.id);
    return <AdminShell storeName={store.name} owner={owner} active="/admin/products"><StoreEditor key={`${product.id}-${data.product.revision}`} data={data} /></AdminShell>;
  }
  const downloadStatus = await getDownloadAvailability(product.storage_path);
  if (product.id === "lead-to-kickoff" && !product.templates_url) product.templates_url = process.env.L2K_TEMPLATES_URL ?? null;
  return <AdminShell storeName={store.name} owner={owner} active="/admin/products"><Link href="/admin/products" className="back-link"><ArrowLeft size={15} /> All products</Link><div className="admin-page-heading"><div><span className="eyebrow">THE DETAILS MAKE THE DIFFERENCE</span><h1>Edit product</h1><p>Make it useful. Make it yours.</p></div>{(await searchParams).saved && <span className="save-success" role="status"><Check size={16} /> Product saved</span>}</div><ProductEditor key={`${product.id}-${product.revision}`} product={product} id={product.id} downloadStatus={downloadStatus} /></AdminShell>;
}
