import "server-only";
import { checkDeployment, DeploymentRuleError, DEPLOYMENT_ENVS, type DeploymentEnv } from "./deployment-rules";

const names = [
  "DEPLOYMENT_ENV", "APP_URL", "PRODUCTION_APP_URL",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_URL", "PRODUCTION_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_BUCKET", "RESEND_API_KEY",
] as const;

export class ConfigurationError extends Error {
  constructor(name: string, reason = "is missing") { super(`Environment variable ${name} ${reason}`); }
}

/** Validated environment separation rules for this deployment. Throws ConfigurationError. */
export function getDeployment() {
  try { return checkDeployment(process.env); } catch (error) {
    if (error instanceof DeploymentRuleError) throw new ConfigurationError(error.variable, error.reason);
    throw error;
  }
}

/** Non-throwing label for UI (banners, robots). Null when unset or invalid. */
export function deploymentLabel(): DeploymentEnv | null {
  const value = process.env.DEPLOYMENT_ENV?.trim();
  return (DEPLOYMENT_ENVS as readonly string[]).includes(value ?? "") ? value as DeploymentEnv : null;
}

export function getEnv() {
  const env = Object.fromEntries(names.map((name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new ConfigurationError(name);
    return [name, value];
  })) as Record<(typeof names)[number], string>;

  for (const name of ["APP_URL", "SUPABASE_URL"] as const) {
    let url: URL;
    try { url = new URL(env[name]); } catch {
      throw new ConfigurationError(name, "must be a valid URL");
    }
    const local = name === "APP_URL" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (local && (process.env.VERCEL === "1" || /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY))) {
      throw new ConfigurationError("APP_URL", "must be a public HTTPS origin on Vercel or when accepting live payments");
    }
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password) {
      throw new ConfigurationError(name, "must be an HTTPS URL");
    }
    if (name === "APP_URL" && (url.pathname !== "/" || url.search || url.hash)) {
      throw new ConfigurationError("APP_URL", "must be an origin without a path, query, or fragment");
    }
  }
  // Every server path reads getEnv(), so a mixed-up environment fails closed everywhere.
  getDeployment();
  return env;
}
