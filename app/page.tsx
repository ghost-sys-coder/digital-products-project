import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ListChecks, Mail, PencilLine, Plus, Repeat, ShieldCheck, Sparkles, Wallet, Zap } from "lucide-react";
import { getStore, listProducts } from "@/lib/catalog";
import { listStoreCards, type StoreCard } from "@/lib/storefront";
import { homePhotos } from "@/lib/home-photos";
import type { CatalogProduct, Store } from "@/lib/catalog.types";
import { formatMoney } from "@/lib/store-config";
import { HeroStage } from "@/components/site/hero-stage";
import { PageEffects } from "@/components/site/page-effects";
import { Monogram } from "@/components/site/monogram";
import { ProductTile, SiteFooter, SiteHeader, SUPPORT_FALLBACK, coverSrc } from "@/components/site/chrome";
import { monaSans } from "./studio-fonts";
import "./studio.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "VeilCode Studio | Made to be used" },
  description: "Ready-to-run business systems and carefully chosen products from VeilCode Studio, an independent studio.",
};

const ROOT_ID = "vc-home";

export default async function Home() {
  let store: Store;
  let products: CatalogProduct[];
  let goods: StoreCard[];
  try {
    [store, products, goods] = await Promise.all([
      getStore(),
      listProducts(true, "digital"),
      // A problem with the physical stores must never take the rest of the homepage down.
      listStoreCards().catch((cause) => { console.error("Homepage stores unavailable", cause); return []; }),
    ]);
  } catch {
    return <Unavailable />;
  }
  const covers = products.filter((product) => product.cover_path);
  const photos = homePhotos();
  const nightPhoto = !goods.length ? photos.night : undefined;
  const support = store.support_email || SUPPORT_FALLBACK;

  return (
    <div id={ROOT_ID} className={`vc ${monaSans.variable}`}>
      <PageEffects rootId={ROOT_ID} />
      <span className="vc-sentinel" data-top-sentinel aria-hidden="true" />
      <SiteHeader />

      <main>
        <section className="vc-hero vc-wrap" aria-labelledby="vc-hero-title">
          <div className="vc-hero-copy">
            <p className="vc-eyebrow">Independent product studio</p>
            <h1 id="vc-hero-title" className="vc-display"><span>Made to</span> <span>be used.</span></h1>
            <p className="vc-lede">Ready-to-run business systems and carefully chosen products from an independent studio. Clear, practical and beautifully made.</p>
            <div className="vc-actions">
              <a className="vc-button" href="#collection">Shop the collection <ArrowRight size={18} aria-hidden="true" /></a>
              <a className="vc-text-link" href="#why">Why VeilCode</a>
            </div>
          </div>
          <HeroStage>
            {covers.length ? covers.slice(0, 2).map((product, index) => (
              <div key={product.id} className={`vc-shot vc-shot-${index ? "b" : "a"}`} data-single={covers.length === 1 || undefined}>
                <div className="vc-shot-depth">
                  <Image src={coverSrc(product)} alt={`${product.name} cover`} width={1600} height={1600}
                    sizes="(max-width: 900px) 70vw, 34vw" loading={index ? "lazy" : "eager"} fetchPriority={index ? "auto" : "high"} />
                </div>
              </div>
            )) : <Monogram className="vc-stage-mark" />}
          </HeroStage>
        </section>

        <section className="vc-proof vc-wrap" aria-label="Buying from the studio" data-reveal>
          <ul>
            <li><span className="vc-proof-icon"><Zap size={19} aria-hidden="true" /></span><div><strong>Instant delivery</strong><span>Your download link arrives by email right after payment.</span></div></li>
            <li><span className="vc-proof-icon"><Wallet size={19} aria-hidden="true" /></span><div><strong>One-time price</strong><span>Pay once. No subscription and no account to create.</span></div></li>
            <li><span className="vc-proof-icon"><ShieldCheck size={19} aria-hidden="true" /></span><div><strong>Secure checkout</strong><span>Payments are processed by Stripe.</span></div></li>
            <li><span className="vc-proof-icon"><Mail size={19} aria-hidden="true" /></span><div><strong>Real support</strong><span>Questions go straight to the studio.</span></div></li>
          </ul>
        </section>

        <section id="collection" className="vc-section vc-wrap" aria-labelledby="vc-collection-title">
          <div className="vc-section-head" data-reveal>
            <h2 id="vc-collection-title" className="vc-heading">The collection</h2>
            <p className="vc-body">Complete systems for the work behind your work. Download today and put them to use this week.</p>
          </div>
          {products.length ? (
            <div className="vc-products">
              {products.map((product, index) => <ProductTile key={product.id} product={product} eager={index === 0 && !covers.length} />)}
            </div>
          ) : (
            <div className="vc-empty" data-reveal>
              <Sparkles size={24} aria-hidden="true" />
              <h3>The first system is almost ready.</h3>
              <p>We are putting the finishing touches on it. Check back soon.</p>
            </div>
          )}
        </section>

        <section id="why" className="vc-section vc-wrap" aria-labelledby="vc-why-title">
          <h2 id="vc-why-title" className="vc-heading vc-why-title" data-reveal>Built to work on day one.</h2>
          <div className="vc-bento">
            <article className="vc-cell vc-cell-studio" data-reveal>
              <Monogram className="vc-cell-mark" />
              <div>
                <h3>Made by a working studio</h3>
                <p>Our systems come out of real projects, then get refined until anyone can pick them up and use them.</p>
              </div>
            </article>
            <article className="vc-cell vc-cell-edit" data-reveal data-delay="1">
              {photos.templates ? (
                <div className="vc-cell-photo">
                  <Image src={photos.templates.src} alt={photos.templates.alt} fill sizes="(max-width: 900px) 92vw, 52vw" />
                </div>
              ) : covers.length ? (
                <div className="vc-cell-photo is-cover">
                  <Image src={coverSrc(covers[0])} alt="" fill sizes="(max-width: 900px) 92vw, 52vw" />
                </div>
              ) : <PencilLine className="vc-cell-icon" size={26} aria-hidden="true" />}
              <div>
                <h3>Templates you can edit</h3>
                <p>Swap in your name, your prices and your voice. Everything is ready to adapt.</p>
              </div>
            </article>
            <article className="vc-cell vc-cell-steps" data-reveal>
              <ListChecks className="vc-cell-icon" size={26} aria-hidden="true" />
              <div>
                <h3>Step by step</h3>
                <p>Work through it in order, with checklists so nothing gets missed.</p>
              </div>
            </article>
            <article className="vc-cell vc-cell-reuse" data-reveal data-delay="1">
              <Repeat className="vc-cell-icon" size={26} aria-hidden="true" />
              <div>
                <h3>Use it on every project</h3>
                <p>Built to be reused. Run the same process for each new client or team, and refine it as you go.</p>
              </div>
            </article>
          </div>
        </section>

        {photos.freelancer && photos.manager && (
          <section className="vc-section vc-wrap" aria-labelledby="vc-for-title">
            <h2 id="vc-for-title" className="vc-heading vc-for-title" data-reveal>Made for the people who keep work moving.</h2>
            <div className="vc-for">
              <figure className="vc-for-card" data-reveal>
                <div className="vc-for-photo"><Image src={photos.freelancer.src} alt={photos.freelancer.alt} fill sizes="(max-width: 900px) 92vw, 46vw" /></div>
                <figcaption><h3>Freelancers and small agencies</h3><p>Win the work, then start every project properly.</p></figcaption>
              </figure>
              <figure className="vc-for-card" data-reveal data-delay="1">
                <div className="vc-for-photo"><Image src={photos.manager.src} alt={photos.manager.alt} fill sizes="(max-width: 900px) 92vw, 46vw" /></div>
                <figcaption><h3>Managers and team leads</h3><p>Clear routines that help a team do its best work.</p></figcaption>
              </figure>
            </div>
          </section>
        )}

        <section className="vc-statement vc-wrap" aria-label="From the studio">
          <p className="vc-statement-line" data-reveal>More doing. <span>Less figuring it out.</span></p>
          {store.bio && <p className="vc-body" data-reveal>{store.bio}</p>}
          {photos.desk && (
            <div className="vc-statement-photo" data-reveal>
              <Image src={photos.desk.src} alt={photos.desk.alt} fill sizes="(max-width: 1384px) 96vw, 1320px" />
            </div>
          )}
        </section>

        <section id="goods" className="vc-section vc-wrap" aria-labelledby="vc-goods-title">
          <div className={`vc-night${goods.length ? "" : " is-teaser"}${nightPhoto ? " has-photo" : ""}`} data-reveal>
            {nightPhoto && <>
              <Image className="vc-night-photo" src={nightPhoto.src} alt={nightPhoto.alt} fill sizes="(max-width: 1384px) 96vw, 1320px" />
              <span className="vc-night-scrim" aria-hidden="true" />
            </>}
            <div className="vc-night-head">
              <p className="vc-eyebrow">{goods.length ? "New from the studio" : "Coming soon"}</p>
              <h2 id="vc-goods-title" className="vc-heading">Things for how you live.</h2>
              <p className="vc-body">{goods.length
                ? "Physical products from our studio brands, with delivery times shown before you buy."
                : "The same care, applied to physical products: considered goods for the home and desk, shipping across the US first."}</p>
            </div>
            {goods.length > 0 && (
              <div className="vc-goods">
                {goods.map((card) => <GoodsTile key={card.slug} card={card} />)}
              </div>
            )}
          </div>
        </section>

        <section id="questions" className="vc-section vc-wrap vc-faq" aria-labelledby="vc-faq-title">
          <h2 id="vc-faq-title" className="vc-heading" data-reveal>Good to know.</h2>
          <div className="vc-faq-list" data-reveal>
            <Question title="How do I get my files?">Right after payment we email you a secure download link. It works for 14 days and up to 5 downloads, so save your files somewhere safe.</Question>
            <Question title="Is it a subscription?">No. Each system is a one-time purchase. You pay once and keep the files.</Question>
            <Question title="Can I get a refund?">For refund requests or problems with a purchase, email <a href={`mailto:${support}`}>{support}</a> from the address you used at checkout.</Question>
            <Question title="Do you sell physical products?">{goods.length
              ? "Yes. Each store page shows the price, shipping options and delivery times before you buy."
              : "Not yet. Physical products are coming soon, shipping across the US first."}</Question>
            <Question title="I have a question before buying.">Email <a href={`mailto:${support}`}>{support}</a>. Questions go straight to the studio.</Question>
          </div>
        </section>

        <section className="vc-wrap vc-final-wrap" aria-labelledby="vc-final-title">
          <div className="vc-final" data-reveal>
            <Monogram className="vc-final-mark" />
            <h2 id="vc-final-title" className="vc-heading">Start with one good system.</h2>
            <a className="vc-button vc-button-light" href="#collection">Shop the collection <ArrowRight size={18} aria-hidden="true" /></a>
          </div>
        </section>
      </main>

      <SiteFooter store={store} products={products} support={support} />
    </div>
  );
}

