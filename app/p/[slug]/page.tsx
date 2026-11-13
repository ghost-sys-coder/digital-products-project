import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, CreditCard, Download, Mail, ShieldCheck } from "lucide-react";
import { getPublicProduct, getStore, listProducts } from "@/lib/catalog";
import { formatMoney } from "@/lib/store-config";
import { CheckoutButton } from "@/components/checkout-button";
import { Monogram } from "@/components/site/monogram";
import { PageEffects } from "@/components/site/page-effects";
import { StickyBuy } from "@/components/site/sticky-buy";
import { ProductTile, SiteFooter, SiteHeader, SUPPORT_FALLBACK, coverSrc, shortName } from "@/components/site/chrome";
import { monaSans } from "../../studio-fonts";
import "../../studio.css";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const product = await getPublicProduct((await params).slug);
  return { title: product?.name ?? "Product not found", description: product?.tagline };
}

const ROOT_ID = "vc-product";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const product = await getPublicProduct((await params).slug);
  if (!product || product.price_amount === null) notFound();
  const [store, products, query] = await Promise.all([getStore(), listProducts(true, "digital"), searchParams]);
  const cancelled = query.checkout === "cancelled";
  const price = formatMoney(product.price_amount, product.currency);
  const support = store.support_email || SUPPORT_FALLBACK;
  const others = products.filter((other) => other.id !== product.id && other.price_amount !== null).slice(0, 2);
  const paragraphs = product.description.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <div id={ROOT_ID} className={`vc vc-pd-page ${monaSans.variable}`}>
      <PageEffects rootId={ROOT_ID} />
      <span className="vc-sentinel" data-top-sentinel aria-hidden="true" />
      <SiteHeader base="/" cta={false} />

      <main className="vc-wrap vc-pd">
        <Link className="vc-back" href="/#collection"><ArrowLeft size={16} aria-hidden="true" /> The collection</Link>
        <div className="vc-pd-grid">
          <div className="vc-pd-visual">
            <div className="vc-pd-stage">
              {product.cover_path
                ? <Image src={coverSrc(product)} alt={`${product.name} cover`} width={1600} height={1600} sizes="(max-width: 900px) 88vw, 52vw" loading="eager" fetchPriority="high" />
                : <Monogram className="vc-product-mark" />}
            </div>
          </div>

          <div className="vc-pd-details">
            <h1 className="vc-pd-title">{product.name}</h1>
            {product.tagline && <p className="vc-pd-tagline">{product.tagline}</p>}
            <p className="vc-pd-price"><strong>{price}</strong><span>One-time purchase in {product.currency.toUpperCase()}</span></p>
            {cancelled && <p className="vc-pd-notice" role="status">You haven’t been charged. It’s here whenever you’re ready.</p>}
            <div id="buy"><CheckoutButton productId={product.id} price={price} /></div>
            <ul className="vc-pd-assure">
              <li><Download size={18} aria-hidden="true" /> Instant download</li>
              <li><ShieldCheck size={18} aria-hidden="true" /> Secure checkout</li>
              <li><Mail size={18} aria-hidden="true" /> Real support</li>
            </ul>

            {paragraphs.length > 0 && (
              <div className="vc-pd-block vc-pd-description">
                {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </div>
            )}
            {product.includes.length > 0 && (
              <div className="vc-pd-block">
                <h2>What’s inside</h2>
                <ul className="vc-pd-includes">
                  {product.includes.map((item) => <li key={item}><span><Check size={15} aria-hidden="true" /></span>{item}</li>)}
                </ul>
              </div>
            )}
            <div className="vc-pd-block">
              <h2>How it reaches you</h2>
              <ol className="vc-pd-steps">
                <li><CreditCard size={20} aria-hidden="true" /><div><strong>Pay securely</strong><span>Checkout is handled by Stripe. No account needed.</span></div></li>
                <li><Mail size={20} aria-hidden="true" /><div><strong>Check your inbox</strong><span>Your download link arrives by email right after payment.</span></div></li>
                <li><Download size={20} aria-hidden="true" /><div><strong>Download and keep</strong><span>The link works for 14 days and up to 5 downloads.</span></div></li>
              </ol>
            </div>
            <p className="vc-pd-support">
              Questions before buying? <a href={`mailto:${support}`}>Email the studio</a>. For refund requests or problems with a purchase, email us from the address you used at checkout.
            </p>
          </div>
        </div>
      </main>

      {others.length > 0 && (
        <section className="vc-section vc-wrap" aria-labelledby="vc-more-title">
          <h2 id="vc-more-title" className="vc-heading vc-more-title" data-reveal>More from the studio</h2>
          <div className="vc-products">
            {others.map((other) => <ProductTile key={other.id} product={other} />)}
          </div>
        </section>
      )}

      <SiteFooter store={store} products={products} support={support} base="/" />
      <StickyBuy targetId="buy">
        <div className="vc-buybar-info"><strong>{shortName(product)}</strong><span>{price}</span></div>
        <CheckoutButton productId={product.id} price={price} compact />
      </StickyBuy>
    </div>
  );
}
