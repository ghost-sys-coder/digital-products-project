// Verifies an env file obeys the environment-separation rules, then proves it live.
//
//   npm run env:check -- .env.prev.local
//   npm run env:check -- .env.prod.local --offline
//
// Live checks are read-only. Secrets are never printed.
// Exit code 1 means a check failed: do not deploy that configuration.
import { readEnvFile } from "./lib/env-file.mjs";
import { checkDeployment, DeploymentRuleError } from "../lib/deployment-rules.ts";

const file = process.argv[2];
if (!file) throw new Error("Usage: npm run env:check -- <env file> [--offline]");
const offline = process.argv.includes("--offline");
const vars = readEnvFile(file);
let failures = 0;
const pass = (message) => console.log(`  PASS  ${message}`);
const fail = (message) => { failures += 1; console.log(`  FAIL  ${message}`); };
const check = (ok, passMessage, failMessage) => { if (ok) pass(passMessage); else fail(failMessage); };

console.log(`\nChecking ${file}\n`);
let deployment;
try {
  deployment = checkDeployment(vars);
  pass(`configuration rules (${deployment.env}${deployment.testPayments ? ", Stripe test mode" : ", Stripe LIVE mode"})`);
} catch (error) {
  if (!(error instanceof DeploymentRuleError)) throw error;
  fail(error.message);
  console.log("\nFix the configuration before running live checks.\n");
  process.exit(1);
}
if (offline) process.exit(failures ? 1 : 0);

const url = vars.SUPABASE_URL.replace(/\/$/, "");
const serviceHeaders = { apikey: vars.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${vars.SUPABASE_SERVICE_ROLE_KEY}` };
const ok = (status) => status >= 200 && status < 300;

// Auth: the publishable key works, and nobody can create accounts in an owner-only store.
const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: vars.SUPABASE_PUBLISHABLE_KEY } });
check(ok(settings.status), "publishable key is accepted for owner sign-in", `publishable key rejected by Supabase Auth (HTTP ${settings.status})`);
if (ok(settings.status)) {
  const auth = await settings.json();
  check(auth.disable_signup === true, "public sign-ups are disabled", "public sign-ups are ENABLED. Turn off Authentication > Sign In / Providers > Allow new users to sign up");
}

// Database: the server key reaches this project's store.
const stores = await fetch(`${url}/rest/v1/stores?select=id&limit=1`, { headers: serviceHeaders });
if (ok(stores.status)) {
  const rows = await stores.json();
  check(Array.isArray(rows) && rows.length === 1, "service key reads the store", "the stores table is empty. Apply the migrations");
} else fail(`service key cannot read the store (HTTP ${stores.status}). Check the key belongs to ${new URL(url).hostname}`);

// Anonymous visitors must not read data directly.
const anon = await fetch(`${url}/rest/v1/orders?select=id&limit=1`, { headers: { apikey: vars.SUPABASE_PUBLISHABLE_KEY } });
check(!ok(anon.status), "anonymous requests cannot read orders", "anonymous requests can read ORDERS");

// Storage: the private bucket exists and is not public.
const bucket = await fetch(`${url}/storage/v1/bucket/${encodeURIComponent(vars.SUPABASE_BUCKET)}`, { headers: serviceHeaders });
if (ok(bucket.status)) {
  const info = await bucket.json();
  check(info.public === false, `bucket "${vars.SUPABASE_BUCKET}" is private`, `bucket "${vars.SUPABASE_BUCKET}" is PUBLIC`);
} else fail(`bucket "${vars.SUPABASE_BUCKET}" not found (HTTP ${bucket.status})`);

console.log(failures ? `\n${failures} check(s) failed. Do not deploy this configuration.\n` : "\nAll checks passed.\n");
process.exit(failures ? 1 : 0);
