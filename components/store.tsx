import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, FileText, Package, ArrowLeft, Mail } from "lucide-react";
import type { CatalogProduct, Store } from "@/lib/catalog.types";
import { formatMoney } from "@/lib/store-config";

export function Brand({ name = "VeilCode Studio" }: { name?: string }) {
  return <Link href="/" className="brand"><Image className="brand-mark" src="/brand/veilcode-mark.svg" alt="" width={34} height={34} /><span>{name}</span></Link>;
}
export function StoreHeader({ store }: { store?: Store }) {
  return <header className="store-header"><Brand name={store?.name} /><a className="quiet-link" href={`mailto:${store?.support_email ?? "support@veilcode.studio"}`}>Get in touch <ArrowUpRight size={15} /></a></header>;
}
export function StoreFooter({ store }: { store?: Store }) {
  return <footer className="store-footer"><span>Made with care by {store?.name ?? "VeilCode Studio"}.</span><div>{store?.website_url && <a href={store.website_url} target="_blank" rel="noopener noreferrer">Visit the studio <ArrowUpRight size={13} /></a>}<a href={`mailto:${store?.support_email ?? "support@veilcode.studio"}`}><Mail size={14} /> Support</a><Link href="/admin">Studio login <ArrowUpRight size={13} /></Link></div></footer>;
}
export function ProductCover({ product, large = false }: { product: CatalogProduct; large?: boolean }) {
  if (product.cover_path) return <div className={`product-cover uploaded ${large ? "large" : ""}`}><Image src={`/api/products/${product.id}/cover?v=${product.revision}`} alt={`${product.name} cover`} width={800} height={640} unoptimized /></div>;
  return <div className={`product-cover ${large ? "large" : ""}`} aria-hidden="true">
    <div className="cover-label"><span>VEILCODE STUDIO</span><ArrowUpRight size={20} /></div>
    <div className="cover-sheet"><span className="cover-edition">THE PRACTICAL COLLECTION</span><strong>{product.name.split(":")[0]}</strong><span className="cover-rule" /><span>Less guesswork.<br />More good work.</span><FileText className="cover-icon" size={25} /></div>
    <div className="cover-bottom"><span>DIGITAL TOOLKIT</span><Package size={17} /></div>
  </div>;
}
export function ProductCard({ product }: { product: CatalogProduct }) {
  return <Link href={`/p/${product.slug}`} className="product-card">
    <ProductCover product={product} />
    <div className="product-card-info"><span className="eyebrow">GUIDES & TEMPLATES</span><h3>{product.name}</h3><p>{product.tagline}</p><div className="product-card-bottom"><span>{product.price_amount === null ? "Coming soon" : formatMoney(product.price_amount, product.currency)}</span><span className="circle-arrow"><ArrowUpRight size={19} /></span></div></div>
  </Link>;
}
export function BackToStore() { return <Link className="back-link" href="/"><ArrowLeft size={16} /> Back to the studio</Link>; }
