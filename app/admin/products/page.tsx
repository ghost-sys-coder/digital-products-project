import Link from "next/link";
import { Plus, ArrowUpRight, Package, Store } from "lucide-react";
import { ownerPage } from "@/lib/auth";
import { getStore, listProducts } from "@/lib/catalog";
import { getSupabase } from "@/lib/supabase";
import { AdminShell } from "@/components/admin-shell";
import { formatMoney, STORE_ID } from "@/lib/store-config";
import { THEME_TOKENS, type ThemeId } from "@/lib/store-themes";

export const dynamic = "force-dynamic";

/** The lowest active variant price of each physical store, for the list. */
async function storePrices() {
  const { data, error } = await getSupabase().from("product_variants").select("product_id, price_amount").eq("store_id", STORE_ID).eq("active", true);
  if (error) throw new Error("Could not load variant prices");
  const lowest = new Map<string, number>();
  for (const row of (data ?? []) as { product_id: string; price_amount: number }[]) {
    lowest.set(row.product_id, Math.min(row.price_amount, lowest.get(row.product_id) ?? Infinity));
  }
  return lowest;
}

export default async function ProductsPage() {
  const owner = await ownerPage();
  const [store, products, prices] = await Promise.all([getStore(), listProducts(), storePrices()]);
  return <AdminShell storeName={store.name} owner={owner} active="/admin/products">
    <div className="admin-page-heading">
      <div><span className="eyebrow">YOUR SHELF</span><h1>Products</h1><p>Digital downloads and single-product stores, all in one place.</p></div>
      <div className="admin-heading-actions">
        <Link href="/admin/products/new" className="button secondary"><Plus size={17} /> Digital product</Link>
        <Link href="/admin/products/new-store" className="button primary"><Store size={17} /> New store</Link>
      </div>
    </div>
    <section className="workspace-panel">
      <div className="panel-heading"><h2>Your collection <span className="count">{products.length}</span></h2><span className="muted">{products.filter((product) => product.status === "published").length} published</span></div>
      {products.length ? <div className="catalog-list">{products.map((product) => {
        const physical = product.kind === "physical";
        const lowest = prices.get(product.id);
        const price = physical ? (lowest === undefined ? "No price yet" : `from ${formatMoney(lowest, product.currency)}`)
          : product.price_amount === null ? "Price not set" : formatMoney(product.price_amount, product.currency);
        return <div className="catalog-row" key={product.id}>
          <div className="catalog-icon">{physical ? <Store size={24} /> : <Package size={24} />}</div>
          <div className="catalog-name">
            <Link href={`/admin/products/${product.id}`}>{product.name}</Link>
            <span>{physical ? `Store · /s/${product.slug}${product.theme && product.theme in THEME_TOKENS ? ` · ${THEME_TOKENS[product.theme as ThemeId].label}` : ""}` : `Digital · /p/${product.slug}`}</span>
          </div>
          <span className={`badge ${product.status}`}>{product.status === "published" ? (physical ? "Live" : "Published") : "Draft"}</span>
          <strong className="catalog-price">{price}</strong>
          <Link className="button secondary small" href={`/admin/products/${product.id}`}>Edit <ArrowUpRight size={14} /></Link>
        </div>;
      })}</div> : <div className="empty-state"><Package size={29} /><h3>A home for your first idea.</h3><p>Add a digital product or open a store for a physical one.</p><Link href="/admin/products/new-store" className="button primary"><Store size={16} /> New store</Link></div>}
    </section>
    <p className="workspace-note">Prices and checkout are managed from here. Stripe handles the payment.</p>
  </AdminShell>;
}
