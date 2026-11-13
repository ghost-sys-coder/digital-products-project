import "server-only";
import { getSupabase } from "./supabase";
import { HttpError } from "./http";
import type { CjDetail, CjProduct } from "./research.types";

// CJ Dropshipping API 2.0 (developers.cjdropshipping.com), for supplier costs on the research board.
// Needs CJ_API_KEY. CJ hands out an access token for the key and limits how often it may be asked for,
// so the token is kept in integration_tokens and shared by every server instance until it nears expiry.
// All CJ prices are USD; the board stores them in cents.

const API = "https://developers.cjdropshipping.com/api2.0/v1";
/** Ask for a fresh token this long before the current one expires. */
const REFRESH_MARGIN = 3 * 86400_000;

type Envelope<T> = { code?: number; result?: boolean; success?: boolean; message?: string; data?: T };

export const cjConfigured = () => !!process.env.CJ_API_KEY?.trim();

/** "12.5", 12.5 or a range like "3.20-4.10" (the lowest variant price) to cents. */
export function toCents(value: unknown): number | null {
  const first = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value.split(/\s*-{1,2}\s*/)[0]) : NaN;
  return Number.isFinite(first) && first >= 0 ? Math.round(first * 100) : null;
}

async function requestToken(apiKey: string) {
  const response = await fetch(`${API}/authentication/getAccessToken`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }),
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as Envelope<{ accessToken?: string; accessTokenExpiryDate?: string }>;
  const token = body.data?.accessToken;
  if (!response.ok || !body.result || !token) throw new HttpError(502, "CJ didn't accept the API key. Check CJ_API_KEY in this environment.");
  const expiry = Date.parse(body.data?.accessTokenExpiryDate ?? "");
  // CJ's tokens last 180 days; assume 14 if it doesn't say, so a bad date never pins a dead token.
  return { token, expiresAt: new Date(Number.isNaN(expiry) ? Date.now() + 14 * 86400_000 : expiry).toISOString() };
}

async function accessToken(forceNew = false) {
  const apiKey = process.env.CJ_API_KEY?.trim();
  if (!apiKey) throw new HttpError(503, "Add CJ_API_KEY to this environment to search CJ from here.");
  const supabase = getSupabase();
  if (!forceNew) {
    const { data } = await supabase.from("integration_tokens").select("access_token, expires_at").eq("provider", "cj").maybeSingle();
    const saved = data as { access_token: string; expires_at: string } | null;
    if (saved && Date.parse(saved.expires_at) - Date.now() > REFRESH_MARGIN) return saved.access_token;
  }
  const fresh = await requestToken(apiKey);
  await supabase.from("integration_tokens").upsert({ provider: "cj", access_token: fresh.token, expires_at: fresh.expiresAt, updated_at: new Date().toISOString() });
  return fresh.token;
}

async function cj<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await accessToken(retried);
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init, headers: { "Content-Type": "application/json", "CJ-Access-Token": token, ...init.headers },
      cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new HttpError(502, "Couldn't reach CJ. Try again in a moment.");
  }
  const body = await response.json().catch(() => ({})) as Envelope<T>;
  // 1600001: the token was rejected (expired or replaced). Get a new one once and retry.
  if ((response.status === 401 || body.code === 1600001) && !retried) return cj(path, init, true);
  if (response.status === 429 || body.code === 1600200) throw new HttpError(429, "CJ is limiting requests right now. Wait a few seconds and try again.");
  if (!response.ok || body.result === false || body.data === undefined) throw new HttpError(502, body.message ? `CJ: ${body.message.slice(0, 160)}` : "CJ couldn't answer that request.");
  return body.data;
}

/** CJ's product page address: the name as a slug, then the product id. */
export function cjProductUrl(name: string, pid: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "product";
  return `https://cjdropshipping.com/product/${slug}-p-${encodeURIComponent(pid)}.html`;
}

type ListV2 = { content?: { productList?: { id?: string; nameEn?: string; bigImage?: string; sellPrice?: string | number; categoryName?: string; threeCategoryName?: string; listedNum?: number }[] }[] };

export async function searchCj(keyword: string): Promise<CjProduct[]> {
  const params = new URLSearchParams({ keyWord: keyword, page: "1", size: "24" });
  const data = await cj<ListV2>(`/product/listV2?${params}`);
  return (data.content ?? []).flatMap((group) => group.productList ?? [])
    .filter((product) => product.id && product.nameEn)
    .map((product) => ({
      id: product.id!, name: product.nameEn!.slice(0, 200),
      image: product.bigImage?.startsWith("https://") ? product.bigImage : null,
      cost: toCents(product.sellPrice), category: product.threeCategoryName ?? product.categoryName ?? null,
      listed: typeof product.listedNum === "number" ? product.listedNum : null, url: cjProductUrl(product.nameEn!, product.id!),
    }));
}

type Detail = { pid?: string; productNameEn?: string; bigImage?: string; sellPrice?: number | string; variants?: { vid?: string; variantSellPrice?: number | string }[] };
type Freight = { logisticName?: string; logisticPrice?: number | string; logisticAging?: string }[];

/** A product's lowest variant cost and the cheapest CJ shipping for it to the US. */
export async function cjDetail(pid: string): Promise<CjDetail> {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(pid)) throw new HttpError(400, "That CJ product id isn't valid.");
  const product = await cj<Detail>(`/product/query?${new URLSearchParams({ pid })}`);
  const variants = (product.variants ?? []).filter((variant) => variant.vid);
  const priced = variants.map((variant) => ({ vid: variant.vid!, cost: toCents(variant.variantSellPrice) })).filter((variant) => variant.cost !== null);
  const cheapest = priced.sort((a, b) => a.cost! - b.cost!)[0];
  const cost = cheapest?.cost ?? toCents(product.sellPrice);
  if (cost === null) throw new HttpError(502, "CJ didn't return a price for that product.");

  let shipping: { cost: number; name: string | null; days: string | null } | null = null;
  if (cheapest) {
    // A quote is a bonus: the product is still worth saving when CJ can't quote shipping for it.
    const quotes = await cj<Freight>("/logistic/freightCalculate", {
      method: "POST", body: JSON.stringify({ startCountryCode: "CN", endCountryCode: "US", products: [{ quantity: 1, vid: cheapest.vid }] }),
    }).catch(() => []);
    shipping = quotes
      .map((quote) => ({ cost: toCents(quote.logisticPrice), name: quote.logisticName?.slice(0, 80) ?? null, days: quote.logisticAging ? `${quote.logisticAging.slice(0, 30)} days` : null }))
      .filter((quote): quote is { cost: number; name: string | null; days: string | null } => quote.cost !== null)
      .sort((a, b) => a.cost - b.cost)[0] ?? null;
  }
  const name = (product.productNameEn ?? "CJ product").slice(0, 200);
  return {
    source: "cj", id: pid, name, url: cjProductUrl(name, pid),
    cost, shipping: shipping?.cost ?? null, shippingName: shipping?.name ?? null, days: shipping?.days ?? null,
    image: product.bigImage?.startsWith("https://") ? product.bigImage : null, variants: variants.length,
  };
}
