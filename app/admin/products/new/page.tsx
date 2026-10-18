import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ownerPage } from "@/lib/auth";
import { AdminShell } from "@/components/admin-shell";
import { ProductEditor } from "@/components/product-editor";

export const dynamic = "force-dynamic";
export default async function NewProduct() {
  await ownerPage();
  return <AdminShell active="/admin/products"><Link href="/admin/products" className="back-link"><ArrowLeft size={15} /> All products</Link><div className="admin-page-heading"><div><span className="eyebrow">FROM IDEA TO INBOX</span><h1>Something worth sharing.</h1><p>Give your next digital product a home.</p></div></div><ProductEditor id={randomUUID()} product={null} /></AdminShell>;
}
