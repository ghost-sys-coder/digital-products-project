import { notFound } from "next/navigation";
import { Check, Download, Mail, ShieldCheck } from "lucide-react";
import { getPublicProduct, getStore } from "@/lib/catalog";
import { BackToStore, ProductCover, StoreFooter, StoreHeader } from "@/components/store";
import { CheckoutButton } from "@/components/checkout-button";
import { formatMoney } from "@/lib/store-config";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const product = await getPublicProduct((await params).slug);
  return { title: product?.name ?? "Product not found", description: product?.tagline };
}
export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const product = await getPublicProduct((await params).slug);
  if (!product || product.price_amount === null) notFound();
  const store = await getStore();
  const cancelled = (await searchParams).checkout === "cancelled";
  return <div className="store-page"><StoreHeader store={store} /><main className="product-page"><BackToStore /><div className="product-detail-grid"><div className="product-visual"><ProductCover product={product} large /><div className="product-assurance"><span><Download size={16} /> Digital download</span><span><ShieldCheck size={16} /> Secure checkout</span></div></div><div className="product-details"><span className="eyebrow">THE VEILCODE COLLECTION</span><h1>{product.name}</h1><p className="product-tagline">{product.tagline}</p><div className="product-price">{formatMoney(product.price_amount, product.currency)}<span>One-time purchase · {product.currency.toUpperCase()}</span></div>{cancelled && <p className="notice">You haven&apos;t been charged. Your kit is here whenever you&apos;re ready.</p>}<CheckoutButton productId={product.id} price={formatMoney(product.price_amount, product.currency)} /><div className="product-description">{product.description.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>{product.includes.length > 0 && <div className="included"><h2>Inside the kit</h2><ul>{product.includes.map((item) => <li key={item}><Check size={17} />{item}</li>)}</ul></div>}<div className="delivery-explainer"><Mail size={22} /><div><h3>From checkout to your inbox.</h3><p>We&apos;ll email your download link after payment. It works for 14 days and up to 5 downloads.</p></div></div><p className="support-note">Questions before buying? <a href={`mailto:${store.support_email}`}>Get in touch</a>. For purchase issues or refund requests, contact the studio with your order email.</p></div></div></main><StoreFooter store={store} /></div>;
}
