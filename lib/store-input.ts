// Store editor input for physical products: variants, shipping profiles, money, and draft policies.
// Pure functions shared by the admin editor (instant feedback) and the server, which re-checks
// everything before saving. Messages are written for the store owner.
import { MEDIA_EXTENSIONS, mediaPrefix } from "./store-page";
import { parseStorePolicies, POLICY_KINDS } from "./store-policies";

export const MAX_VARIANTS = 50;
export const MAX_OPTIONS = 3;
export const MAX_PROFILES_PER_SAVE = 10;
export const MAX_RATES = 10;
/** Stripe Checkout offers at most five shipping options. */
export const MAX_ACTIVE_RATES = 5;
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_SLUG = 80;

export class StoreInputError extends Error {}
function fail(message: string): never { throw new StoreInputError(message); }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim() : "";
}
function optionalText(value: unknown, max: number, label: string) {
  const text = clean(value);
  if (text.length > max) fail(`${label} must be ${max} characters or fewer.`);
  return text || null;
}

/** "49", "$49.9" or "1,049.99" dollars to cents. NaN when empty or not a price. */
export function parseMoney(value: string): number {
  const text = value.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!text) return Number.NaN;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return Number.NaN;
  return Math.round(Number(text) * 100);
}
/** Cents to an editable dollar string: 4900 -> "49", 4999 -> "49.99". */
export function moneyInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

/** A stable, readable slug from a name. */
export function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, MAX_SLUG).replace(/-+$/, "");
}

// ── Variants ──────────────────────────────────────────────────────────────────────────────────

export type VariantInput = {
  id: string; options: Record<string, string>; sku: string | null; price_amount: number; compare_at_amount: number | null;
  image_path: string | null; active: boolean; supplier_url: string | null; supplier_sku: string | null;
};

/** What the owner sees for a variant: its option values, in order. */
export function describeVariant(options: Record<string, string>, order?: string[]) {
  const names = order ?? Object.keys(options);
  return names.map((name) => options[name]).filter(Boolean).join(" / ") || "Default";
}

function parseOptions(value: unknown, label: string) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) fail(`${label}: options are invalid.`);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_OPTIONS) fail(`A product can have at most ${MAX_OPTIONS} options, like Colour, Size, and Style.`);
  const options: Record<string, string> = {};
  for (const [rawName, rawValue] of entries) {
    const name = clean(rawName);
    const optionValue = clean(rawValue);
    if (!name || name.length > 30) fail("Option names need 1 to 30 characters.");
    if (!optionValue || optionValue.length > 40) fail(`Each ${name} value needs 1 to 40 characters.`);
    if (Object.keys(options).some((existing) => existing.toLowerCase() === name.toLowerCase())) fail(`The option "${name}" is listed twice.`);
    options[name] = optionValue;
  }
  return options;
}

/** A supplier or tracking link: HTTPS only, no credentials. */
export function httpsLink(value: unknown, label: string) {
  const text = clean(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol === "https:" && !url.username && !url.password && text.length <= 2000) return url.toString();
  } catch { /* handled below */ }
  return fail(`${label} must be a full https:// link.`);
}

/** A store image path in this product's storefront folder. */
export function storeImagePath(value: unknown, storeId: string, productId: string, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const path = typeof value === "string" ? value : "";
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  if (!path.startsWith(mediaPrefix(storeId, productId)) || !/^[A-Za-z0-9/_.-]+$/.test(path) || path.includes("..") ||
      !(MEDIA_EXTENSIONS.image as readonly string[]).includes(extension)) fail(`${label}: choose an image from this store's media.`);
  return path;
}

export function parseVariants(value: unknown, storeId: string, productId: string): VariantInput[] {
  if (!Array.isArray(value)) fail("Variants must be a list.");
  if (value.length > MAX_VARIANTS) fail(`A store can have at most ${MAX_VARIANTS} variants.`);
  const ids = new Set<string>();
  const combinations = new Set<string>();
  let optionNames: string | null = null;
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail(`Variant ${index + 1} is invalid.`);
    const raw = entry as Record<string, unknown>;
    if (!isUuid(raw.id)) fail(`Variant ${index + 1} has an invalid id. Reload the editor.`);
    const id = raw.id.toLowerCase();
    if (ids.has(id)) fail("Two variants share an id. Reload the editor.");
    ids.add(id);
    const options = parseOptions(raw.options, `Variant ${index + 1}`);
    const label = describeVariant(options);
    const names = Object.keys(options).map((name) => name.toLowerCase()).sort().join("|");
    if (optionNames === null) optionNames = names;
    else if (optionNames !== names) fail("Every variant needs a value for each option.");
    const combination = Object.keys(options).sort().map((name) => `${name.toLowerCase()}=${options[name].toLowerCase()}`).join("&");
    if (combinations.has(combination)) fail(`There are two "${label}" variants. Each combination can appear once.`);
    combinations.add(combination);

    const price = raw.price_amount;
    if (typeof price !== "number" || !Number.isInteger(price) || price < 50 || price > 99_999_999) fail(`${label}: enter a price of at least $0.50.`);
    const compareAt = raw.compare_at_amount ?? null;
    if (compareAt !== null && (typeof compareAt !== "number" || !Number.isInteger(compareAt) || compareAt <= price || compareAt > 99_999_999)) {
      fail(`${label}: the compare-at price must be higher than the price, or left empty.`);
    }
    return {
      id, options, price_amount: price, compare_at_amount: compareAt as number | null,
      sku: optionalText(raw.sku, 80, `${label} SKU`),
      image_path: storeImagePath(raw.image_path, storeId, productId, `${label} image`),
      active: raw.active !== false,
      supplier_url: httpsLink(raw.supplier_url, `${label} supplier link`),
      supplier_sku: optionalText(raw.supplier_sku, 120, `${label} supplier SKU`),
    };
  });
}

