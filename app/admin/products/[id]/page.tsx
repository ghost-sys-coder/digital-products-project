import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { ownerPage } from "@/lib/auth";
import { getCatalogProduct } from "@/lib/catalog";
import { AdminShell } from "@/components/admin-shell";
import { ProductEditor } from "@/components/product-editor";
import { getDownloadAvailability } from "@/lib/product-files";

export const dynamic = "force-dynamic";
export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await ownerPage();
  const product = await getCatalogProduct((await params).id);
  if (!product) notFound();
  const downloadStatus = await getDownloadAvailability(product.storage_path);
  if (product.id === "lead-to-kickoff" && !product.templates_url) product.templates_url = process.env.L2K_TEMPLATES_URL ?? null;
  return <AdminShell active="/admin/products"><Link href="/admin/products" className="back-link"><ArrowLeft size={15} /> All products</Link><div className="admin-page-heading"><div><span className="eyebrow">THE DETAILS MAKE THE DIFFERENCE</span><h1>Edit product</h1><p>Make it useful. Make it yours.</p></div>{(await searchParams).saved && <span className="save-success" role="status"><Check size={16} /> Product saved</span>}</div><ProductEditor key={`${product.id}-${product.revision}`} product={product} id={product.id} downloadStatus={downloadStatus} /></AdminShell>;
}
