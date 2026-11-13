import "server-only";
import { daysSince, type MetaAd, type MetaSearch } from "./research.types";

// Meta Ad Library API (graph.facebook.com/<version>/ads_archive), for product research.
// For ordinary product ads it only returns ads delivered in the UK or the EU, so searches cover those
// countries. It gives no spend or sales for product ads; the board reads "winning" from how long an
// ad has run and how many versions the advertiser runs. Needs META_ACCESS_TOKEN: a user token from the
// studio's Meta app, for an account that has confirmed its identity for the Ad Library API.

const GRAPH = "https://graph.facebook.com/v27.0";
/** UK and the largest English-speaking or high-spend EU markets: where US dropshippers also advertise. */
export const META_COUNTRIES = ["GB", "IE", "DE", "FR", "NL", "SE"] as const;
const FIELDS = [
  "id", "page_id", "page_name", "ad_creative_bodies", "ad_creative_link_titles", "ad_delivery_start_time",
  "ad_snapshot_url", "eu_total_reach", "publisher_platforms",
].join(",");

type ArchiveAd = {
  id: string; page_id?: string; page_name?: string; ad_creative_bodies?: string[]; ad_creative_link_titles?: string[];
  ad_delivery_start_time?: string; ad_snapshot_url?: string; eu_total_reach?: number; publisher_platforms?: string[];
};
type GraphError = { error?: { code?: number; error_subcode?: number; message?: string } };

export const metaConfigured = () => !!process.env.META_ACCESS_TOKEN?.trim();

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);
const firstLine = (values?: string[]) => values?.find((value) => value?.trim())?.trim() ?? "";

/** Groups the results' ads by advertiser and headline (or text), so each ad knows how many versions run. */
export function summariseAds(ads: ArchiveAd[], now = Date.now()): MetaAd[] {
  const key = (ad: ArchiveAd) => `${ad.page_id ?? ad.page_name}::${(firstLine(ad.ad_creative_link_titles) || firstLine(ad.ad_creative_bodies)).toLowerCase().slice(0, 80)}`;
  const counts = new Map<string, number>();
  for (const ad of ads) counts.set(key(ad), (counts.get(key(ad)) ?? 0) + 1);
  const seen = new Set<string>();
  return ads
    .filter((ad) => { const id = key(ad); if (seen.has(id)) return false; seen.add(id); return true; })
    .map((ad) => {
      const startedAt = ad.ad_delivery_start_time?.slice(0, 10) ?? null;
      return {
        id: ad.id, page: ad.page_name ?? "Unknown advertiser", pageId: ad.page_id ?? "",
        text: clip(firstLine(ad.ad_creative_bodies), 280), title: clip(firstLine(ad.ad_creative_link_titles), 120),
        url: ad.ad_snapshot_url?.startsWith("https://") ? ad.ad_snapshot_url : `https://www.facebook.com/ads/library/?id=${encodeURIComponent(ad.id)}`,
        startedAt, daysRunning: daysSince(startedAt, now), reach: typeof ad.eu_total_reach === "number" ? ad.eu_total_reach : null,
        versions: counts.get(key(ad)) ?? 1, platforms: ad.publisher_platforms ?? [],
      };
    })
    // Long-running ads with many versions first: the usual signs an advertiser is making money.
    .sort((a, b) => (b.daysRunning ?? 0) * Math.min(b.versions, 5) - (a.daysRunning ?? 0) * Math.min(a.versions, 5));
}

export async function searchMetaAds(terms: string): Promise<MetaSearch> {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  if (!token) return { status: "not_configured", message: "Add META_ACCESS_TOKEN to this environment to search Meta from here." };
  const params = new URLSearchParams({
    search_terms: terms, ad_reached_countries: JSON.stringify(META_COUNTRIES), ad_active_status: "ACTIVE",
    ad_type: "ALL", fields: FIELDS, limit: "100",
  });
  let response: Response;
  try {
    response = await fetch(`${GRAPH}/ads_archive?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch {
    return { status: "error", message: "Couldn't reach Meta. Try again in a moment." };
  }
  const body = await response.json().catch(() => ({})) as GraphError & { data?: ArchiveAd[] };
  if (!response.ok || body.error) {
    const code = body.error?.code;
    if (code === 10 || body.error?.error_subcode === 2332002) {
      return { status: "not_approved", message: "Meta hasn't given this account Ad Library API access yet. Finish the identity confirmation at facebook.com/id, then try again." };
    }
    if (code === 190) return { status: "token_expired", message: "The Meta access token has expired. Create a new one and update META_ACCESS_TOKEN." };
    return { status: "error", message: "Meta couldn't run that search. Try different words." };
  }
  return { status: "ok", ads: summariseAds(body.data ?? []), countries: [...META_COUNTRIES] };
}
