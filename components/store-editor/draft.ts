// The editor's working copy of a store, and its conversion to the save request. Inputs hold what
// the owner typed (prices as "49.99", days as "7"); toSaveRequest converts and validates them with
// the same functions the server uses, so most problems show before anything is sent.
import { parseStorePage, storePageReadiness, StorePageError, SECTION_LABELS, type StorePage } from "@/lib/store-page";
import { BrandError, parseBrand, type ThemeId } from "@/lib/store-themes";
import { POLICY_KINDS, storeReadinessProblems, type PolicyKind } from "@/lib/store-policies";
import { combinationKey, combinations, moneyInput, parseMoney, parseShippingProfile, parseVariants, StoreInputError, type ProfileInput, type VariantInput } from "@/lib/store-input";
import type { StoreEditorData } from "@/lib/manage-stores";
import { describePageError } from "./section-specs";

export type OptionDraft = { name: string; values: string[] };
export type VariantDraft = {
  id: string; options: Record<string, string>; price: string; compareAt: string; sku: string;
  image: string | null; supplierUrl: string; supplierSku: string; active: boolean;
};
export type RateDraft = { id: string; market: "US" | "GB"; name: string; amount: string; minDays: string; maxDays: string; active: boolean };
export type ProfileDraft = { id: string; name: string; rates: RateDraft[]; usedBy: { id: string; name: string }[] };
export type PoliciesDraft = {
  sellerName: string; sellerAddress: string; processingMin: string; processingMax: string; returnWindowDays: string;
  returnShippingPaidBy: "customer" | "store"; refundDays: string; lostParcelDays: string; responseTime: string; governingLaw: string;
  extra: Record<PolicyKind, string>;
};
export type Draft = {
  name: string; slug: string; tagline: string; status: "draft" | "published"; theme: ThemeId;
  brand: { name: string; logoPath: string | null; accent: string | null; supportEmail: string };
  page: StorePage; options: OptionDraft[]; variants: VariantDraft[];
  shippingProfileId: string | null; profiles: ProfileDraft[]; policies: PoliciesDraft;
};
export type TabId = "product" | "page" | "brand" | "shipping" | "policies" | "media" | "publish";

const numberText = (value: unknown, fallback: number) => String(typeof value === "number" && Number.isInteger(value) ? value : fallback);

/** Colour first, then size, then the rest alphabetically: the order the storefront shows them in. */
function optionRank(name: string) {
  const key = name.toLowerCase();
  return key === "color" || key === "colour" ? 0 : key === "size" ? 1 : 2;
}

/** Option names (in storefront order) and their values (in variant order). */
export function optionsFromVariants(variants: { options: Record<string, string> }[]): OptionDraft[] {
  const options: OptionDraft[] = [];
  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.options)) {
      let option = options.find((entry) => entry.name === name);
      if (!option) options.push(option = { name, values: [] });
      if (!option.values.includes(value)) option.values.push(value);
    }
  }
  return options.sort((a, b) => optionRank(a.name) - optionRank(b.name) || a.name.localeCompare(b.name));
}

