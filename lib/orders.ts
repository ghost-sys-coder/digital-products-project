import "server-only";
import { getSupabase } from "./supabase";
import { MAX_DOWNLOADS } from "./tokens";
import type { Order } from "./database.types";
import type { DeliveryProduct } from "./catalog.types";
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
}): Promise<{ order: Order; inserted: boolean }> {
  const { data, error } = await getSupabase().from("orders").insert({
    stripe_session_id: input.sessionId,
    store_id: STORE_ID,
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
    if (order) return { order, inserted: false };
  }
  throw new Error("Could not insert order");
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
