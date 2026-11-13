import type { CatalogProduct } from "./catalog.types";

/**
 * Where a product's public page lives: /p/<slug> for a digital product, /s/<slug> for a store. A draft gets
 * the owner-only preview of the same page, which shows what's there instead of a not-found page.
 */
export function productPageHref(product: Pick<CatalogProduct, "kind" | "slug" | "status">) {
  const path = `/${product.kind === "physical" ? "s" : "p"}/${encodeURIComponent(product.slug)}`;
  return product.status === "published" ? path : `${path}?preview=1`;
}
