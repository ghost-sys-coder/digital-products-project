import "server-only";
import { getSupabase } from "./supabase";
import { getEnv } from "./env";
import { STORE_ID } from "./store-config";
import { ownerUser } from "./auth";
import { parseStorePage, type StorePage } from "./store-page";
import { parseBrand, THEMES, type ThemeId } from "./store-themes";
import { parseStorePolicies, type StorePolicies } from "./store-policies";
import type { CatalogProduct, ProductVariant, ShippingRate } from "./catalog.types";

// Everything a /s/<slug> page needs, reduced to what is safe to send to a browser.
// Supplier links, supplier SKUs and internal ids never leave the server.

export type PublicVariant = {
  id: string; options: Record<string, string>; label: string;
  price: number; compareAt: number | null; image: string | null;
};
export type PublicOption = { name: string; values: string[] };
export type PublicShipping = { name: string; amount: number; minDays: number; maxDays: number };
export type Storefront = {
  product: { id: string; slug: string; name: string; tagline: string; description: string; currency: string; draft: boolean };
  theme: ThemeId;
  brand: { name: string; logo: string | null; accent: string | null; supportEmail: string | null; tiktokPixelId: string | null };
  page: StorePage;
  variants: PublicVariant[];
  options: PublicOption[];
  shipping: PublicShipping[];
  /** Null until the owner completes them; checkout refuses a store without policies. */
  policies: StorePolicies | null;
  /** Base URL of the public storefront bucket; media paths are validated, so they can be appended. */
  mediaBase: string;
};

/** Colour first, then size, then any other option, so pickers read naturally. */
function optionRank(name: string) {
  const key = name.toLowerCase();
  if (key === "color" || key === "colour") return 0;
  if (key === "size") return 1;
  return 2;
}

export function variantLabel(options: Record<string, string>, order?: string[]) {
  const names = order ?? Object.keys(options).sort((a, b) => optionRank(a) - optionRank(b) || a.localeCompare(b));
  return names.map((name) => options[name]).filter(Boolean).join(" / ");
}

export function publicOptions(variants: Pick<ProductVariant, "options">[]): PublicOption[] {
  const values = new Map<string, string[]>();
  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.options ?? {})) {
      if (typeof value !== "string" || !value) continue;
      const list = values.get(name) ?? [];
      if (!list.includes(value)) list.push(value);
      values.set(name, list);
    }
  }
  return [...values.entries()]
    .sort(([a], [b]) => optionRank(a) - optionRank(b) || a.localeCompare(b))
    .map(([name, list]) => ({ name, values: list }));
}

export function storefrontMediaBase() {
  return `${getEnv().SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/storefront/`;
}

/**
 * Loads a physical store page. Drafts are only returned for `preview` requests from the signed-in owner,
 * and an unreadable page or brand is treated as not found rather than rendered half-validated.
 */
export async function getStorefront(slug: string, { preview = false } = {}): Promise<Storefront | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const db = getSupabase();
  const { data: product, error } = await db.from("products").select("*")
    .eq("store_id", STORE_ID).eq("slug", slug).eq("kind", "physical").maybeSingle<CatalogProduct>();
  if (error) throw new Error("Could not load store");
  if (!product) return null;
  const draft = product.status !== "published";
  if (draft && !(preview && await ownerUser())) return null;
  if (!product.page || !product.theme || !(THEMES as readonly string[]).includes(product.theme)) return null;

  let page: StorePage;
  let brand;
  try {
    page = parseStorePage(product.page, product.store_id, product.id);
    brand = parseBrand(product.brand, product.store_id, product.id);
  } catch (cause) {
    console.error("Store page failed validation", { productId: product.id, cause: cause instanceof Error ? cause.message : cause });
    return null;
  }

  const [variantsResult, ratesResult] = await Promise.all([
    db.from("product_variants").select("*").eq("store_id", STORE_ID).eq("product_id", product.id).eq("active", true).order("position"),
    product.shipping_profile_id
      ? db.from("shipping_rates").select("*").eq("store_id", STORE_ID).eq("profile_id", product.shipping_profile_id)
        .eq("market", "US").eq("active", true).order("position")
      : Promise.resolve({ data: [] as ShippingRate[], error: null }),
  ]);
  if (variantsResult.error || ratesResult.error) throw new Error("Could not load store");
  const rows = (variantsResult.data ?? []) as ProductVariant[];
  const mediaBase = storefrontMediaBase();
  const options = publicOptions(rows);
  let policies: StorePolicies | null = null;
  try { policies = parseStorePolicies(product.policies); } catch { policies = null; }
  const order = options.map((option) => option.name);

  return {
    product: {
      id: product.id, slug: product.slug, name: product.name, tagline: product.tagline,
      description: product.description, currency: product.currency, draft,
    },
    theme: product.theme as ThemeId,
    brand: { name: brand.name || product.name, logo: brand.logoPath, accent: brand.accent, supportEmail: brand.supportEmail, tiktokPixelId: brand.tiktokPixelId },
    page,
    variants: rows.map((row) => ({
      id: row.id, options: row.options ?? {}, label: variantLabel(row.options ?? {}, order),
      price: row.price_amount, compareAt: row.compare_at_amount,
      image: row.image_path && row.image_path.startsWith(`${product.store_id}/${product.id}/`) && /^[A-Za-z0-9/_.-]+$/.test(row.image_path) && !row.image_path.includes("..") ? row.image_path : null,
    })),
    options,
    policies,
    shipping: ((ratesResult.data ?? []) as ShippingRate[]).map((rate) => ({ name: rate.name, amount: rate.amount, minDays: rate.min_days, maxDays: rate.max_days })),
    mediaBase,
  };
}