function GoodsTile({ card }: { card: StoreCard }) {
  return (
    <Link href={`/s/${card.slug}`} className="vc-good">
      <div className="vc-good-photo">
        {card.image ? <Image src={card.image.url} alt={card.image.alt} fill sizes="(max-width: 900px) 84vw, 30vw" /> : <Monogram className="vc-product-mark" />}
      </div>
      <span className="vc-good-brand">{card.brand}</span>
      <h3>{card.name}</h3>
      <span className="vc-good-price">From {formatMoney(card.fromPrice, card.currency)} <ArrowUpRight size={16} aria-hidden="true" /></span>
    </Link>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="vc-question">
      <summary>{title}<Plus size={20} aria-hidden="true" /></summary>
      <p>{children}</p>
    </details>
  );
}

/** Shown if the catalog can't be read, so a database problem never leaves a blank page. */
function Unavailable() {
  return (
    <div id={ROOT_ID} className={`vc ${monaSans.variable}`}>
      <SiteHeader nav={false} />
      <main className="vc-wrap vc-unavailable">
        <p className="vc-eyebrow">VeilCode Studio</p>
        <h1 className="vc-display"><span>Good things</span> <span>are on the way.</span></h1>
        <p className="vc-lede">The shop is taking a short break. Please check back soon, or email us at {SUPPORT_FALLBACK}.</p>
        <a className="vc-button" href={`mailto:${SUPPORT_FALLBACK}`}>Email the studio <ArrowRight size={18} aria-hidden="true" /></a>
      </main>
    </div>
  );
}
