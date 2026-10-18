import {
  ArrowDown,
  ArrowUpRight,
  FileText,
  Download,
  Sparkles,
} from "lucide-react";
import { getStore, listProducts } from "@/lib/catalog";
import { StoreHeader, StoreFooter, ProductCard } from "@/components/store";

export const dynamic = "force-dynamic";
export default async function Home() {
  let store;
  let products;
  try {
    [store, products] = await Promise.all([getStore(), listProducts(true)]);
  } catch {
    return (
      <div className="store-page">
        <StoreHeader />
        <main className="store-setup">
          <span className="eyebrow">THE STUDIO SHOP</span>
          <h1>
            Good things
            <br />
            are taking shape.
          </h1>
          <p>
            Practical tools for independent creatives. Our shop will be here
            soon.
          </p>
          <a className="button primary" href="mailto:support@veilcode.studio">
            Get in touch <ArrowUpRight size={17} />
          </a>
        </main>
        <StoreFooter />
      </div>
    );
  }
  return (
    <div className="store-page">
      <StoreHeader store={store} />
      <main>
        <section className="store-intro">
          <div className="intro-copy">
            <div className="eyebrow">
              <span className="tiny-square" /> THE INDEPENDENT STUDIO SHOP
            </div>
            <h1>{store.tagline || "Good systems. Better work."}</h1>
            <p>{store.bio}</p>
            <a className="text-link" href="#collection">
              Explore the collection <ArrowDown size={17} />
            </a>
          </div>
          <div className="intro-note">
            <span className="note-index">01 / THE APPROACH</span>
            <FileText size={28} />
            <p>
              A little structure.
              <br />A lot more headspace.
            </p>
            <span className="note-foot">
              Thoughtful tools for the work behind your work.
            </span>
          </div>
        </section>
        <section id="collection" className="collection">
          <div className="section-heading">
            <div>
              <span className="eyebrow">MADE TO BE USED</span>
              <h2>
                The collection
                <span className="count">
                  {String(products.length).padStart(2, "0")}
                </span>
              </h2>
            </div>
            <span className="collection-note">
              <Download size={15} /> Digital products. Yours to keep.
            </span>
          </div>
          {products.length ? (
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="empty-collection">
              <Sparkles size={26} />
              <h3>The first toolkit is on its way.</h3>
              <p>
                We&apos;re putting the finishing touches on something useful.
                Check back soon.
              </p>
            </div>
          )}
        </section>
        <section className="studio-letter">
          <span className="eyebrow">A NOTE FROM THE STUDIO</span>
          <h2>
            More doing.
            <br />
            Less figuring it out.
          </h2>
          <p>
            Every resource here is built around a simple idea: your process
            should make your work easier. Clear guidance, useful templates, and
            a place to start.
          </p>
          <a className="quiet-link" href={`mailto:${store.support_email}`}>
            Have a question? <ArrowUpRight size={16} />
          </a>
        </section>
      </main>
      <StoreFooter store={store} />
    </div>
  );
}
