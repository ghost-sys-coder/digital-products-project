// Environment separation rules shared by the app (lib/env.ts) and the CLI scripts.
// Dependency-free on purpose: scripts import this file directly with Node's TypeScript support.
//
// Production and preview use separate Supabase projects, Stripe modes, email keys, and
// addresses. These rules make a mixed-up configuration fail closed instead of letting a
// preview deployment touch production data, money, or customers. See docs/environments.md.

export const DEPLOYMENT_ENVS = ["production", "preview", "development"] as const;
export type DeploymentEnv = (typeof DEPLOYMENT_ENVS)[number];

export class DeploymentRuleError extends Error {
  readonly variable: string;
  readonly reason: string;
  constructor(variable: string, reason: string) {
    super(`Environment variable ${variable} ${reason}`);
    this.variable = variable;
    this.reason = reason;
  }
}

export type Deployment = {
  env: DeploymentEnv;
  production: boolean;
  /** True when Stripe is in test mode (always true outside production). */
  testPayments: boolean;
  /** Recipients non-production email may reach. Empty in production (no restriction). */
  emailAllowlist: string[];
};

type Vars = Record<string, string | undefined>;

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return claims && typeof claims === "object" && !Array.isArray(claims) ? claims as Record<string, unknown> : null;
  } catch { return null; }
}

function parseUrl(name: string, value: string) {
  try { return new URL(value); } catch { throw new DeploymentRuleError(name, "must be a valid URL"); }
}

