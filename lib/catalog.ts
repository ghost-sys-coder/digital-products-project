import "server-only";
import { getSupabase } from "./supabase";
import { STORE_ID } from "./store-config";
import type { CatalogProduct, DeliveryProduct } from "./catalog.types";
import { getProduct } from "./products";

export async function getStore() {
  const { data, error } = await getSupabase().from("stores").select("*").eq("id", STORE_ID).single();
  if (error || !data) throw new Error("Store unavailable. Apply the storefront migration.");
  return data;
}
export async function listProducts(published = false) {
  let query = getSupabase().from("products").select("*").eq("store_id", STORE_ID);
  if (published) query = query.eq("status", "published");
  const { data, error } = await query.order("sort_order").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load products");
  return data ?? [];
}
export async function getCatalogProduct(id: string) {
  const { data, error } = await getSupabase().from("products").select("*").eq("store_id", STORE_ID).eq("id", id).maybeSingle();
  if (error) throw new Error("Could not load product");
  return data;
}
export async function getPublicProduct(slug: string) {
  const { data, error } = await getSupabase().from("products").select("*")
    .eq("store_id", STORE_ID).eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw new Error("Could not load product");
  return data;
}
export function snapshotProduct(product: CatalogProduct): DeliveryProduct {
  if (!product.storage_path || !product.download_filename) throw new Error("Upload a download before publishing");
  return {
    name: product.name, shortName: product.name, emailSubject: `Your ${product.name} is ready`,
    storagePath: product.storage_path, downloadFilename: product.download_filename,
    templatesUrl: product.templates_url,
  };
}
export async function resolveDeliveryProduct(id: string, snapshot: DeliveryProduct | null) {
  if (snapshot) return snapshot;
  // Preserve pre-store purchases, including their original file location.
  const legacy = getProduct(id);
  if (legacy) return legacy;
  const product = await getCatalogProduct(id);
  return product ? snapshotProduct(product) : undefined;
}
