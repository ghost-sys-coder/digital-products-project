import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeployment, getEnv } from "../lib/env";
import { checkDeployment, emailAllowed, parseEmailAllowlist } from "../lib/deployment-rules";
import { sendDeliveryEmail } from "../lib/email";
import { PRODUCTS } from "../lib/products";
import { resetFakes, sendEmail } from "./fakes";
import { fakeSupabaseKey, stubDevelopment } from "./env";

function stubPreview(overrides: Record<string, string> = {}) {
  stubDevelopment({ VERCEL: "1", VERCEL_ENV: "preview", DEPLOYMENT_ENV: "preview", APP_URL: "https://staging.example.com", ...overrides });
}
const deliver = (email: string) => sendDeliveryEmail({
  email, sessionId: "cs_test_1", product: PRODUCTS["lead-to-kickoff"], token: "token", tokenHash: "a".repeat(64),
});

beforeEach(() => resetFakes());

describe("declared environment", () => {
  it("requires DEPLOYMENT_ENV and accepts only known values", () => {
    vi.stubEnv("DEPLOYMENT_ENV", "");
    expect(() => getEnv()).toThrow("DEPLOYMENT_ENV");
    vi.stubEnv("DEPLOYMENT_ENV", "staging");
    expect(() => getEnv()).toThrow("DEPLOYMENT_ENV");
  });

  it("refuses a value copied into the wrong Vercel environment", () => {
    vi.stubEnv("DEPLOYMENT_ENV", "preview");
    expect(() => getEnv()).toThrow(/DEPLOYMENT_ENV is "preview" but this is a Vercel production deployment/);
    stubPreview({ DEPLOYMENT_ENV: "production" });
    expect(() => getEnv()).toThrow("DEPLOYMENT_ENV");
  });

  it("never runs production off Vercel", () => {
    vi.stubEnv("VERCEL", "");
    expect(() => getEnv()).toThrow(/only runs on Vercel/);
  });

  it("accepts correct preview and development configurations", () => {
    stubPreview();
    expect(getDeployment()).toMatchObject({ env: "preview", production: false, testPayments: true });
    stubDevelopment();
    expect(getDeployment()).toMatchObject({ env: "development", production: false });
  });
});

describe("payments", () => {
  it("refuses live Stripe keys outside production", () => {
    for (const key of ["sk_live_example", "rk_live_example"]) {
      stubPreview({ STRIPE_SECRET_KEY: key });
      expect(() => getEnv()).toThrow(/STRIPE_SECRET_KEY is a live key, but preview/);
    }
  });

  it("requires an explicit opt-in for test payments in production", () => {
    vi.stubEnv("ALLOW_TEST_PAYMENTS_IN_PRODUCTION", "");
    expect(() => getEnv()).toThrow(/test-mode key in production/);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_example");
    expect(getDeployment()).toMatchObject({ production: true, testPayments: false });
  });

  it("rejects values that are not Stripe secret keys", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "pk_live_example");
    expect(() => getEnv()).toThrow("STRIPE_SECRET_KEY");
  });
});

describe("addresses", () => {
  it("pins production to PRODUCTION_APP_URL", () => {
    vi.stubEnv("APP_URL", "https://staging.example.com");
    expect(() => getEnv()).toThrow("APP_URL must equal PRODUCTION_APP_URL");
    vi.stubEnv("PRODUCTION_APP_URL", "");
    expect(() => getEnv()).toThrow("PRODUCTION_APP_URL");
  });

  it("keeps preview off the production address", () => {
    stubPreview({ APP_URL: "https://delivery.example.com" });
    expect(() => getEnv()).toThrow(/APP_URL is the production address/);
  });
});

describe("Supabase project", () => {
  it("pins production to the production project", () => {
    vi.stubEnv("SUPABASE_URL", "https://examplepreview.supabase.co");
    expect(() => getEnv()).toThrow("SUPABASE_URL must equal PRODUCTION_SUPABASE_URL");
    vi.stubEnv("PRODUCTION_SUPABASE_URL", "");
    expect(() => getEnv()).toThrow("PRODUCTION_SUPABASE_URL");
  });

  it("refuses the production project outside production, even with matching keys", () => {
    stubPreview({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: fakeSupabaseKey("service_role") });
    expect(() => getEnv()).toThrow(/is the production Supabase project, but preview/);
  });

  it("refuses a production key copied into preview", () => {
    stubPreview({ SUPABASE_SERVICE_ROLE_KEY: fakeSupabaseKey("service_role", "example") });
    expect(() => getEnv()).toThrow(/different Supabase project than SUPABASE_URL/);
  });

  it("refuses non-server keys, expired keys, and non-keys in the server slot", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", fakeSupabaseKey("anon"));
    expect(() => getEnv()).toThrow(/needs the service_role key/);
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", `${part({ alg: "HS256" })}.${part({ role: "service_role", ref: "example", exp: 1 })}.sig`);
    expect(() => getEnv()).toThrow(/expired/);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "not-a-key");
    expect(() => getEnv()).toThrow("SUPABASE_SERVICE_ROLE_KEY");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_example");
    expect(getEnv().SUPABASE_SERVICE_ROLE_KEY).toBe("sb_secret_example");
  });

  it("refuses a secret key, or another project's key, in the publishable slot", () => {
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", fakeSupabaseKey("service_role"));
    expect(() => getEnv()).toThrow("SUPABASE_PUBLISHABLE_KEY");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_secret_example");
    expect(() => getEnv()).toThrow("SUPABASE_PUBLISHABLE_KEY");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", fakeSupabaseKey("anon", "examplepreview"));
    expect(() => getEnv()).toThrow(/different Supabase project/);
  });

  it("signs owners in with the public key only", async () => {
    vi.resetModules();
    const { createClient } = await import("@supabase/supabase-js");
    const { authClient } = await import("../lib/auth");
    authClient();
    expect(vi.mocked(createClient).mock.calls.at(-1)![1]).toBe("sb_publishable_example");
  });
});

describe("customer email", () => {
  it("requires an allowlist outside production and validates it", () => {
    stubPreview({ EMAIL_ALLOWLIST: "" });
    expect(() => getEnv()).toThrow("EMAIL_ALLOWLIST");
    stubPreview({ EMAIL_ALLOWLIST: "not an email" });
    expect(() => getEnv()).toThrow("EMAIL_ALLOWLIST");
  });

  it("matches exact addresses and whole domains only", () => {
    const list = parseEmailAllowlist(" Owner@Example.com , @studio.example ");
    expect(emailAllowed("owner@example.com", list)).toBe(true);
    expect(emailAllowed("anyone@studio.example", list)).toBe(true);
    expect(emailAllowed("owner@example.com.evil.test", list)).toBe(false);
    expect(emailAllowed("someone@notstudio.example", list)).toBe(false);
  });

  it("blocks non-allowlisted buyers in preview and labels preview mail", async () => {
    stubPreview();
    await expect(deliver("real.customer@gmail.com")).rejects.toThrow("not allowed outside production");
    expect(sendEmail).not.toHaveBeenCalled();
    await deliver("owner@example.com");
    expect(sendEmail.mock.calls[0][0].subject).toBe("[Preview] Your Lead to Kickoff kit is ready");
  });

  it("delivers normally to any buyer in production", async () => {
    await deliver("real.customer@gmail.com");
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: "real.customer@gmail.com", subject: "Your Lead to Kickoff kit is ready" });
  });
});

describe("rules module", () => {
  it("is usable without the app (scripts share it)", () => {
    expect(() => checkDeployment({})).toThrow("DEPLOYMENT_ENV is missing");
  });
});