/** Entries are full addresses (owner@example.com) or whole domains (@example.com). */
export function parseEmailAllowlist(value: string | undefined) {
  const entries = (value ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  for (const entry of entries) {
    if (!/^([^\s@<>,]+)?@[^\s@<>,]+\.[^\s@<>,]+$/.test(entry)) {
      throw new DeploymentRuleError("EMAIL_ALLOWLIST", "must be a comma-separated list of addresses or @domains");
    }
  }
  return entries;
}

export function emailAllowed(email: string, allowlist: string[]) {
  const address = email.trim().toLowerCase();
  return allowlist.some((entry) => entry.startsWith("@") ? address.endsWith(entry) : address === entry);
}

/** Validates the deployment's configuration. Throws DeploymentRuleError naming the variable at fault. */
export function checkDeployment(vars: Vars, now = Date.now()): Deployment {
  const need = (name: string) => {
    const value = vars[name]?.trim();
    if (!value) throw new DeploymentRuleError(name, "is missing");
    return value;
  };

  // 1. The declared environment must match where the code is actually running.
  const declared = need("DEPLOYMENT_ENV");
  if (!(DEPLOYMENT_ENVS as readonly string[]).includes(declared)) {
    throw new DeploymentRuleError("DEPLOYMENT_ENV", "must be production, preview, or development");
  }
  const env = declared as DeploymentEnv;
  const onVercel = vars.VERCEL === "1";
  if (onVercel && vars.VERCEL_ENV !== env) {
    throw new DeploymentRuleError("DEPLOYMENT_ENV", `is "${env}" but this is a Vercel ${vars.VERCEL_ENV || "unknown"} deployment. Set it separately for each Vercel environment.`);
  }
  if (!onVercel && env === "production") {
    throw new DeploymentRuleError("DEPLOYMENT_ENV", "is production, which only runs on Vercel. Use development on your own machine.");
  }
  const production = env === "production";

  // 2. Money: only production may take real payments.
  const stripeKey = need("STRIPE_SECRET_KEY");
  const live = /^(sk|rk)_live_/.test(stripeKey);
  const test = /^(sk|rk)_test_/.test(stripeKey);
  if (!live && !test) throw new DeploymentRuleError("STRIPE_SECRET_KEY", "must be a Stripe secret (sk_) or restricted (rk_) key");
  if (!production && live) {
    throw new DeploymentRuleError("STRIPE_SECRET_KEY", `is a live key, but ${env} must use a Stripe test-mode key`);
  }
  if (production && test && vars.ALLOW_TEST_PAYMENTS_IN_PRODUCTION !== "true") {
    throw new DeploymentRuleError("STRIPE_SECRET_KEY", "is a test-mode key in production, so anyone could get products with a test card. Use a live key, or set ALLOW_TEST_PAYMENTS_IN_PRODUCTION=true only while the store is closed to the public.");
  }

  // 3. Addresses: non-production must never generate production links.
  const appOrigin = parseUrl("APP_URL", need("APP_URL")).origin;
  const productionOrigin = parseUrl("PRODUCTION_APP_URL", need("PRODUCTION_APP_URL")).origin;
  if (production && appOrigin !== productionOrigin) {
    throw new DeploymentRuleError("APP_URL", "must equal PRODUCTION_APP_URL in production");
  }
  if (!production && appOrigin === productionOrigin) {
    throw new DeploymentRuleError("APP_URL", `is the production address, but this is ${env}`);
  }

  // 4. Data: each environment has its own Supabase project, and keys must belong to it.
  const supabaseHost = parseUrl("SUPABASE_URL", need("SUPABASE_URL")).hostname;
  const productionSupabaseHost = parseUrl("PRODUCTION_SUPABASE_URL", need("PRODUCTION_SUPABASE_URL")).hostname;
  if (production && supabaseHost !== productionSupabaseHost) {
    throw new DeploymentRuleError("SUPABASE_URL", "must equal PRODUCTION_SUPABASE_URL in production");
  }
  if (!production && supabaseHost === productionSupabaseHost) {
    throw new DeploymentRuleError("SUPABASE_URL", `is the production Supabase project, but ${env} must use the preview project`);
  }
  const ref = supabaseHost.endsWith(".supabase.co") ? supabaseHost.split(".")[0] : null;
  const key = need("SUPABASE_SERVICE_ROLE_KEY");
  if (!key.startsWith("sb_secret_")) {
    const claims = decodeJwtClaims(key);
    if (!claims) throw new DeploymentRuleError("SUPABASE_SERVICE_ROLE_KEY", "must be a Supabase service_role or sb_secret_ key");
    if (claims.role !== "service_role") {
      throw new DeploymentRuleError("SUPABASE_SERVICE_ROLE_KEY", `has role "${String(claims.role)}"; the server needs the service_role key`);
    }
    if (ref && typeof claims.ref === "string" && claims.ref !== ref) {
      throw new DeploymentRuleError("SUPABASE_SERVICE_ROLE_KEY", "belongs to a different Supabase project than SUPABASE_URL");
    }
    if (typeof claims.exp === "number" && claims.exp * 1000 <= now) {
      throw new DeploymentRuleError("SUPABASE_SERVICE_ROLE_KEY", "has expired");
    }
  }
  const publishable = need("SUPABASE_PUBLISHABLE_KEY");
  const publishableClaims = decodeJwtClaims(publishable);
  if (publishable.startsWith("sb_secret_") || publishableClaims?.role === "service_role") {
    throw new DeploymentRuleError("SUPABASE_PUBLISHABLE_KEY", "must be the public (publishable/anon) key, not a secret key");
  }
  if (ref && typeof publishableClaims?.ref === "string" && publishableClaims.ref !== ref) {
    throw new DeploymentRuleError("SUPABASE_PUBLISHABLE_KEY", "belongs to a different Supabase project than SUPABASE_URL");
  }

  // 5. Customers: non-production may only email addresses you control.
  const emailAllowlist = production ? [] : parseEmailAllowlist(vars.EMAIL_ALLOWLIST);
  if (!production && !emailAllowlist.length) {
    throw new DeploymentRuleError("EMAIL_ALLOWLIST", `is required in ${env} so test orders only email addresses you control`);
  }

  return { env, production, testPayments: test, emailAllowlist };
}
