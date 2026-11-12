// When a physical order should ship. The promise is the store's processing time, saved at checkout,
// counted in business days (Monday to Friday) from the order date. A delay notice replaces it.
import type { DelayNotice, Order } from "./database.types";

/** Used for orders placed before checkout saved the processing time. */
export const DEFAULT_PROCESSING_DAYS = 3;

/** YYYY-MM-DD in UTC. */
export function isoDate(date: Date) { return date.toISOString().slice(0, 10); }

export function addBusinessDays(from: Date, days: number) {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let left = days;
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) left--;
  }
  return date;
}

type Dated = Pick<Order, "created_at" | "physical_snapshot"> & { delay_notices?: DelayNotice[] };

/** The ship-by date promised at checkout. */
export function originalShipBy(order: Dated) {
  return isoDate(addBusinessDays(new Date(order.created_at), order.physical_snapshot?.processingDays?.max ?? DEFAULT_PROCESSING_DAYS));
}
/** The ship-by date the customer was last told: the newest delay notice, or the original promise. */
export function promisedShipBy(order: Dated) {
  return order.delay_notices?.at(-1)?.shipBy ?? originalShipBy(order);
}
/** True once the promised date has passed without the order shipping. */
export function isOverdue(order: Dated & Pick<Order, "fulfillment_status">, now = new Date()) {
  const open = order.fulfillment_status === "needs_ordering" || order.fulfillment_status === "ordered";
  return open && isoDate(now) > promisedShipBy(order);
}
/** Whole days between two YYYY-MM-DD dates. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
