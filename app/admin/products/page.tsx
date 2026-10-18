import Link from "next/link";
import { Plus, ArrowUpRight, Package } from "lucide-react";
import { ownerPage } from "@/lib/auth";
import { listProducts } from "@/lib/catalog";
import { AdminShell } from "@/components/admin-shell";
import { formatMoney } from "@/lib/store-config";

export const dynamic = "force-dynamic";
export default async function ProductsPage() {
  await ownerPage();
  const products = await listProducts();
  return <AdminShell active="/admin/products"><div className="admin-page-heading"><div><span className="eyebrow">YOUR DIGITAL SHELF</span><h1>Products</h1><p>Useful things, ready to find their people.</p></div><Link href="/admin/products/new" className="button primary"><Plus size={17} /> Add a product</Link></div><section className="workspace-panel"><div className="panel-heading"><h2>Your collection <span className="count">{products.length}</span></h2><span className="muted">{products.filter((product) => product.status === "published").length} published</span></div>{products.length ? <div className="catalog-list">{products.map((product) => <div className="catalog-row" key={product.id}><div className="catalog-icon"><Package size={24} /></div><div className="catalog-name"><Link href={`/admin/products/${product.id}`}>{product.name}</Link><span>/p/{product.slug}</span></div><span className={`badge ${product.status}`}>{product.status === "published" ? "Published" : "Draft"}</span><strong className="catalog-price">{product.price_amount === null ? "Price not set" : formatMoney(product.price_amount, product.currency)}</strong><Link className="button secondary small" href={`/admin/products/${product.id}`}>Edit <ArrowUpRight size={14} /></Link></div>)}</div> : <div className="empty-state"><Package size={29} /><h3>A home for your first idea.</h3><p>Add a digital product to start building your collection.</p><Link href="/admin/products/new" className="button primary"><Plus size={16} /> Add a product</Link></div>}</section><p className="workspace-note">Prices and checkout are managed from here. Stripe handles the payment.</p></AdminShell>;
}
