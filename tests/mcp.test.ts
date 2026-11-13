import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakes, seedOrder, seedProduct, state, storageList, upload } from "./fakes";
import { approveAuthorization, createPersonalToken, exchangeToken, readAuthorizeRequest, registerClient, revokeConnection, verifyBearer, verifyPkce } from "../lib/mcp/oauth";
import { appendUpload, finishUpload, privateAddress, startUpload, downloadFile } from "../lib/mcp/files";
import type { McpScope } from "../lib/database.types";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: vi.fn(), delete: vi.fn() }) }));

import { POST as mcpPost } from "../app/api/mcp/route";
import { POST as tokenPost } from "../app/api/oauth/token/route";
import { POST as registerPost } from "../app/api/oauth/register/route";
import { POST as authorizePost } from "../app/api/oauth/authorize/route";
import { GET as resourceMetadata } from "../app/.well-known/oauth-protected-resource/[[...path]]/route";
import { GET as serverMetadata } from "../app/.well-known/oauth-authorization-server/[[...path]]/route";

const ORIGIN = "https://delivery.example.com";
const VERIFIER = "a".repeat(20) + "-verifier-" + "b".repeat(20);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

beforeEach(() => {
  resetFakes(); jar.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); });

async function connect(scopes: McpScope[] = ["read", "research", "build"]) {
  return (await createPersonalToken("Claude Code", scopes)).token;
}
let rpcId = 0;
async function rpc(token: string | null, method: string, params: Record<string, unknown> = {}) {
  const response = await mcpPost(new Request(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  }));
  return { status: response.status, headers: response.headers, body: await response.json() as { result?: Record<string, unknown> & { structuredContent?: Record<string, unknown>; isError?: boolean; content?: { text: string }[]; tools?: { name: string }[] }; error?: unknown } };
}
const call = async (token: string, name: string, args: Record<string, unknown> = {}) => (await rpc(token, "tools/call", { name, arguments: args })).body.result!;

