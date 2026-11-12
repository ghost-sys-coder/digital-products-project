import "server-only";
import { createHash } from "node:crypto";
import { getSupabase } from "./supabase";
import { getDeployment, getEnv } from "./env";
import type { AdAttribution, Checkout } from "./catalog.types";
export type { AdAttribution };
import type { Order } from "./database.types";

// TikTok ads measurement for physical stores. The browser pixel (components/storefront/tiktok.tsx)
// reports page views, product views, checkouts and purchases. Purchases are also sent from the
// server through the Events API, with the same event id so TikTok counts each one once, because
// ad blockers and in-app browsers often stop the pixel. Shoppers who opt out (Global Privacy
// Control, or "Your privacy choices" on the store) are not tracked by either.

export const TIKTOK_PIXEL = /^[A-Z0-9]{10,32}$/;
export const TIKTOK_EVENTS_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/";


/** Server access tokens per pixel, from TIKTOK_ACCESS_TOKENS="PIXELID=token,OTHERPIXEL=token". */
function accessTokens() {
  const tokens = new Map<string, string>();
  for (const pair of (process.env.TIKTOK_ACCESS_TOKENS ?? "").split(",")) {
    const split = pair.indexOf("=");
    if (split < 1) continue;
    const pixel = pair.slice(0, split).trim().toUpperCase();
    const token = pair.slice(split + 1).trim();
    if (TIKTOK_PIXEL.test(pixel) && token) tokens.set(pixel, token);
  }
  return tokens;
}
/** Pixel IDs that can send server events (never the tokens themselves). */
export function pixelsWithServerEvents() { return [...accessTokens().keys()]; }

function readCookie(header: string | null, name: string) {
  const part = header?.split(/;\s*/).find((entry) => entry.startsWith(`${name}=`));
  if (!part) return null;
  try { return decodeURIComponent(part.slice(name.length + 1)); } catch { return null; }
}
const SAFE = /^[\w.~:-]+$/;
const safe = (value: string | null | undefined, max: number) => value && value.length <= max && SAFE.test(value) ? value : null;

/** The browser opted out of ad tracking: a Global Privacy Control signal or the store's own choice. */
export function optedOut(req: Request) {
  return req.headers.get("sec-gpc") === "1" || readCookie(req.headers.get("cookie"), "st_ads_optout") === "1";
}

/** Attribution details from a checkout request, or null when the shopper opted out. */
export function attributionFrom(req: Request): AdAttribution | null {
  if (optedOut(req)) return null;
  const cookies = req.headers.get("cookie");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || null;
  const userAgent = req.headers.get("user-agent");
  const referer = req.headers.get("referer");
  let url: string | null = null;
  try { if (referer && new URL(referer).origin === new URL(getEnv().APP_URL).origin) url = referer.slice(0, 2000); } catch { url = null; }
  return {
    ttclid: safe(readCookie(cookies, "st_ttclid"), 500), ttp: safe(readCookie(cookies, "_ttp"), 200),
    ip: ip && ip.length <= 64 && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null,
    userAgent: userAgent && userAgent.length <= 500 ? userAgent : null, url,
  };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
/** E.164, as TikTok matches phone numbers: US numbers may arrive without the +1. */
export function e164(phone: string | null | undefined) {
  if (!phone) return null;
  const compact = phone.replace(/[^\d+]/g, "");
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  if (/^\d{10}$/.test(compact)) return `+1${compact}`;
  if (/^1\d{10}$/.test(compact)) return `+${compact}`;
  return null;
}

/** The Purchase event, matching what the thank-you page's pixel reports for the same checkout. */
export function purchaseEvent(pixelId: string, checkout: Checkout, order: Order, attribution: AdAttribution, testEventCode?: string) {
  const item = checkout.physical_snapshot!.items[0];
  const phone = e164(order.shipping_address?.phone);
  return {
    event_source: "web", event_source_id: pixelId,
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
    data: [{
      event: "Purchase", event_time: Math.floor(Date.parse(order.created_at) / 1000), event_id: checkout.id,
      user: {
        email: sha256(order.email.trim().toLowerCase()),
        ...(phone ? { phone: sha256(phone) } : {}),
        ...(attribution.ttclid ? { ttclid: attribution.ttclid } : {}),
        ...(attribution.ttp ? { ttp: attribution.ttp } : {}),
        ...(attribution.ip ? { ip: attribution.ip } : {}),
        ...(attribution.userAgent ? { user_agent: attribution.userAgent } : {}),
      },
      page: { url: attribution.url ?? new URL(`/s/${checkout.product_slug}`, getEnv().APP_URL).toString() },
      properties: {
        currency: checkout.currency.toUpperCase(), value: checkout.amount / 100, content_type: "product",
        contents: [{ content_id: item.productId, content_name: item.name, quantity: item.quantity, price: item.unitAmount / 100 }],
      },
    }],
  };
}

/**
 * Sends a paid physical order to TikTok's Events API when the store has a pixel with a server token
 * and the shopper didn't opt out. Outside production it only sends with TIKTOK_TEST_EVENT_CODE, so
 * staging shows up in TikTok's Test Events instead of real reporting. Then forgets the attribution.
 */
export async function sendTikTokPurchase(pixelId: string | null | undefined, checkout: Checkout, order: Order) {
  const attribution = checkout.attribution;
  if (!pixelId || !attribution) return "skipped";
  const token = accessTokens().get(pixelId);
  if (!token) return "skipped";
  const testEventCode = getDeployment().production ? undefined : process.env.TIKTOK_TEST_EVENT_CODE?.trim() || undefined;
  if (!getDeployment().production && !testEventCode) return "skipped";

  const response = await fetch(TIKTOK_EVENTS_URL, {
    method: "POST", headers: { "Content-Type": "application/json", "Access-Token": token },
    body: JSON.stringify(purchaseEvent(pixelId, checkout, order, attribution, testEventCode)),
    signal: AbortSignal.timeout(8_000),
  });
  const result = await response.json().catch(() => null) as { code?: number } | null;
  if (!response.ok || result?.code !== 0) throw new Error(`TikTok did not accept the event (${result?.code ?? response.status})`);
  await getSupabase().from("checkouts").update({ attribution: null }).eq("id", checkout.id);
  return "sent";
}
