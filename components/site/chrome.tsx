import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { CatalogProduct, Store } from "@/lib/catalog.types";
import { formatMoney } from "@/lib/store-config";
import { Monogram } from "./monogram";

// The studio's shared page furniture: header, footer and product tile, used by the homepage and product pages.
// Styles live in app/studio.css under the .vc root.

export const SUPPORT_FALLBACK = "support@veilcode.studio";

/** Cover served through next/image at a versioned path, so it is resized and converted for each screen. */
export const coverSrc = (product: CatalogProduct) => `/api/products/${encodeURIComponent(product.id)}/cover/${product.revision}`;
export const shortName = (product: CatalogProduct) => product.name.split(":")[0].trim();

/**
 * `base` is "" on the homepage (links jump within the page) and "/" elsewhere (links go back to its sections).
 * Product pages leave out the shop button so the buy button is the one call to action.
 */
export function SiteHeader({ base = "", nav = true, cta = true }: { base?: "" | "/"; nav?: boolean; cta?: boolean }) {
  return (
    <header className="vc-header" data-header>
      <div className="vc-header-inner vc-wrap">
        <Link href="/" className="vc-brand" aria-label="VeilCode Studio home">
          <Image src="/brand/veilcode-mark.svg" alt="" width={32} height={32} />
          <span>VeilCode <span>Studio</span></span>
        </Link>
        {nav && (
          <nav className="vc-nav" aria-label="Main">
            <a href={`${base}#collection`}>Collection</a>
            <a href={`${base}#why`}>Why VeilCode</a>
            <a href={`${base}#questions`}>Questions</a>
          </nav>
        )}
        {nav && cta && <a className="vc-button vc-button-sm" href={`${base}#collection`}>Shop the collection</a>}
      </div>
    </header>
  );
}

export function SiteFooter({ store, products, support, base = "" }: { store: Store; products: CatalogProduct[]; support: string; base?: "" | "/" }) {
  const listed = products.filter((product) => product.price_amount !== null).slice(0, 4);
  return (
    <footer className="vc-footer">
      <div className="vc-wrap">
        <div className="vc-footer-top">
          <div className="vc-footer-brand">
            <Image src="/brand/veilcode-mark.svg" alt="" width={40} height={40} />
            <p>{store.tagline || "Good systems. Better work."}</p>
          </div>
          <nav className="vc-footer-nav" aria-label="Footer">
            <div>
              <h3>Shop</h3>
              <a href={`${base}#collection`}>The collection</a>
              {listed.map((product) => <Link key={product.id} href={`/p/${product.slug}`}>{shortName(product)}</Link>)}
            </div>
            <div>
              <h3>Studio</h3>
              {store.website_url && <a href={store.website_url} target="_blank" rel="noopener noreferrer">veilcode.studio</a>}
              <a href={`mailto:${support}`}>Support</a>
              <Link href="/admin">Studio login</Link>
            </div>
          </nav>
        </div>
        <p className="vc-wordmark" aria-hidden="true">VeilCode</p>
        <div className="vc-footer-base">
          <span>© {new Date().getFullYear()} {store.name || "VeilCode Studio"}</span>
          <span>Secure payments by Stripe</span>
        </div>
      </div>
    </footer>
  );
}

export function ProductTile({ product, eager = false }: { product: CatalogProduct; eager?: boolean }) {
  const available = product.price_amount !== null;
  const body = (
    <>
      <div className="vc-product-stage">
        {product.cover_path
          ? <Image src={coverSrc(product)} alt={`${product.name} cover`} width={1600} height={1600} sizes="(max-width: 900px) 84vw, 44vw" loading={eager ? "eager" : "lazy"} />
          : <Monogram className="vc-product-mark" />}
      </div>
      <div className="vc-product-info">
        <h3>{product.name}</h3>
        {product.tagline && <p>{product.tagline}</p>}
        <div className="vc-product-meta">
          <span className="vc-price">{available ? formatMoney(product.price_amount!, product.currency) : "Coming soon"}</span>
          {available && <span className="vc-product-cta">View details <ArrowUpRight size={17} aria-hidden="true" /></span>}
        </div>
      </div>
    </>
  );
  return available
    ? <Link href={`/p/${product.slug}`} className="vc-product" data-reveal>{body}</Link>
    : <div className="vc-product" data-reveal>{body}</div>;
}
