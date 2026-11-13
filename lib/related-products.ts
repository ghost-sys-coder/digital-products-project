import "server-only";
import { listProducts } from "./catalog";
import { formatMoney } from "./store-config";
import type { CatalogProduct } from "./catalog.types";

/** A digital product the owner can suggest under another one's page (components/product-editor.tsx). */
export type RelatedChoice = {
  id: string; name: string; slug: string; published: boolean;
  price: string | null; cover: string | null;
};

/** Every other digital product in the store, in catalog order, for the editor's picker. */
export async function relatedChoices(productId: string | null): Promise<RelatedChoice[]> {
  const products = await listProducts(false, "digital");
  return products.filter((product) => product.id !== productId).map((product) => ({
    id: product.id, name: product.name, slug: product.slug, published: product.status === "published",
    price: product.price_amount === null ? null : formatMoney(product.price_amount, product.currency),
    cover: product.cover_path ? `/api/products/${encodeURIComponent(product.id)}/cover?preview=1&v=${product.revision}` : null,
  }));
}

/**
 * Keeps the ids that are digital products in this store, in the chosen order. One deleted or turned into
 * something else since the editor loaded is dropped rather than failing the whole save.
 */
export async function knownRelatedIds(ids: string[], productId: string) {
  if (!ids.length) return [];
  const digital = new Set((await listProducts(false, "digital")).map((product) => product.id));
  return ids.filter((id) => id !== productId && digital.has(id));
}

/** What a product page suggests: the chosen products that are published and priced, in the chosen order. */
export function relatedProducts(product: CatalogProduct, published: CatalogProduct[]) {
  const byId = new Map(published.map((entry) => [entry.id, entry]));
  return (product.related_ids ?? [])
    .map((id) => byId.get(id))
    .filter((entry): entry is CatalogProduct => !!entry && entry.id !== product.id && entry.status === "published" && entry.price_amount !== null);
}
