import "server-only";
import type Stripe from "stripe";
import { getEnv, ConfigurationError } from "./env";
import { getStripe } from "./stripe";
import { getSupabase } from "./supabase";
import { STORE_ID } from "./store-config";
import { HttpError } from "./http";
import type { PaymentConnection, StripePaymentContext } from "./payment.types";

export const connectEnabled = () => process.env.STRIPE_CONNECT_ENABLED === "true";
export const stripeLivemode = () => /^(sk|rk)_live_/.test(getEnv().STRIPE_SECRET_KEY);
export function connectConfigured() {
  return /^ca_[A-Za-z0-9]+$/.test(process.env.STRIPE_CONNECT_CLIENT_ID?.trim() ?? "") &&
    /^whsec_[A-Za-z0-9_]+$/.test(process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim() ?? "");
}
export function connectClientId() {
  const id = process.env.STRIPE_CONNECT_CLIENT_ID?.trim();
  if (!id || !/^ca_[A-Za-z0-9]+$/.test(id)) throw new ConfigurationError("STRIPE_CONNECT_CLIENT_ID", "must be your Stripe Connect application client ID");
  return id;
}
export async function assertStoreOwner(userId: string, storeId = STORE_ID) {
  const { data, error } = await getSupabase().from("stores").select("owner_user_id").eq("id", storeId).single();
  if (error || !data || data.owner_user_id !== userId) throw new HttpError(403, "You cannot manage payments for this store.");
}
export async function currentStripeConnection(storeId = STORE_ID) {
  const { data, error } = await getSupabase().from("payment_connections").select("*")
    .eq("store_id", storeId).eq("provider", "stripe").eq("livemode", stripeLivemode()).eq("is_current", true).maybeSingle();
  if (error) throw new HttpError(503, "Payment settings are temporarily unavailable.");
  return data;
}
export function stripeOptions(context: StripePaymentContext) {
  return context.accountId ? { stripeAccount: context.accountId } : {};
}
export function contextFromConnection(connection: PaymentConnection): StripePaymentContext {
  return { provider: "stripe", storeId: connection.store_id, livemode: connection.livemode, connectionId: connection.id, accountId: connection.external_account_id };
}
export function accountStatus(account: Stripe.Account) {
  const ready = account.charges_enabled && account.payouts_enabled && account.capabilities?.card_payments === "active";
  return {
    status: ready ? "connected" as const : "restricted" as const,
    charges_enabled: !!account.charges_enabled && account.capabilities?.card_payments === "active",
    payouts_enabled: !!account.payouts_enabled, country: account.country ?? null,
    requirements: account.requirements?.currently_due ?? [], updated_at: new Date().toISOString(),
  };
}
export async function refreshConnection(connection: PaymentConnection) {
  if (connection.status === "disconnected") return connection;
  // Fetch fresh state before accepting payments. Outages never select another account.
  let account: Stripe.Account;
  try { account = await getStripe().accounts.retrieve(connection.external_account_id); }
  catch { throw new HttpError(503, "Stripe account verification is temporarily unavailable. Please try again."); }
  const status = accountStatus(account);
  const { data, error } = await getSupabase().from("payment_connections").update(status)
    .eq("id", connection.id).eq("store_id", connection.store_id).eq("status", connection.status).select("*").maybeSingle();
  if (error || !data) throw new HttpError(503, "Payment settings changed. Please try again.");
  return data;
}
export async function paymentContext(storeId = STORE_ID): Promise<StripePaymentContext> {
  const connection = await currentStripeConnection(storeId);
  if (!connection) {
    if (storeId !== STORE_ID) throw new HttpError(503, "Connect Stripe before accepting payments.");
    return { provider: "stripe", storeId, livemode: stripeLivemode(), connectionId: null, accountId: null };
  }
  const verified = await refreshConnection(connection);
  if (!process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim()) throw new HttpError(503, "Connected payments are temporarily unavailable. Please contact the store.");
  if (verified.status !== "connected" || !verified.charges_enabled || !verified.payouts_enabled) {
    throw new HttpError(503, "This store needs to finish its Stripe payment setup before accepting payments.");
  }
  return contextFromConnection(verified);
}
export async function findAccountConnection(accountId: string, livemode: boolean) {
  const { data, error } = await getSupabase().from("payment_connections").select("*")
    .eq("provider", "stripe").eq("external_account_id", accountId).eq("livemode", livemode).maybeSingle();
  if (error) throw new Error("Could not resolve the payment account");
  return data;
}
