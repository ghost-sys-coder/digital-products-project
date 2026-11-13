// Shared by the research board's server code (lib/research.ts) and its admin screen. No server imports.

export const STAGES = ["saved", "researching", "sourcing", "testing", "live", "rejected"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  saved: "Saved", researching: "Researching", sourcing: "Sourcing", testing: "Testing", live: "Live", rejected: "Rejected",
};
export const STAGE_HINTS: Record<Stage, string> = {
  saved: "Caught your eye", researching: "Checking demand", sourcing: "Finding a supplier",
  testing: "Store and ads", live: "Selling", rejected: "Not this one",
};

/** One ad that suggests the product sells. `startedAt` is the date it started running (YYYY-MM-DD). */
export type ResearchAd = { id: string; url: string; page: string; startedAt: string | null; source: "meta" | "manual"; note: string };
/** Amounts in cents (USD). */
export type ResearchSupplier = {
  source: "cj" | "manual"; id: string | null; name: string; url: string | null;
  cost: number; shipping: number | null; shippingName: string | null; days: string | null;
};
export type ResearchProduct = {
  id: string; title: string; stage: Stage; notes: string; image_url: string | null;
  ads: ResearchAd[]; supplier: ResearchSupplier | null; target_price: number | null;
  store_product_id: string | null; created_at: string; updated_at: string;
};
export type ResearchCard = ResearchProduct & { store: { slug: string; status: string } | null };

/** A Meta Ad Library result, already summarised for the board. */
export type MetaAd = {
  id: string; page: string; pageId: string; text: string; title: string; url: string;
  startedAt: string | null; daysRunning: number | null; reach: number | null;
  /** How many of this page's ads in the results share this ad's headline or text. */
  versions: number; platforms: string[];
};
export type MetaSearch =
  | { status: "ok"; ads: MetaAd[]; countries: string[] }
  | { status: "not_configured" | "not_approved" | "token_expired" | "error"; message: string };

/** `listed`: how many stores have listed it on CJ, a rough sign of demand. */
export type CjProduct = { id: string; name: string; image: string | null; cost: number | null; category: string | null; listed: number | null; url: string };
export type CjDetail = ResearchSupplier & { image: string | null; variants: number };

export function daysSince(date: string | null, now = Date.now()) {
  if (!date) return null;
  const started = Date.parse(date);
  return Number.isNaN(started) ? null : Math.max(0, Math.floor((now - started) / 86400_000));
}

/** Card fees on the sale price: Stripe's standard US rate. An estimate, labelled as one in the UI. */
export const cardFee = (price: number) => Math.round(price * 0.029) + 30;

/** What one sale leaves after the product, shipping and card fees. Null until there's a price and a cost. */
export function unitEconomics(item: Pick<ResearchProduct, "target_price" | "supplier">) {
  if (item.target_price === null || !item.supplier) return null;
  const landed = item.supplier.cost + (item.supplier.shipping ?? 0);
  const fees = cardFee(item.target_price);
  const profit = item.target_price - landed - fees;
  return { landed, fees, profit, margin: item.target_price > 0 ? profit / item.target_price : 0, shippingKnown: item.supplier.shipping !== null };
}

/** The longest-running ad: the strongest single sign that a product sells. */
export function longestRunning(ads: ResearchAd[], now = Date.now()) {
  return ads.reduce<number | null>((best, ad) => {
    const days = daysSince(ad.startedAt, now);
    return days !== null && (best === null || days > best) ? days : best;
  }, null);
}
