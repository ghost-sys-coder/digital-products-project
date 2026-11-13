// The research board's client calls to /api/admin/research. Throws the server's message on failure.
export async function researchApi<T>(body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/admin/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("You seem to be offline. Check your connection and try again.");
  }
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Something went wrong. Please try again.");
  return result;
}

export const dollars = (cents: number | null) => (cents === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100));
/** "12.5" → 1250. Empty → null. Throws on anything that isn't an amount. */
export function toCents(value: string) {
  const clean = value.replace(/[$,\s]/g, "");
  if (!clean) return null;
  const amount = Number(clean);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000) throw new Error("Enter an amount like 24.99.");
  return Math.round(amount * 100);
}
export const centsInput = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));

/** Meta's own Ad Library search for US ads: the API can't return them, the website can. */
export const metaLibraryUrl = (query: string, country = "US") =>
  `https://www.facebook.com/ads/library/?${new URLSearchParams({ active_status: "active", ad_type: "all", country, q: query, search_type: "keyword_unordered", media_type: "all" })}`;
