import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowLeft, ArrowUpRight, Check, CreditCard, Download, Eye, Mail, ShieldCheck } from "lucide-react";
import { getDigitalPage, getStore, listProducts } from "@/lib/catalog";
import { relatedProducts } from "@/lib/related-products";
import type { CatalogProduct } from "@/lib/catalog.types";
import { formatMoney } from "@/lib/store-config";
import { CheckoutButton } from "@/components/checkout-button";
import { Monogram } from "@/components/site/monogram";
import { PageEffects } from "@/components/site/page-effects";
import { StickyBuy } from "@/components/site/sticky-buy";
import { SiteFooter, SiteHeader, SUPPORT_FALLBACK, coverSrc, shortName } from "@/components/site/chrome";
import { monaSans } from "../../studio-fonts";
import "../../studio.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

// Shared by generateMetadata and the page so a request loads the product once.
const loadProduct = cache((slug: string, preview: boolean) => getDigitalPage(slug, preview));
async function load({ params, searchParams }: Params) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return { product: await loadProduct(slug, query.preview === "1"), query };
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const { product } = await load(props);
  if (!product) return { title: "Product not found" };
  return {
    title: product.name, description: product.tagline || undefined,
    ...(product.status !== "published" ? { robots: { index: false, follow: false } } : {}),
  };
}

const ROOT_ID = "vc-product";

export default async function ProductPage(props: Params) {
  const { product, query } = await load(props);
  const draft = product?.status !== "published";
  if (!product || (!draft && product.price_amount === null)) notFound();
  const [store, products] = await Promise.all([getStore(), listProducts(true, "digital")]);
  const cancelled = query.checkout === "cancelled";
  const price = product.price_amount === null ? "Price not set" : formatMoney(product.price_amount, product.currency);
  const support = store.support_email || SUPPORT_FALLBACK;
  const related = relatedProducts(product, products);
  const paragraphs = product.description.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  // A draft's cover is owner-only, so it can't go through the image optimizer, which fetches without cookies.
  const cover = draft ? `/api/products/${encodeURIComponent(product.id)}/cover?preview=1&v=${product.revision}` : coverSrc(product);

  return (
    <div id={ROOT_ID} className={`vc vc-pd-page ${monaSans.variable}`}>
      <PageEffects rootId={ROOT_ID} />
      <span className="vc-sentinel" data-top-sentinel aria-hidden="true" />
      <SiteHeader base="/" cta={false} />

      <main className="vc-wrap vc-pd">
        {draft && (
          <div className="vc-pd-draft" role="status">
            <Eye size={18} aria-hidden="true" />
            <p><strong>Draft preview.</strong> Only you can see this page. Publish the product to start selling.</p>
            <Link href={`/admin/products/${encodeURIComponent(product.id)}`}>Back to the editor</Link>
          </div>
        )}
        <Link className="vc-back" href="/#collection"><ArrowLeft size={16} aria-hidden="true" /> The collection</Link>
        <div className="vc-pd-grid">
          <div className="vc-pd-visual">
            <div className="vc-pd-stage">
              {product.cover_path
                ? <Image src={cover} alt={`${product.name} cover`} width={1600} height={1600} sizes="(max-width: 900px) 88vw, 52vw" loading="eager" fetchPriority="high" unoptimized={draft} />
                : <Monogram className="vc-product-mark" />}
            </div>
          </div>

          <div className="vc-pd-details">
            <h1 className="vc-pd-title">{product.name}</h1>
            {product.tagline && <p className="vc-pd-tagline">{product.tagline}</p>}
            <p className="vc-pd-price"><strong>{price}</strong><span>One-time purchase in {product.currency.toUpperCase()}</span></p>
            {cancelled && <p className="vc-pd-notice" role="status">You haven’t been charged. It’s here whenever you’re ready.</p>}
            <div id="buy">
              {draft
                ? <button type="button" className="vc-button vc-buy-button is-draft" disabled>Checkout opens once published</button>
                : <CheckoutButton productId={product.id} price={price} />}
            </div>
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

      {related.length > 0 && (
        <section className="vc-related vc-wrap" aria-labelledby="vc-related-title">
          <div className="vc-related-head" data-reveal>
            <p className="vc-eyebrow">Pairs well with</p>
            <h2 id="vc-related-title">You might also like</h2>
          </div>
          <div className="vc-related-grid">
            {related.map((other, index) => <RelatedTile key={other.id} product={other} delay={index} />)}
          </div>
        </section>
      )}

      <SiteFooter store={store} products={products} support={support} base="/" />
      {!draft && (
        <StickyBuy targetId="buy">
          <div className="vc-buybar-info"><strong>{shortName(product)}</strong><span>{price}</span></div>
          <CheckoutButton productId={product.id} price={price} compact />
        </StickyBuy>
      )}
    </div>
  );
}

/** A smaller card than the homepage's, so suggestions never compete with the product above them. */
function RelatedTile({ product, delay }: { product: CatalogProduct; delay: number }) {
  return (
    <Link href={`/p/${product.slug}`} className="vc-related-card" data-reveal data-delay={delay % 2 ? "1" : undefined}>
      <div className="vc-related-thumb">
        {product.cover_path
          ? <Image src={coverSrc(product)} alt="" fill sizes="(max-width: 600px) 96px, (max-width: 900px) 44vw, 22vw" />
          : <Monogram className="vc-product-mark" />}
      </div>
      <div className="vc-related-info">
        <h3>{product.name}</h3>
        {product.tagline && <p>{product.tagline}</p>}
        <span className="vc-related-price">{formatMoney(product.price_amount!, product.currency)} <ArrowUpRight size={16} aria-hidden="true" /></span>
      </div>
    </Link>
  );
}
