import { vi } from "vitest";

/** An unsigned Supabase-style key; the app reads its claims, Supabase verifies signatures. */
export function fakeSupabaseKey(role: string, ref = "example") {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ iss: "supabase", ref, role })}.signature`;
}

/** The preview Supabase project used by preview and development tests. */
export const PREVIEW_SUPABASE_URL = "https://examplepreview.supabase.co";

/** Switches the current test to a valid local development configuration. */
export function stubDevelopment(overrides: Record<string, string> = {}) {
  const values = {
    VERCEL: "", VERCEL_ENV: "", DEPLOYMENT_ENV: "development",
    APP_URL: "http://localhost:3000",
    SUPABASE_URL: PREVIEW_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: fakeSupabaseKey("service_role", "examplepreview"),
    EMAIL_ALLOWLIST: "owner@example.com,@studio.example", ...overrides,
  };
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}