export function toDraft(data: StoreEditorData): Draft {
  const { product } = data;
  const raw = product.policies as Record<string, unknown>;
  const processing = (raw.processingDays && typeof raw.processingDays === "object" ? raw.processingDays : {}) as Record<string, unknown>;
  const extra = (raw.extra && typeof raw.extra === "object" ? raw.extra : {}) as Record<string, unknown>;
  return {
    name: product.name, slug: product.slug, tagline: product.tagline, status: product.status, theme: product.theme,
    brand: { name: product.brand.name, logoPath: product.brand.logoPath, accent: product.brand.accent, supportEmail: product.brand.supportEmail ?? "" },
    page: product.page,
    options: optionsFromVariants(data.variants),
    variants: data.variants.map((variant) => ({
      id: variant.id, options: variant.options, price: moneyInput(variant.price_amount), compareAt: moneyInput(variant.compare_at_amount),
      sku: variant.sku ?? "", image: variant.image_path, supplierUrl: variant.supplier_url ?? "", supplierSku: variant.supplier_sku ?? "", active: variant.active,
    })),
    shippingProfileId: product.shippingProfileId,
    profiles: data.profiles.map((profile) => ({
      id: profile.id, name: profile.name, usedBy: profile.usedBy,
      rates: profile.rates.map((rate) => ({ id: rate.id, market: rate.market, name: rate.name, amount: moneyInput(rate.amount), minDays: String(rate.min_days), maxDays: String(rate.max_days), active: rate.active })),
    })),
    policies: {
      sellerName: typeof raw.sellerName === "string" ? raw.sellerName : "", sellerAddress: typeof raw.sellerAddress === "string" ? raw.sellerAddress : "",
      processingMin: numberText(processing.min, 1), processingMax: numberText(processing.max, 3),
      returnWindowDays: numberText(raw.returnWindowDays, 30), returnShippingPaidBy: raw.returnShippingPaidBy === "store" ? "store" : "customer",
      refundDays: numberText(raw.refundDays, 5), lostParcelDays: numberText(raw.lostParcelDays, 14),
      responseTime: typeof raw.responseTime === "string" && raw.responseTime ? raw.responseTime : "within 1–2 business days",
      governingLaw: typeof raw.governingLaw === "string" ? raw.governingLaw : "",
      extra: Object.fromEntries(POLICY_KINDS.map((kind) => [kind, typeof extra[kind] === "string" ? extra[kind] : ""])) as Record<PolicyKind, string>,
    },
  };
}

/**
 * New variant rows after the options change. Existing rows keep their id and details when their
 * combination survives; a row gains a new option value when an option is added; new combinations
 * copy the closest existing row's prices and supplier details.
 */
export function regenerateVariants(options: OptionDraft[], variants: VariantDraft[]): VariantDraft[] {
  const usable = options.map((option) => ({ name: option.name.trim(), values: option.values })).filter((option) => option.name && option.values.length);
  if (!usable.length) return variants.length ? [{ ...variants[0], options: {} }] : [];
  const taken = new Set<string>();
  const contains = (combo: Record<string, string>, variant: VariantDraft) => Object.entries(variant.options).every(([name, value]) =>
    Object.entries(combo).some(([comboName, comboValue]) => comboName.toLowerCase() === name.toLowerCase() && comboValue.toLowerCase() === value.toLowerCase()));
  return combinations(usable).map((combo) => {
    const key = combinationKey(combo);
    const exact = variants.find((variant) => !taken.has(variant.id) && combinationKey(variant.options) === key);
    const closest = exact ?? variants.find((variant) => !taken.has(variant.id) && contains(combo, variant)) ?? variants.find((variant) => contains(combo, variant));
    if (closest && !taken.has(closest.id)) { taken.add(closest.id); return { ...closest, options: combo }; }
    const template = closest ?? variants[0];
    return { ...(template ?? blankVariant()), id: crypto.randomUUID(), options: combo, sku: "", active: true };
  });
}

export function blankVariant(): VariantDraft {
  return { id: crypto.randomUUID(), options: {}, price: "", compareAt: "", sku: "", image: null, supplierUrl: "", supplierSku: "", active: true };
}
export function blankRate(): RateDraft {
  return { id: crypto.randomUUID(), market: "US", name: "", amount: "0", minDays: "7", maxDays: "12", active: true };
}

const wholeOrNull = (value: string) => /^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : null;

export function variantInputs(draft: Draft) {
  return draft.variants.map((variant) => ({
    id: variant.id, options: variant.options, sku: variant.sku, image_path: variant.image, active: variant.active,
    supplier_url: variant.supplierUrl, supplier_sku: variant.supplierSku,
    price_amount: parseMoney(variant.price), compare_at_amount: variant.compareAt.trim() ? parseMoney(variant.compareAt) : null,
  }));
}
export function profileInput(profile: ProfileDraft) {
  return {
    id: profile.id, name: profile.name,
    rates: profile.rates.map((rate) => ({ id: rate.id, market: rate.market, name: rate.name, amount: parseMoney(rate.amount), min_days: wholeOrNull(rate.minDays), max_days: wholeOrNull(rate.maxDays), active: rate.active })),
  };
}
export function policiesInput(policies: PoliciesDraft) {
  return {
    sellerName: policies.sellerName, sellerAddress: policies.sellerAddress,
    processingDays: { min: wholeOrNull(policies.processingMin), max: wholeOrNull(policies.processingMax) },
    returnWindowDays: wholeOrNull(policies.returnWindowDays), returnShippingPaidBy: policies.returnShippingPaidBy,
    refundDays: wholeOrNull(policies.refundDays), lostParcelDays: wholeOrNull(policies.lostParcelDays),
    responseTime: policies.responseTime, governingLaw: policies.governingLaw,
    extra: Object.fromEntries(Object.entries(policies.extra).filter(([, paragraph]) => paragraph.trim())),
  };
}

