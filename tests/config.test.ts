import { describe, expect, it, vi } from "vitest";
import { getEnv } from "../lib/env";
import { hashToken, issueToken } from "../lib/tokens";
import { buildDeliveryEmail } from "../lib/email";
import { PRODUCTS } from "../lib/products";

describe("configuration and token safety", () => {
  it("names each missing required variable", () => {
    for (const name of Object.keys(getEnv())) {
      const value = process.env[name];
      vi.stubEnv(name, "");
      expect(() => getEnv()).toThrow(name);
      vi.stubEnv(name, value);
    }
  });

  it("rejects unsafe URLs and accepts local HTTP development", () => {
    vi.stubEnv("APP_URL", "javascript:alert(1)");
    expect(() => getEnv()).toThrow("APP_URL");
    vi.stubEnv("APP_URL", "https://example.com/subpath");
    expect(() => getEnv()).toThrow("APP_URL");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(getEnv().APP_URL).toBe("http://localhost:3000");
    vi.stubEnv("SUPABASE_URL", "not a URL");
    expect(() => getEnv()).toThrow("SUPABASE_URL");
  });

  it("generates random 32-byte tokens and SHA-256 hashes", () => {
    const a = issueToken();
    const b = issueToken();
    expect(Buffer.from(a.token, "base64url")).toHaveLength(32);
    expect(a.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(a.token)).toBe(a.hash);
    expect(a.token).not.toBe(b.token);
  });

  it("mirrors delivery links and limits in HTML and text", () => {
    vi.stubEnv("L2K_TEMPLATES_URL", "https://drive.google.com/drive/folders/templates?a=1&b=2");
    const email = buildDeliveryEmail(PRODUCTS["lead-to-kickoff"], "test-token");
    expect(email.html).toContain("?a=1&amp;b=2");
    for (const content of [email.html, email.text]) {
      expect(content).toContain("https://delivery.example.com/api/download?token=test-token");
      expect(content).toContain("14 days and up to 5 downloads");
      expect(content).toContain("Just reply to this email");
    }
    expect(email.html).not.toContain("<table");
  });
});