/** Every combination of option values, in order: Colour × Size → Black/S, Black/M, White/S, White/M. */
export function combinations(options: { name: string; values: string[] }[]): Record<string, string>[] {
  return options.filter((option) => option.name && option.values.length).reduce<Record<string, string>[]>(
    (rows, option) => rows.flatMap((row) => option.values.map((value) => ({ ...row, [option.name]: value }))), [{}],
  );
}
export function combinationKey(options: Record<string, string>) {
  return Object.keys(options).map((name) => name.toLowerCase()).sort().map((name) => {
    const original = Object.keys(options).find((key) => key.toLowerCase() === name)!;
    return `${name}=${options[original].toLowerCase()}`;
  }).join("&");
}

// ── Shipping ──────────────────────────────────────────────────────────────────────────────────

export type RateInput = {
  id: string; market: "US" | "GB"; name: string; amount: number; currency: "usd" | "gbp";
  min_days: number; max_days: number; active: boolean;
};
export type ProfileInput = { id: string; name: string; rates: RateInput[] };

function wholeNumber(value: unknown, min: number, max: number, message: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) fail(message);
  return value;
}

export function parseShippingProfile(value: unknown): ProfileInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("A shipping profile is invalid.");
  const raw = value as Record<string, unknown>;
  if (!isUuid(raw.id)) fail("A shipping profile has an invalid id. Reload the editor.");
  const name = clean(raw.name);
  if (!name || name.length > 80) fail("Shipping profile names need 1 to 80 characters.");
  if (!Array.isArray(raw.rates)) fail(`${name}: rates must be a list.`);
  if (raw.rates.length > MAX_RATES) fail(`${name}: a profile can have at most ${MAX_RATES} rates.`);
  const ids = new Set<string>();
  const rates = raw.rates.map((entry, index): RateInput => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail(`${name}: rate ${index + 1} is invalid.`);
    const rate = entry as Record<string, unknown>;
    if (!isUuid(rate.id) || ids.has(rate.id.toLowerCase())) fail(`${name}: rate ${index + 1} has an invalid id. Reload the editor.`);
    ids.add(rate.id.toLowerCase());
    const market = rate.market === "GB" ? "GB" : rate.market === "US" ? "US" : fail(`${name}: rate ${index + 1} needs a market.`);
    const rateName = clean(rate.name);
    if (!rateName || rateName.length > 80) fail(`${name}: every rate needs a name of 1 to 80 characters, like "Free tracked shipping".`);
    const amount = wholeNumber(rate.amount, 0, 99_999_999, `${rateName}: enter a price, or 0 for free shipping.`);
    const min = wholeNumber(rate.min_days, 1, 90, `${rateName}: the fastest delivery time must be 1 to 90 business days.`);
    const max = wholeNumber(rate.max_days, min, 120, `${rateName}: the slowest delivery time must be at least the fastest, and at most 120 days.`);
    return { id: rate.id.toLowerCase(), market, name: rateName, amount, currency: market === "US" ? "usd" : "gbp", min_days: min, max_days: max, active: rate.active !== false };
  });
  for (const market of ["US", "GB"] as const) {
    if (rates.filter((rate) => rate.market === market && rate.active).length > MAX_ACTIVE_RATES) {
      fail(`${name}: checkout can offer at most ${MAX_ACTIVE_RATES} shipping options per country. Switch some off.`);
    }
  }
  return { id: raw.id.toLowerCase(), name, rates };
}

// ── Policies ──────────────────────────────────────────────────────────────────────────────────

/**
 * Policy settings as saved. Complete settings are validated and stamped with the date they last
 * changed. While a store is a draft, incomplete settings are kept without the version marker, so
 * the database and checkout both treat the store as not ready until they are finished.
 */
export function policiesForSave(value: unknown, stored: unknown, today: string, publishing: boolean): Record<string, unknown> {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  try {
    const parsed = parseStorePolicies({ ...raw, version: 1, updatedAt: today });
    let previous = null;
    try { previous = parseStorePolicies(stored); } catch { previous = null; }
    const unchanged = previous && JSON.stringify({ ...previous, updatedAt: "" }) === JSON.stringify({ ...parsed, updatedAt: "" });
    return { ...parsed, updatedAt: unchanged ? previous!.updatedAt : today };
  } catch (error) {
    if (publishing) throw error;
    const text = (input: unknown, max: number) => typeof input === "string" ? input.slice(0, max) : "";
    const whole = (input: unknown) => typeof input === "number" && Number.isInteger(input) && input >= 0 && input <= 365 ? input : null;
    const processing = raw.processingDays && typeof raw.processingDays === "object" ? raw.processingDays as Record<string, unknown> : {};
    const extra = raw.extra && typeof raw.extra === "object" ? raw.extra as Record<string, unknown> : {};
    return {
      sellerName: text(raw.sellerName, 120), sellerAddress: text(raw.sellerAddress, 300),
      processingDays: { min: whole(processing.min), max: whole(processing.max) },
      returnWindowDays: whole(raw.returnWindowDays), returnShippingPaidBy: raw.returnShippingPaidBy === "store" ? "store" : "customer",
      refundDays: whole(raw.refundDays), lostParcelDays: whole(raw.lostParcelDays),
      responseTime: text(raw.responseTime, 80), governingLaw: text(raw.governingLaw, 120),
      extra: Object.fromEntries(POLICY_KINDS.map((kind) => [kind, text(extra[kind], 3000)]).filter(([, paragraph]) => paragraph)),
    };
  }
}
