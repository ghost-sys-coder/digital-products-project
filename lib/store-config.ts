export const STORE_ID = "c9fdc8a4-3d95-4d43-97f2-b650386179d2";
export const CURRENCIES = ["usd", "gbp", "eur", "cad", "aud"] as const;
export type Currency = (typeof CURRENCIES)[number];
export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
}
