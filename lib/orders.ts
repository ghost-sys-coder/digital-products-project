import "server-only";
import { getSupabase } from "./supabase";
import { MAX_DOWNLOADS } from "./tokens";
import type { Order } from "./database.types";
import type { DeliveryProduct, PhysicalSnapshot, ShippingAddress } from "./catalog.types";
import { STORE_ID } from "./store-config";
export type { Order } from "./database.types";

export async function findOrder(sessionId: string): Promise<Order | null> {
  const { data, error } = await getSupabase().from("orders").select("*")
    .eq("stripe_session_id", sessionId).maybeSingle();
  if (error) throw new Error("Could not load order");
  return data as Order | null;
}

export async function insertOrder(input: {
  sessionId: string; productId: string; email: string;
  amountTotal: number | null; currency: string | null;
  tokenHash: string; expiresAt: string;
  productSnapshot?: DeliveryProduct;
  storeId?: string; connectionId?: string | null;
}): Promise<{ order: Order; inserted: boolean }> {
  const { data, error } = await getSupabase().from("orders").insert({
    stripe_session_id: input.sessionId,
    store_id: input.storeId ?? STORE_ID,
    ...(input.connectionId ? { payment_connection_id: input.connectionId } : {}),
    product_snapshot: input.productSnapshot ?? null,
    product_id: input.productId,
    email: input.email,
    amount_total: input.amountTotal,
    currency: input.currency,
    download_token_hash: input.tokenHash,
    token_expires_at: input.expiresAt,
    max_downloads: MAX_DOWNLOADS,
    email_status: "pending",
  }).select("*").single();
  if (!error && data) return { order: data as Order, inserted: true };
  if (error?.code === "23505") {
    // Only an existing session is a replay; a token collision is an error.
    const order = await findOrder(input.sessionId);
    if (order && order.store_id === (input.storeId ?? STORE_ID) && (order.payment_connection_id ?? null) === (input.connectionId ?? null)) return { order, inserted: false };
  }
  throw new Error("Could not insert order");
}

/** Records a paid physical order once; a replayed webhook returns the existing order. */
export async function insertPhysicalOrder(input: {
  sessionId: string; productId: string; email: string; amountTotal: number | null; currency: string | null;
  customerName: string | null; shippingAddress: ShippingAddress; snapshot: PhysicalSnapshot;
  storeId?: string; connectionId?: string | null;
}): Promise<{ order: Order; inserted: boolean }> {
  const storeId = input.storeId ?? STORE_ID;
  const { data, error } = await getSupabase().from("orders").insert({
    stripe_session_id: input.sessionId, store_id: storeId,
    ...(input.connectionId ? { payment_connection_id: input.connectionId } : {}),
    kind: "physical", product_id: input.productId, product_snapshot: null, email: input.email,
    amount_total: input.amountTotal, currency: input.currency,
    download_token_hash: null, token_expires_at: null,
    customer_name: input.customerName, shipping_address: input.shippingAddress, physical_snapshot: input.snapshot,
    fulfillment_status: "needs_ordering", email_status: "pending",
  }).select("*").single();
  if (!error && data) return { order: data as Order, inserted: true };
  if (error?.code === "23505") {
    const order = await findOrder(input.sessionId);
    if (order && order.kind === "physical" && order.store_id === storeId && (order.payment_connection_id ?? null) === (input.connectionId ?? null)) return { order, inserted: false };
  }
  throw new Error("Could not insert order");
}

/** Marks a physical order's confirmation email as sent; only moves pending to sent. */
export async function markConfirmationSent(orderId: string) {
  const { error } = await getSupabase().from("orders").update({ email_status: "sent", email_sent_at: new Date().toISOString() })
    .eq("id", orderId).eq("kind", "physical").eq("email_status", "pending");
  if (error) throw new Error("Could not record confirmation email");
}

export async function claimDelivery(sessionId: string, lockId: string, force: boolean) {
  const { data, error } = await getSupabase().rpc("claim_delivery", {
    p_session_id: sessionId, p_lock_id: lockId, p_force: force,
  });
  if (error) throw new Error("Could not claim order delivery");
  return (data?.[0] ?? null) as Order | null;
}

export async function rotateOrderToken(orderId: string, lockId: string, input: {
  hash: string; expiresAt: string; email?: string; resetCount?: boolean;
}): Promise<Order> {
  const { data, error } = await getSupabase().from("orders").update({
    download_token_hash: input.hash,
    token_expires_at: input.expiresAt,
    email_status: "pending",
    email_sent_at: null,
    ...(input.email ? { email: input.email } : {}),
    ...(input.resetCount ? { download_count: 0 } : {}),
  }).eq("id", orderId).eq("delivery_lock_id", lockId).select("*").single();
  if (error || !data) throw new Error("Could not rotate order token");
  return data as Order;
}

export async function markOrderSent(orderId: string, lockId: string, tokenHash: string) {
  const { data, error } = await getSupabase().from("orders").update({
    email_status: "sent", email_sent_at: new Date().toISOString(),
    delivery_lock_id: null, delivery_locked_until: null,
  }).eq("id", orderId).eq("delivery_lock_id", lockId)
    .eq("download_token_hash", tokenHash).select("id").single();
  if (error || !data) throw new Error("Could not mark order delivery sent");
}

export async function releaseDelivery(orderId: string, lockId: string) {
  const { error } = await getSupabase().from("orders").update({
    delivery_lock_id: null, delivery_locked_until: null,
  }).eq("id", orderId).eq("delivery_lock_id", lockId);
  if (error) throw new Error("Could not release order delivery");
}

export async function consumeDownload(hash: string) {
  const { data, error } = await getSupabase().rpc("consume_download", { p_token_hash: hash });
  if (error) throw new Error("Could not consume download");
  return data?.[0] ?? null;
}
