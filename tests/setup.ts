import { beforeEach, vi } from "vitest";
import { fakeSupabaseKey } from "./env";

vi.mock("stripe", async () => {
  const fakes = await import("./fakes");
  return { default: class {
    webhooks = { constructEvent: fakes.constructEvent };
    products = { retrieve: fakes.productsRetrieve, create: fakes.productsCreate, update: fakes.productsUpdate };
    prices = { retrieve: fakes.pricesRetrieve, create: fakes.pricesCreate };
    checkout = { sessions: { create: fakes.sessionsCreate, retrieve: fakes.sessionsRetrieve } };
    shippingRates = { retrieve: fakes.shippingRatesRetrieve };
    refunds = { create: fakes.refundsCreate };
    accounts = { retrieve: fakes.accountsRetrieve };
    oauth = { authorizeUrl: fakes.oauthAuthorizeUrl, token: fakes.oauthToken, deauthorize: fakes.oauthDeauthorize };
  } };
});
vi.mock("@supabase/supabase-js", async () => {
  const { supabase } = await import("./fakes");
  return { createClient: vi.fn(() => supabase) };
});
vi.mock("resend", async () => {
  const { sendEmail } = await import("./fakes");
  return { Resend: class { emails = { send: sendEmail }; } };
});
// next/font only works inside the Next compiler, so pages that load a font get a stand-in class name.
vi.mock("next/font/google", () => ({
  Mona_Sans: () => ({ className: "font-mona", variable: "font-mona", style: { fontFamily: "Mona Sans" } }),
}));

beforeEach(() => {
  // Default: a production deployment on Vercel that is still in Stripe test mode.
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("DEPLOYMENT_ENV", "production");
  vi.stubEnv("ALLOW_TEST_PAYMENTS_IN_PRODUCTION", "true");
  vi.stubEnv("EMAIL_ALLOWLIST", "");
  vi.stubEnv("APP_URL", "https://delivery.example.com");
  vi.stubEnv("PRODUCTION_APP_URL", "https://delivery.example.com");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
  vi.stubEnv("STRIPE_PAYMENT_LINK_ID_L2K", "plink_l2k");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("PRODUCTION_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", fakeSupabaseKey("service_role"));
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_example");
  vi.stubEnv("SUPABASE_BUCKET", "products");
  vi.stubEnv("RESEND_API_KEY", "re_example");
  vi.stubEnv("L2K_TEMPLATES_URL", "https://drive.google.com/drive/folders/templates");
  vi.stubEnv("ADMIN_SECRET", "a-long-test-admin-secret");
  vi.stubEnv("OWNER_USER_ID", "975ac870-5ab8-43a5-9d70-c051c42fc61f");
  vi.stubEnv("STRIPE_CONNECT_ENABLED", "false");
  vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "ca_testApplication");
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_connected");
});
