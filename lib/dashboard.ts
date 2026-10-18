import "server-only";
import { getSupabase } from "./supabase";
import { STORE_ID } from "./store-config";

export async function recentOrders(limit = 100) {
  const { data, error } = await getSupabase().from("orders").select("*").eq("store_id", STORE_ID).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Could not load orders");
  return data ?? [];
}
