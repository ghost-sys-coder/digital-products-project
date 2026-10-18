import "server-only";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";
import { getSupabase } from "./supabase";
import { getStripe } from "./stripe";
import { STORE_ID } from "./store-config";
import { HttpError } from "./http";
import { accountStatus, assertStoreOwner, connectClientId, connectConfigured, connectEnabled, currentStripeConnection, stripeLivemode } from "./payment-connections";

export const CONNECT_COOKIE = "veilcode_stripe_connect";
const stateHash = (state: string) => createHash("sha256").update(state).digest("hex");
function assertConnectEnabled() {
  if (!connectEnabled()) throw new HttpError(503, "Stripe connections are not enabled yet.");
  if (!connectConfigured()) throw new HttpError(503, "Stripe connection setup is incomplete. Please contact the store owner.");
}
export async function startStripeConnection(ownerId: string) {
  assertConnectEnabled();
  await assertStoreOwner(ownerId);
  const clientId = connectClientId();
  const state = randomBytes(32).toString("base64url");
  const { error } = await getSupabase().from("payment_oauth_attempts").insert({
    state_hash: stateHash(state), store_id: STORE_ID, owner_user_id: ownerId,
    livemode: stripeLivemode(), expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), consumed_at: null,
  });
  if (error) throw new HttpError(503, "Could not start the connection. Please try again.");
  const url = getStripe().oauth.authorizeUrl({
    client_id: clientId, response_type: "code", scope: "read_write", state, always_prompt: true,
    redirect_uri: new URL("/api/admin/payments/stripe/callback", getEnv().APP_URL).toString(),
  });
  return { state, url };
}
export async function completeStripeConnection(ownerId: string, params: URLSearchParams, cookieState?: string) {
  assertConnectEnabled();
  await assertStoreOwner(ownerId);
  const state = params.get("state");
  if (!state || !cookieState || !/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(cookieState) ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))) throw new HttpError(400, "Connection expired. Please start again.");
  const { data, error } = await getSupabase().from("payment_oauth_attempts").update({ consumed_at: new Date().toISOString() })
    .eq("state_hash", stateHash(state)).eq("store_id", STORE_ID).eq("owner_user_id", ownerId)
    .eq("livemode", stripeLivemode()).is("consumed_at", null).gt("expires_at", new Date().toISOString()).select("state_hash").maybeSingle();
  if (error || !data) throw new HttpError(400, "Connection expired. Please start again.");
  if (params.has("error")) return "cancelled";
  const code = params.get("code");
  if (!code || code.length > 1000) throw new HttpError(400, "Stripe did not authorize the connection.");
  const stripe = getStripe();
  // OAuth codes are not idempotent: exchanging a code twice can revoke access.
  const token = await stripe.oauth.token({ grant_type: "authorization_code", code }, { maxNetworkRetries: 0 });
  if (!token.stripe_user_id || token.scope !== "read_write" || token.livemode !== stripeLivemode()) throw new HttpError(400, "Stripe returned an incompatible connection.");
  const account = await stripe.accounts.retrieve(token.stripe_user_id);
  if (account.type !== "standard" || (account.controller?.stripe_dashboard?.type && account.controller.stripe_dashboard.type !== "full") ||
      (account.controller?.fees?.payer && account.controller.fees.payer !== "account") ||
      (account.controller?.losses?.payments && account.controller.losses.payments !== "stripe")) {
    throw new HttpError(400, "Connect an independent Stripe account with full Dashboard access.");
  }
  const status = accountStatus(account);
  const activated = await getSupabase().rpc("activate_payment_connection", {
    p_store_id: STORE_ID, p_owner_id: ownerId, p_account_id: account.id, p_livemode: stripeLivemode(),
    p_charges_enabled: status.charges_enabled, p_payouts_enabled: status.payouts_enabled,
    p_country: status.country ?? "", p_requirements: status.requirements,
  });
  if (activated.error || !activated.data) throw new HttpError(409, "Could not link that account. It may already belong to another store. Start the connection again.");
  // No OAuth access/refresh tokens are persisted or returned to the browser.
  return status.status;
}
export async function disconnectStripe(ownerId: string) {
  assertConnectEnabled();
  await assertStoreOwner(ownerId);
  const connection = await currentStripeConnection();
  if (!connection || connection.status === "disconnected") return;
  await getStripe().oauth.deauthorize({ client_id: connectClientId(), stripe_user_id: connection.external_account_id }, { maxNetworkRetries: 0 });
  const { error } = await getSupabase().from("payment_connections").update({
    status: "disconnected", charges_enabled: false, payouts_enabled: false, updated_at: new Date().toISOString(),
  }).eq("id", connection.id).eq("store_id", STORE_ID);
  if (error) throw new HttpError(503, "Stripe disconnected. Reload to check the updated payment status.");
}