export type Problem = { tab: TabId; text: string; section?: number };

/** Problems that stop a save, each tied to the tab where it can be fixed. */
export function saveProblems(draft: Draft, storeId: string, productId: string, changedProfiles: ProfileDraft[]): Problem[] {
  const problems: Problem[] = [];
  if (!draft.name.trim()) problems.push({ tab: "product", text: "Add a product name." });
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(draft.slug) || draft.slug.length > 80) problems.push({ tab: "product", text: "The store URL can use lowercase letters, numbers and single hyphens." });
  try { parseVariants(variantInputs(draft), storeId, productId); } catch (error) {
    if (error instanceof StoreInputError) problems.push({ tab: "product", text: error.message }); else throw error;
  }
  try { parseStorePage(draft.page, storeId, productId); } catch (error) {
    if (!(error instanceof StorePageError)) throw error;
    const described = describePageError(error.message, draft.page, SECTION_LABELS);
    problems.push({ tab: "page", text: described.text, section: described.section });
  }
  try { parseBrand({ ...draft.brand, supportEmail: draft.brand.supportEmail || null }, storeId, productId); } catch (error) {
    if (error instanceof BrandError) problems.push({ tab: "brand", text: error.message }); else throw error;
  }
  for (const profile of changedProfiles) {
    try { parseShippingProfile(profileInput(profile)); } catch (error) {
      if (error instanceof StoreInputError) problems.push({ tab: "shipping", text: error.message }); else throw error;
    }
  }
  return problems;
}

/** What still stands between this draft and a published store (the server checks again). */
export function publishProblems(draft: Draft, storeId: string, productId: string): Problem[] {
  let pageProblems: string[] = [];
  try { pageProblems = storePageReadiness(parseStorePage(draft.page, storeId, productId)); } catch { pageProblems = ["Fix the problems on the Page tab."]; }
  const profile = draft.profiles.find((entry) => entry.id === draft.shippingProfileId);
  const usRates = profile?.rates.filter((rate) => rate.market === "US" && rate.active).length ?? 0;
  // The server stamps the version and date; checking with them in place names the missing field.
  const policies = { ...policiesInput(draft.policies), version: 1, updatedAt: "2000-01-01" };
  const problems = storeReadinessProblems({
    pageProblems, activeVariants: draft.variants.filter((variant) => variant.active).length, usRates,
    supportEmail: draft.brand.supportEmail.trim() || null, policies,
  });
  const tabFor = (text: string): TabId => /hero|Page tab/i.test(text) ? "page" : /variant/i.test(text) ? "product" : /shipping rate/i.test(text) ? "shipping" : /support email/i.test(text) ? "brand" : "policies";
  return problems.map((text) => ({ tab: tabFor(text), text: text.replace(/\(([a-zA-Z.]+): /, (_, field: string) => `(${POLICY_FIELD_LABELS[field] ?? field}: `) }));
}

const POLICY_FIELD_LABELS: Record<string, string> = {
  sellerName: "seller name", governingLaw: "governing law", "processingDays.min": "processing time", "processingDays.max": "processing time",
  returnWindowDays: "return window", refundDays: "refund time", lostParcelDays: "lost parcel window", policies: "policies",
};

export function saveRequest(draft: Draft, productId: string, revision: number, changedProfiles: ProfileDraft[], status = draft.status) {
  return {
    action: "save", id: productId, revision, status,
    name: draft.name, slug: draft.slug, tagline: draft.tagline, theme: draft.theme,
    brand: { ...draft.brand, supportEmail: draft.brand.supportEmail.trim() || null },
    page: draft.page, variants: variantInputs(draft) as unknown as VariantInput[],
    profiles: changedProfiles.map(profileInput) as unknown as ProfileInput[], shippingProfileId: draft.shippingProfileId,
    policies: policiesInput(draft.policies),
  };
}
