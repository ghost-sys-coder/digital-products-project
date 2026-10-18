import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakes, seedOrder, signUrl, state, rpc, supabase } from "./fakes";
import { issueToken } from "../lib/tokens";
import { GET } from "../app/api/download/route";

const request = (token: string) => new Request(`https://delivery.example.com/api/download?token=${encodeURIComponent(token)}`);

beforeEach(() => { resetFakes(); vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("secure downloads", () => {
  it("consumes a valid token and redirects to a 60-second signed download", async () => {
    const token = issueToken();
    seedOrder({ download_token_hash: token.hash });
    const response = await GET(request(token.token));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.supabase.co/private-file?signature=example");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(rpc).toHaveBeenCalledWith("consume_download", { p_token_hash: token.hash });
    expect(supabase.storage.from).toHaveBeenCalledWith("products");
    expect(signUrl).toHaveBeenCalledWith("lead-to-kickoff/lead-to-kickoff.pdf", 60, { download: "Lead-to-Kickoff.pdf" });
    expect(state.orders[0].download_count).toBe(1);
  });

  it("rejects the sixth download", async () => {
    const token = issueToken();
    seedOrder({ download_token_hash: token.hash });
    for (let i = 0; i < 5; i++) {
      expect((await GET(request(token.token))).headers.get("location")).toContain("supabase.co");
    }
    const response = await GET(request(token.token));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://delivery.example.com/download-error");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(signUrl).toHaveBeenCalledTimes(5);
    expect(state.orders[0].download_count).toBe(5);
  });

  it("allows only five simultaneous download consumptions", async () => {
    const token = issueToken();
    seedOrder({ download_token_hash: token.hash });
    const responses = await Promise.all(Array.from({ length: 10 }, () => GET(request(token.token))));
    expect(responses.filter((response) => response.headers.get("location")?.includes("supabase.co"))).toHaveLength(5);
    expect(state.orders[0].download_count).toBe(5);
  });

  it("rejects an expired token without signing a URL", async () => {
    const token = issueToken();
    seedOrder({ download_token_hash: token.hash, token_expires_at: new Date(Date.now() - 1).toISOString() });
    expect((await GET(request(token.token))).headers.get("location")).toContain("/download-error");
    expect(signUrl).not.toHaveBeenCalled();
    expect(state.orders[0].download_count).toBe(0);
  });

  it.each(["", "garbage", "x".repeat(43)])("rejects a missing, malformed, or unknown token: %s", async (token) => {
    const response = await GET(request(token));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/download-error");
    expect(signUrl).not.toHaveBeenCalled();
  });

  it("reports transient database and signing failures without logging secrets", async () => {
    const token = issueToken();
    seedOrder({ download_token_hash: token.hash });
    state.dbError = true;
    expect((await GET(request(token.token))).status).toBe(503);
    state.dbError = false;
    signUrl.mockResolvedValueOnce({ data: null, error: { message: "Storage offline" } });
    const response = await GET(request(token.token));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(token.token);
  });
});
