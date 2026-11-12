import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getStorefront, type Storefront } from "@/lib/storefront";
import { ProductHero } from "@/components/storefront/product-hero";
import { StoreSection } from "@/components/storefront/sections";
import { StoreFrame } from "@/components/storefront/store-frame";
import { TikTokEvent } from "@/components/storefront/tiktok";
import "./storefront.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

// Shared by generateMetadata and the page so a request loads the store once.
const loadStore = cache((slug: string, preview: boolean) => getStorefront(slug, { preview }));
async function load({ params, searchParams }: Params) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return { store: await loadStore(slug, query.preview === "1"), query };
}

function heroOf(store: Storefront) {
  const hero = store.page.sections.find((section) => section.type === "hero" && section.enabled);
  return hero?.type === "hero" ? hero : null;
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const { store } = await load(props);
  if (!store) return { title: "Store not found" };
  const image = heroOf(store)?.data.media.find((item) => item.kind === "image");
  const title = store.brand.name === store.product.name ? store.product.name : `${store.product.name} | ${store.brand.name}`;
  return {
    title: { absolute: title },
    description: store.product.tagline || heroOf(store)?.data.subheadline || undefined,
    openGraph: { title, description: store.product.tagline || undefined, images: image ? [{ url: store.mediaBase + image.path, alt: image.alt }] : undefined },
    ...(store.product.draft ? { robots: { index: false, follow: false } } : {}),
  };
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
}

export default async function StorePage(props: Params) {
  const { store, query } = await load(props);
  if (!store) notFound();
  const hero = heroOf(store);
  if (!hero || !store.variants.length) {
    if (!store.product.draft) notFound();
    // The owner's preview of an unfinished draft says what's missing instead of a not-found page.
    return (
      <StoreFrame store={store}>
        <main className="st-section st-thanks">
          <div className="st-shell narrow">
            <p className="st-eyebrow">Draft preview</p>
            <h1 className="st-display">Almost there.</h1>
            <p className="st-lede">{!hero ? "Add the Hero and buy box section" : "Add at least one variant for sale with a price"}, then save to see your store here.</p>
          </div>
        </main>
      </StoreFrame>
    );
  }

  const sections = store.page.sections.filter((section) => section.enabled);
  const announcement = sections.find((section) => section.type === "announcement");
  const lowest = Math.min(...store.variants.map((variant) => variant.price));
  const variesInPrice = store.variants.some((variant) => variant.price !== lowest);
  const priceLabel = `${variesInPrice ? "from " : ""}${money(lowest, store.product.currency)}`;
  const ctx = { mediaBase: store.mediaBase, productName: store.product.name, currency: store.product.currency, shipping: store.shipping, priceLabel };
  const has = (type: string) => sections.some((section) => section.type === type);
  const nav = [
    has("features") || has("benefits") ? { href: `#${sections.find((section) => section.type === "features" || section.type === "benefits")!.id}`, label: "Features" } : null,
    has("specs") ? { href: `#${sections.find((section) => section.type === "specs")!.id}`, label: "Details" } : null,
    has("guarantee") ? { href: `#${sections.find((section) => section.type === "guarantee")!.id}`, label: "Shipping" } : null,
    has("faq") ? { href: `#${sections.find((section) => section.type === "faq")!.id}`, label: "FAQ" } : null,
  ].filter((item): item is { href: string; label: string } => item !== null);

  return (
    <StoreFrame store={store} nav={nav} announcement={announcement?.type === "announcement" ? announcement.data.text : undefined} onStorePage>
      {store.brand.tiktokPixelId && <TikTokEvent event="ViewContent" params={{
        content_type: "product", content_id: store.product.id, content_name: store.product.name, currency: store.product.currency.toUpperCase(), value: lowest / 100,
      }} />}
      <main id="top">
        {query.checkout === "cancelled" && <p className="st-shell st-notice" role="status">Checkout was cancelled and you haven&apos;t been charged.</p>}
        {sections.map((section) => section.type === "hero"
          ? <ProductHero key={section.id} productId={store.product.id} name={store.product.name} tagline={store.product.tagline}
              headline={section.data.headline} subheadline={section.data.subheadline} media={section.data.media}
              highlights={section.data.highlights} badges={section.data.badges} variants={store.variants} options={store.options}
              shipping={store.shipping} currency={store.product.currency} mediaBase={store.mediaBase} draft={store.product.draft} />
          : <StoreSection key={section.id} section={section} ctx={ctx} />)}
      </main>
    </StoreFrame>
  );
}
