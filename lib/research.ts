import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabase } from "./supabase";
import { HttpError } from "./http";
import { STORE_ID } from "./store-config";
import { createStore } from "./manage-stores";
import { STAGES, type ResearchAd, type ResearchCard, type ResearchProduct, type ResearchSupplier, type Stage } from "./research.types";

// The product research board (/admin/research): product ideas, the ads that suggest they sell, a
// supplier and its costs, and the draft store made from an idea. Every value is checked here before
// it is written; the table constraints (supabase/migrations/*_product_research.sql) still apply.

const COLUMNS = "id, title, stage, notes, image_url, ads, supplier, target_price, store_product_id, created_at, updated_at";
const MAX_ADS = 20;
const MAX_CENTS = 10_000_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, label: string, max: number, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new HttpError(400, `${label} must be text.`);
  const clean = value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
  if (required && !clean) throw new HttpError(400, `${label} is required.`);
  if (clean.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer.`);
  return clean;
}
function link(value: unknown, label: string, required = false) {
  const raw = text(value, label, 2000, required);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && !url.username && !url.password) return url.toString();
  } catch { /* handled below */ }
  throw new HttpError(400, `${label} must be a full https:// link.`);
}
function cents(value: unknown, label: string, nullable: true): number | null;
function cents(value: unknown, label: string, nullable?: false): number;
function cents(value: unknown, label: string, nullable = false) {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_CENTS) throw new HttpError(400, `${label} must be an amount from $0 to $100,000.`);
  return value;
}
function date(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !DATE.test(value) || Number.isNaN(Date.parse(value))) throw new HttpError(400, "An ad's start date must be a date.");
  return value;
}

function parseAds(value: unknown): ResearchAd[] {
  if (!Array.isArray(value)) throw new HttpError(400, "Ads must be a list.");
  if (value.length > MAX_ADS) throw new HttpError(400, `Keep up to ${MAX_ADS} ads per product.`);
  return value.map((entry) => {
    const ad = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      id: text(ad.id, "Ad id", 64) || randomUUID(),
      url: link(ad.url, "Ad link", true)!,
      page: text(ad.page, "Advertiser", 120),
      startedAt: date(ad.startedAt),
      source: ad.source === "meta" ? "meta" : "manual",
      note: text(ad.note, "Ad note", 300),
    };
  });
}
function parseSupplier(value: unknown): ResearchSupplier | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Supplier details are not valid.");
  const supplier = value as Record<string, unknown>;
  return {
    source: supplier.source === "cj" ? "cj" : "manual",
    id: text(supplier.id, "Supplier product id", 64) || null,
    name: text(supplier.name, "Supplier product name", 200, true),
    url: link(supplier.url, "Supplier link"),
    cost: cents(supplier.cost, "Product cost"),
    shipping: cents(supplier.shipping, "Shipping cost", true),
    shippingName: text(supplier.shippingName, "Shipping method", 80) || null,
    days: text(supplier.days, "Delivery time", 40) || null,
  };
}

/** The fields a create or update may set. Only the keys present are checked and returned. */
export function parseResearchFields(raw: Record<string, unknown>, creating = false) {
  const fields: Partial<Omit<ResearchProduct, "id" | "created_at" | "updated_at" | "store_product_id">> = {};
  if (creating || "title" in raw) fields.title = text(raw.title, "Product name", 120, true);
  if ("stage" in raw) {
    if (!(STAGES as readonly unknown[]).includes(raw.stage)) throw new HttpError(400, "Choose a stage from the board.");
    fields.stage = raw.stage as Stage;
  }
  if ("notes" in raw) fields.notes = text(raw.notes, "Notes", 5000);
  if ("image_url" in raw) fields.image_url = link(raw.image_url, "Image link");
  if ("ads" in raw) fields.ads = parseAds(raw.ads);
  if ("supplier" in raw) fields.supplier = parseSupplier(raw.supplier);
  if ("target_price" in raw) fields.target_price = cents(raw.target_price, "Your price", true);
  return fields;
}

