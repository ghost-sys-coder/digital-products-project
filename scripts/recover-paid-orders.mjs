// Record missed sandbox purchases as pending orders. This script NEVER sends email.
// Dry run: npm run orders:recover. Apply: npm run orders:recover -- --record.
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { checkDeployment } from "../lib/deployment-rules.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(path.join(root, ".env.local"));
// Same separation rules as the app: this script can never run against production data.
const deployment = checkDeployment(process.env);
if (deployment.production || !deployment.testPayments) throw new Error("Recovery is limited to sandbox/test purchases.");
const record = process.argv.includes("--record");
const STORE_ID = "c9fdc8a4-3d95-4d43-97f2-b650386179d2";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 1 });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

try {
  const { data: checkouts, error } = await db.from("checkouts").select("*").eq("store_id", STORE_ID)
    .order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error("Could not read checkout reservations.");
  let recorded = 0;
  let eligible = 0;
  for (const checkout of checkouts) {
    if (!checkout.stripe_session_id) continue;
    const { data: existing, error: readError } = await db.from("orders").select("id")
      .eq("stripe_session_id", checkout.stripe_session_id).maybeSingle();
    if (readError) throw new Error("Could not check existing orders.");
    if (existing) continue;
    // Read payment status from Stripe itself, never from browser input or a local fixture.
    let connection = null;
    if (checkout.payment_connection_id) {
      const result = await db.from("payment_connections").select("*").eq("id", checkout.payment_connection_id).eq("store_id", STORE_ID).single();
      if (result.error || !result.data || result.data.provider !== "stripe" || result.data.livemode) throw new Error("Could not resolve the sandbox checkout's payment account.");
      connection = result.data;
    }
    const session = await stripe.checkout.sessions.retrieve(checkout.stripe_session_id, {}, connection ? { stripeAccount: connection.external_account_id } : {});
    if (session.payment_status !== "paid") continue;
    const matches = !session.livemode && session.mode === "payment" && session.id === checkout.stripe_session_id &&
      session.client_reference_id === checkout.id && session.metadata?.app === "veilcode-store" &&
      session.metadata.checkout_id === checkout.id && session.metadata.store_id === STORE_ID &&
      session.metadata.product_id === checkout.product_id && session.currency === checkout.currency &&
      session.amount_subtotal === checkout.amount && session.customer_details?.email && checkout.product_snapshot?.storagePath;
    if (!matches) throw new Error(`Paid session failed reservation checks: ${session.id}`);
    eligible++;
    if (record) {
      const { error: insertError } = await db.from("orders").insert({
        stripe_session_id: session.id, store_id: STORE_ID, product_id: checkout.product_id,
        product_snapshot: checkout.product_snapshot, email: session.customer_details.email,
        ...(connection ? { payment_connection_id: connection.id } : {}),
        amount_total: session.amount_total, currency: session.currency,
        download_token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        token_expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
        max_downloads: 5, email_status: "pending",
      });
      // An intervening webhook can insert first; never overwrite its delivery state.
      if (insertError && insertError.code !== "23505") throw new Error("Could not record the paid order.");
      if (insertError?.code === "23505") {
        const duplicate = await db.from("orders").select("id").eq("stripe_session_id", session.id).maybeSingle();
        if (duplicate.error || !duplicate.data) throw new Error("Could not record the paid order safely.");
      }
      if (!insertError) recorded++;
    }
    console.log(JSON.stringify({ sessionId: session.id, product: checkout.product_snapshot.name, action: record ? "recorded-or-already-present" : "eligible", emailSent: false }));
  }
  console.log(JSON.stringify({ dryRun: !record, eligible, recorded, emailSent: false }));
} catch (error) {
  // Provider errors can contain request data. Report only an actionable local message.
  console.error(error instanceof Error && !error.message.includes("key") ? error.message : "Recovery failed. Check your service configuration.");
  process.exitCode = 1;
}