describe("assistant sign-in (OAuth 2.1)", () => {
  it("registers an app, gets the owner's approval, and issues rotating tokens", async () => {
    const client = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] });
    expect(client).toMatchObject({ client_name: "Claude", token_endpoint_auth_method: "none" });
    expect(client).not.toHaveProperty("client_secret");

    const request = await readAuthorizeRequest({ client_id: client.client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: CHALLENGE, code_challenge_method: "S256", state: "xyz", scope: "read research" });
    expect(request.scopes).toEqual(["read", "research"]);
    const location = new URL(await approveAuthorization(request, ["read"]));
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get("state")).toBe("xyz");
    const code = location.searchParams.get("code")!;

    const form = (values: Record<string, string>) => new URLSearchParams({ client_id: client.client_id, ...values });
    await expect(exchangeToken(form({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: "wrong".repeat(10) }), null)).rejects.toThrow("PKCE");
    // The failed attempt used the code up: codes are single-use.
    await expect(exchangeToken(form({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: VERIFIER }), null)).rejects.toThrow("invalid or expired");

    const second = new URL(await approveAuthorization(request, ["read"])).searchParams.get("code")!;
    const tokens = await exchangeToken(form({ grant_type: "authorization_code", code: second, redirect_uri: REDIRECT, code_verifier: VERIFIER }), null);
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "read" });
    expect(state.mcp_connections).toHaveLength(1); // reconnecting reuses the app's connection
    expect(JSON.stringify(state.mcp_secrets)).not.toContain(tokens.access_token); // stored hashed only

    const caller = await verifyBearer(`Bearer ${tokens.access_token}`);
    expect(caller?.scopes).toEqual(["read"]);

    const refreshed = await exchangeToken(form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }), null);
    expect(refreshed.access_token).not.toBe(tokens.access_token);
    // Reusing a spent refresh token is treated as theft: every token for the connection stops working.
    await expect(exchangeToken(form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }), null)).rejects.toThrow("invalid or expired");
    expect(await verifyBearer(`Bearer ${refreshed.access_token}`)).toBeNull();
  });

  it("checks PKCE, redirects and confidential clients", async () => {
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
    expect(verifyPkce("short", CHALLENGE)).toBe(false);
    await expect(registerClient({ redirect_uris: ["http://evil.example/cb"] })).rejects.toThrow("redirect");
    await expect(registerClient({ redirect_uris: ["https://ok.example/cb#frag"] })).rejects.toThrow("redirect");
    expect(await registerClient({ redirect_uris: ["http://localhost:6274/callback"] })).toMatchObject({ client_name: "Assistant" });

    const client = await registerClient({ client_name: "ChatGPT", redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], token_endpoint_auth_method: "client_secret_post" });
    expect(client.client_secret).toMatch(/^vccs_/);
    await expect(readAuthorizeRequest({ client_id: client.client_id, redirect_uri: "https://evil.example/cb", response_type: "code", code_challenge: CHALLENGE, code_challenge_method: "S256" })).rejects.toThrow("return address");
    await expect(readAuthorizeRequest({ client_id: client.client_id, response_type: "code", code_challenge: CHALLENGE, code_challenge_method: "plain" })).rejects.toThrow("PKCE");

    const request = await readAuthorizeRequest({ client_id: client.client_id, response_type: "code", code_challenge: CHALLENGE, code_challenge_method: "S256" });
    const code = new URL(await approveAuthorization(request, ["read", "build"])).searchParams.get("code")!;
    const base = { grant_type: "authorization_code", code, code_verifier: VERIFIER, client_id: client.client_id };
    await expect(exchangeToken(new URLSearchParams({ ...base, client_secret: "wrong" }), null)).rejects.toThrow("authentication");
    const basic = `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64")}`;
    expect(await exchangeToken(new URLSearchParams({ grant_type: "authorization_code", code: new URL(await approveAuthorization(request, ["read"])).searchParams.get("code")!, code_verifier: VERIFIER }), basic)).toMatchObject({ scope: "read" });
  });

  it("asks the signed-in owner, over the store's own origin", async () => {
    const client = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] });
    const body = new URLSearchParams({ client_id: client.client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: CHALLENGE, code_challenge_method: "S256", state: "s1", decision: "approve" });
    body.append("grant", "read"); body.append("grant", "research");
    const post = (origin = ORIGIN) => authorizePost(new Request(`${ORIGIN}/api/oauth/authorize`, { method: "POST", headers: { origin, "Content-Type": "application/x-www-form-urlencoded" }, body }));

    expect((await post()).status).toBe(401);
    jar.set("veilcode_owner", "owner-token");
    expect((await post("https://evil.example")).status).toBe(403);
    const approved = await post();
    expect(approved.status).toBe(303);
    expect(new URL(approved.headers.get("location")!).searchParams.get("code")).toMatch(/^vcac_/);
    expect(state.mcp_connections[0]).toMatchObject({ name: "Claude", scopes: ["read", "research"] });

    body.set("decision", "deny");
    const denied = new URL((await post()).headers.get("location")!);
    expect(denied.searchParams.get("error")).toBe("access_denied");
    expect(denied.searchParams.get("state")).toBe("s1");
  });

  it("publishes the metadata MCP clients discover, and the token and registration endpoints", async () => {
    expect(await resourceMetadata().json()).toMatchObject({ resource: `${ORIGIN}/api/mcp`, authorization_servers: [ORIGIN] });
    expect(await serverMetadata().json()).toMatchObject({ authorization_endpoint: `${ORIGIN}/oauth/authorize`, code_challenge_methods_supported: ["S256"], registration_endpoint: `${ORIGIN}/api/oauth/register` });

    const registered = await registerPost(new Request(`${ORIGIN}/api/oauth/register`, { method: "POST", body: JSON.stringify({ client_name: "Codex", redirect_uris: ["http://127.0.0.1:5555/cb"] }) }));
    expect(registered.status).toBe(201);
    expect(registered.headers.get("access-control-allow-origin")).toBe("*");

    const bad = await tokenPost(new Request(`${ORIGIN}/api/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=password&client_id=nope" }));
    expect(bad.status).toBe(401);
    expect(await bad.json()).toMatchObject({ error: "invalid_client" });
  });
});

describe("the MCP endpoint", () => {
  it("turns away callers without a valid token and says where to sign in", async () => {
    const response = await rpc(null, "tools/list");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`);
    const wrong = await rpc("vcs_not-a-real-token-at-all-000000", "tools/list");
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("www-authenticate")).toMatch(/^Bearer error="invalid_token".*resource_metadata=/);

    const token = await connect();
    await revokeConnection(state.mcp_connections[0].id as string);
    expect((await rpc(token, "tools/list")).status).toBe(401);
  });

  it("offers only the tools a connection's access allows", async () => {
    const readOnly = await connect(["read"]);
    const names = (await rpc(readOnly, "tools/list")).body.result!.tools!.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["get_store_overview", "list_orders", "get_order", "list_products", "get_store", "list_research_ideas"]));
    expect(names).not.toContain("save_research_idea");
    expect(names).not.toContain("save_store_draft");

    const builder = (await rpc(await connect(["read", "research", "build"]), "tools/list")).body.result!.tools!;
    const importFile = builder.find((tool) => tool.name === "import_file") as unknown as { _meta?: Record<string, unknown> };
    expect(importFile._meta).toEqual({ "openai/fileParams": ["file"] });
    expect(builder.map((tool) => tool.name)).not.toContain("publish_store");
  });

  it("reports performance, and keeps customer details out of lists", async () => {
    seedOrder({ email: "jane@example.com", amount_total: 2900, product_snapshot: { name: "Studio Kit" } as never, stripe_session_id: "cs_test_aaaa1111bbbb" });
    seedOrder({
      email: "sam@example.com", amount_total: 4900, stripe_session_id: "cs_test_cccc2222dddd", kind: "physical", fulfillment_status: "needs_ordering", customer_name: "Sam Lee",
      shipping_address: { name: "Sam Lee", line1: "1 Main St", line2: null, city: "Austin", state: "TX", postal_code: "78701", country: "US", phone: null },
      physical_snapshot: { brand: { name: "Glow", supportEmail: null }, currency: "usd", items: [{ productId: "p", variantId: "v", name: "Glow Lamp", variantLabel: "Black", sku: null, unitAmount: 4900, quantity: 1, imagePath: null, supplierUrl: null, supplierSku: null }], shippingOptions: [] },
    });
    const token = await connect(["read"]);

    const overview = (await call(token, "get_store_overview")).structuredContent!;
    expect(overview).toMatchObject({ ordersLast7Days: 2, needsAttention: { toOrderFromSupplier: 1, downloadEmailsNotSent: 1 } });
    expect(overview.sales).toEqual([expect.objectContaining({ currency: "USD", orders: 2, gross: "$78", net: "$78", averageOrder: "$39" })]);

    const list = await call(token, "list_orders", { status: "needs_ordering" });
    expect(list.structuredContent).toMatchObject({ count: 1, orders: [{ ref: "2222DDDD", product: "Glow Lamp (Black)", shipTo: "US", status: "needs ordering from the supplier" }] });
    expect(JSON.stringify(list)).not.toMatch(/sam@example|Sam Lee|Main St/);

    const order = (await call(token, "get_order", { reference: "2222dddd" })).structuredContent!;
    expect(order).toMatchObject({ customer: { name: "Sam Lee", email: "sam@example.com" }, shippingAddress: "1 Main St, Austin, TX, 78701, US" });

    expect(state.mcp_activity.map((entry) => entry.tool)).toEqual(["get_store_overview", "list_orders", "get_order"]);
    const missing = await call(token, "get_order", { reference: "ZZZZZZZZ" });
    expect(missing.isError).toBe(true);
    expect(state.mcp_activity.at(-1)).toMatchObject({ tool: "get_order", ok: false });
  });

  it("saves research from anywhere onto the board", async () => {
    const token = await connect(["read", "research"]);
    const saved = await call(token, "save_research_idea", {
      title: "Notion client portal template", kind: "digital", target_price_cents: 2900,
      ads: [{ url: "https://www.tiktok.com/@maker/video/1", page: "maker", startedAt: "2026-09-01", note: "3 versions" }],
    });
    expect(saved.structuredContent).toMatchObject({ idea: { kind: "digital", stage: "saved", target_price: 2900, ads: [expect.objectContaining({ page: "maker", source: "manual" })] } });
    const id = (saved.structuredContent!.idea as { id: string }).id;
    expect((await call(token, "update_research_idea", { id, stage: "researching" })).structuredContent).toMatchObject({ idea: { stage: "researching" } });
    const board = (await call(token, "list_research_ideas")).structuredContent!;
    expect(board.ideas).toEqual([expect.objectContaining({ title: "Notion client portal template", kind: "digital", profitPerSale: "$27.86" })]);
  });

  it("builds draft stores, adds images, and never touches a live store", async () => {
    storageList.mockResolvedValue({ data: [], error: null });
    upload.mockResolvedValue({ data: {}, error: null });
    const token = await connect();
    const created = (await call(token, "create_store", { name: "Glow Lamp", slug: "glow-lamp", theme: "bold-dark" })).structuredContent!;
    const productId = created.productId as string;

    const store = (await call(token, "get_store", { product_id: productId })).structuredContent!;
    expect(store).toMatchObject({ editable: true, status: "draft" });
    expect(store.guide).toContain("save_store_draft");

    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(80)]);
    const image = (await call(token, "import_file", { product_id: productId, purpose: "store_media", base64: png.toString("base64") })).structuredContent!;
    expect(image).toMatchObject({ kind: "image" });
    expect(image.path).toMatch(new RegExp(`${productId}/media/[0-9a-f-]+\\.png$`));
    const notImage = await call(token, "import_file", { product_id: productId, purpose: "store_media", base64: Buffer.from("hello world, not an image").toString("base64") });
    expect(notImage.isError).toBe(true);

    const document = store.document as Record<string, unknown>;
    const saved = (await call(token, "save_store_draft", { document: { ...document, tagline: "Light that sets the mood", status: "published" } })).structuredContent!;
    expect(saved).toMatchObject({ status: "draft", slug: "glow-lamp" });
    expect(state.products.find((product) => product.id === productId)).toMatchObject({ tagline: "Light that sets the mood", status: "draft" });

    const live = seedProduct({ kind: "physical", slug: "live-one", status: "published" });
    const refused = await call(token, "save_store_draft", { document: { ...document, id: live.id } });
    expect(refused.isError).toBe(true);
    expect(refused.content![0].text).toContain("live");
  });
});

