import { CURRENCIES, type Currency } from "./store-config";

export type ProductInput = {
  id: string; revision: number; name: string; slug: string; tagline: string;
  description: string; includes: string[]; price_amount: number; currency: Currency;
  templates_url: string; status: "draft" | "published"; sort_order: number;
};
export function parseProductInput(form: FormData): ProductInput {
  const read = (key: string, max: number) => {
    const value = form.get(key);
    if (typeof value !== "string" || value.length > max) throw new Error(`Invalid ${key.replace(/_/g, " ")}.`);
    return value.trim();
  };
  const id = read("id", 100);
  const revision = Number(read("revision", 10));
  const name = read("name", 120);
  const slug = read("slug", 100);
  const price = read("price", 12);
  const currency = read("currency", 3);
  const status = read("status", 10);
  const sort_order = Number(read("sort_order", 7));
  if (!/^(lead-to-kickoff|[0-9a-f-]{36})$/.test(id) || !Number.isInteger(revision) || revision < 0) throw new Error("Invalid product identifier or revision.");
  if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error("Add a name and a lowercase URL slug (letters, numbers, and hyphens).");
  if (!/^\d+(\.\d{1,2})?$/.test(price)) throw new Error("Enter a price with up to two decimal places.");
  const price_amount = Math.round(Number(price) * 100);
  if (price_amount < 50 || price_amount > 99999999) throw new Error("Price must be between 0.50 and 999,999.99.");
  if (!CURRENCIES.includes(currency as Currency)) throw new Error("Choose a supported currency.");
  if (status !== "draft" && status !== "published") throw new Error("Choose draft or published.");
  if (!Number.isInteger(sort_order) || Math.abs(sort_order) > 999999) throw new Error("Display order must be a whole number.");
  const includes = read("includes", 2500).split("\n").map((line) => line.trim()).filter(Boolean);
  if (includes.length > 12 || includes.some((line) => line.length > 200)) throw new Error("Use up to 12 included items, 200 characters each.");
  return {
    id, revision, name, slug, price_amount, currency: currency as Currency, status, sort_order,
    tagline: read("tagline", 200), description: read("description", 10000), includes,
    templates_url: read("templates_url", 2000),
  };
}
