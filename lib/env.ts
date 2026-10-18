import "server-only";

const names = [
  "APP_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_BUCKET", "RESEND_API_KEY",
] as const;

export class ConfigurationError extends Error {
  constructor(name: string, reason = "is missing") { super(`Environment variable ${name} ${reason}`); }
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
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password) {
      throw new ConfigurationError(name, "must be an HTTPS URL");
    }
    if (name === "APP_URL" && (url.pathname !== "/" || url.search || url.hash)) {
      throw new ConfigurationError("APP_URL", "must be an origin without a path, query, or fragment");
    }
  }
  return env;
}