function researchId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new HttpError(400, "That product idea wasn't found.");
  return value;
}

async function loadResearch(id: unknown) {
  const { data, error } = await getSupabase().from("research_products").select(COLUMNS).eq("store_id", STORE_ID).eq("id", researchId(id)).maybeSingle();
  if (error) throw new HttpError(500, "Could not load that product idea. Please try again.");
  if (!data) throw new HttpError(404, "That product idea wasn't found. It may have been deleted.");
  return data as ResearchProduct;
}

/** Every idea on the board, newest activity first, with the store made from it (if any). */
export async function listResearch(): Promise<ResearchCard[]> {
  const supabase = getSupabase();
  const [ideas, stores] = await Promise.all([
    supabase.from("research_products").select(COLUMNS).eq("store_id", STORE_ID).order("updated_at", { ascending: false }).limit(500),
    supabase.from("products").select("id, slug, status").eq("store_id", STORE_ID).eq("kind", "physical"),
  ]);
  if (ideas.error || stores.error) throw new Error("Could not load the research board");
  const byId = new Map((stores.data as { id: string; slug: string; status: string }[]).map((store) => [store.id, store]));
  return (ideas.data as ResearchProduct[]).map((idea) => {
    const store = idea.store_product_id ? byId.get(idea.store_product_id) : undefined;
    return { ...idea, store: store ? { slug: store.slug, status: store.status } : null };
  });
}

export async function createResearch(raw: Record<string, unknown>) {
  const { title, ...fields } = parseResearchFields(raw, true);
  const { data, error } = await getSupabase().from("research_products")
    .insert({ id: randomUUID(), store_id: STORE_ID, stage: "saved", notes: "", ads: [], supplier: null, image_url: null, target_price: null, ...fields, title: title! })
    .select(COLUMNS).single();
  if (error || !data) throw new HttpError(500, "Could not save that product idea. Please try again.");
  return data as ResearchProduct;
}

export async function updateResearch(raw: Record<string, unknown>) {
  const id = researchId(raw.id);
  const fields = parseResearchFields(raw);
  const { data, error } = await getSupabase().from("research_products")
    .update({ ...fields, updated_at: new Date().toISOString() }).eq("store_id", STORE_ID).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) throw new HttpError(500, "Could not save your changes. Please try again.");
  if (!data) throw new HttpError(404, "That product idea wasn't found. It may have been deleted.");
  return data as ResearchProduct;
}

/** Deletes the idea only. A store made from it stays, as its own product. */
export async function deleteResearch(raw: Record<string, unknown>) {
  const id = researchId(raw.id);
  const { error } = await getSupabase().from("research_products").delete().eq("store_id", STORE_ID).eq("id", id);
  if (error) throw new HttpError(500, "Could not delete that product idea. Please try again.");
  return { id };
}

const BEFORE_TESTING: Stage[] = ["saved", "researching", "sourcing"];

/** The next step: a draft product store named after the idea, linked back to it. */
export async function createStoreFromResearch(raw: Record<string, unknown>) {
  const idea = await loadResearch(raw.id);
  if (idea.store_product_id) throw new HttpError(409, "This idea already has a store. Open it from the card.");
  const { id: productId } = await createStore({ name: idea.title, slug: raw.slug, theme: raw.theme });
  const { error } = await getSupabase().from("research_products").update({
    store_product_id: productId, updated_at: new Date().toISOString(),
    ...(BEFORE_TESTING.includes(idea.stage) ? { stage: "testing" } : {}),
  }).eq("store_id", STORE_ID).eq("id", idea.id);
  // The store exists either way; the owner can still find it under Products.
  if (error) throw new HttpError(500, "The store was created, but linking it to this idea failed. Find it under Products.");
  return { productId };
}