describe("with the official MCP client", () => {
  it("initialises, lists tools and calls one over Streamable HTTP", async () => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const token = await connect(["read"]);
    // The client's requests go straight to the route handler, as they would over the network.
    const fetchToRoute = (async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.method === "POST") return mcpPost(request);
      return new Response(null, { status: 405 });
    }) as typeof fetch;
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${ORIGIN}/api/mcp`), { fetch: fetchToRoute, requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    expect(client.getServerVersion()).toMatchObject({ name: "veilcode-studio" });
    expect(client.getInstructions()).toContain("VeilCode Studio");
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === "list_orders")?.annotations).toMatchObject({ readOnlyHint: true });
    const result = await client.callTool({ name: "list_products", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ products: [] });
    await client.close();
  });
});

describe("digital product drafts", () => {
  it("creates and edits a draft, linked to its research idea, and leaves live products alone", async () => {
    const token = await connect();
    const idea = (await call(token, "save_research_idea", { title: "Client onboarding kit", kind: "digital" })).structuredContent!.idea as { id: string };
    const draft = await call(token, "create_digital_product_draft", {
      name: "Client Onboarding Kit", slug: "client-onboarding-kit", tagline: "Start every project right", price_cents: 2400, includes: ["Welcome email", "Kickoff agenda"], research_idea_id: idea.id,
    });
    expect(draft.isError).toBeFalsy();
    expect(draft.structuredContent).toMatchObject({ status: "draft", price: 2400, priceLabel: "$24", includes: ["Welcome email", "Kickoff agenda"], hasDownload: false });
    expect(state.research_products[0]).toMatchObject({ store_product_id: draft.structuredContent!.id, stage: "testing" });

    const edited = await call(token, "update_digital_product_draft", { product_id: draft.structuredContent!.id, description: "Everything to onboard a client in one afternoon." });
    expect(edited.structuredContent).toMatchObject({ description: "Everything to onboard a client in one afternoon.", price: 2400 });

    const live = seedProduct({ status: "published" });
    const refused = await call(token, "update_digital_product_draft", { product_id: live.id, name: "Changed" });
    expect(refused.isError).toBe(true);
    expect(state.products.find((product) => product.id === live.id)!.name).toBe("Studio Kit");
  });
});

describe("files from assistants", () => {
  it("only downloads from public https addresses", async () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "192.168.0.10", "172.20.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(privateAddress(address)).toBe(true);
    for (const address of ["8.8.8.8", "104.16.1.1", "2606:4700::1111"]) expect(privateAddress(address)).toBe(false);
    await expect(downloadFile("http://example.com/a.png")).rejects.toThrow("https");
    await expect(downloadFile("https://169.254.169.254/latest/meta-data")).rejects.toThrow("private");
    await expect(downloadFile("https://localhost/a.png")).rejects.toThrow("private");
  });

  it("joins a file sent in pieces, in order", async () => {
    const product = seedProduct({ kind: "physical", status: "draft" });
    const token = await connect();
    const caller = (await verifyBearer(`Bearer ${token}`))!;
    const bytes = Buffer.from("0123456789abcdefghij0123456789abcdefghij");
    const encoded = bytes.toString("base64");
    const { uploadId } = await startUpload(caller.connection.id, product.id, "photo.png", bytes.length);
    await expect(appendUpload(caller.connection.id, uploadId, 1, encoded.slice(0, 8))).rejects.toThrow("piece 0");
    await expect(appendUpload(caller.connection.id, uploadId, 0, encoded.slice(0, 7))).rejects.toThrow("multiples of 4");
    await appendUpload(caller.connection.id, uploadId, 0, encoded.slice(0, 24));
    await appendUpload(caller.connection.id, uploadId, 0, encoded.slice(0, 24)); // a resend is harmless
    await appendUpload(caller.connection.id, uploadId, 1, encoded.slice(24));
    const other = (await verifyBearer(`Bearer ${await connect()}`))!;
    await expect(finishUpload(other.connection.id, uploadId)).rejects.toThrow("wasn't found");
    expect(Buffer.from((await finishUpload(caller.connection.id, uploadId)).bytes).toString()).toBe(bytes.toString());
    expect(state.mcp_uploads).toEqual([]);
  });
});
