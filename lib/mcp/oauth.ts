import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSupabase } from "../supabase";
import { getEnv } from "../env";
import { HttpError } from "../http";
import { STORE_ID } from "../store-config";
import type { McpClient, McpConnection, McpScope, McpSecret } from "../database.types";
import { SCOPES } from "./scopes";
import { downloadFile } from "./files";

export { SCOPES, SCOPE_LABELS } from "./scopes";

// The studio's OAuth 2.1 authorization server for assistants (claude.ai, ChatGPT), plus personal tokens
// for command-line agents (Claude Code, Codex). Owner-only: every grant is approved by the signed-in
// owner on /oauth/authorize. Secrets are random, sent once, and stored only as SHA-256 hashes.
//
// Standards followed: OAuth 2.1 with PKCE (S256 only), RFC 7591 dynamic client registration, Client ID
// Metadata Documents (an https URL as client_id, which Claude prefers), RFC 8414 authorization server
// metadata, RFC 9728 protected resource metadata, and RFC 8252 port-agnostic loopback redirects.

const CODE_TTL = 10 * 60_000;
const ACCESS_TTL = 60 * 60_000;
const REFRESH_TTL = 60 * 86400_000;
const LAST_USED_EVERY = 5 * 60_000;

export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");
const newSecret = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

export function appOrigin() { return new URL(getEnv().APP_URL).origin; }
export function mcpResource() { return `${appOrigin()}/api/mcp`; }

export function parseScopes(value: unknown): McpScope[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  const scopes = SCOPES.filter((scope) => raw.includes(scope));
  return scopes.length ? scopes : ["read"];
}

// ── Metadata ──────────────────────────────────────────────────────────────────────────────────

export function authorizationServerMetadata() {
  const origin = appOrigin();
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    scopes_supported: [...SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    // Claude uses its published client document when both this and "none" (above) are advertised.
    client_id_metadata_document_supported: true,
    service_documentation: `${origin}/admin/connections`,
  };
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [appOrigin()],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "VeilCode Studio",
    resource_documentation: `${appOrigin()}/admin/connections`,
  };
}

// ── Dynamic client registration (RFC 7591) ───────────────────────────────────────────────────

/** Redirects must be HTTPS, or a loopback address for desktop apps. No fragments, no credentials. */
export function validRedirectUri(value: unknown) {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

export async function registerClient(body: Record<string, unknown>) {
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 10 || !uris.every(validRedirectUri)) {
    throw new OAuthError("invalid_redirect_uri", "Provide 1 to 10 HTTPS (or loopback) redirect URIs.", 400);
  }
  const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 120) : "Assistant";
  const method = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) throw new OAuthError("invalid_client_metadata", "Unsupported token_endpoint_auth_method.", 400);
  const clientId = `vcc_${randomBytes(16).toString("base64url")}`;
  const secret = method === "none" ? null : newSecret("vccs_");
  const { error } = await getSupabase().from("mcp_clients").insert({ client_id: clientId, name, redirect_uris: uris as string[], secret_hash: secret ? hashSecret(secret) : null });
  if (error) throw new OAuthError("server_error", "Could not register the client.", 500);
  return {
    client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: method,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  };
}

export async function getClient(clientId: unknown): Promise<McpClient | null> {
  if (typeof clientId !== "string" || clientId.length > 500) return null;
  const { data } = await getSupabase().from("mcp_clients").select("*").eq("client_id", clientId).maybeSingle();
  return (data as McpClient | null) ?? null;
}

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Whether a requested redirect matches a registered one. Exact match, or, for loopback addresses,
 * the same scheme, host, path and query on any port: desktop apps (Claude Code, Codex) listen on a
 * port that changes every session (RFC 8252 section 7.3).
 */
export function redirectAllowed(registered: string[], requested: string) {
  if (registered.includes(requested)) return true;
  let wanted: URL;
  try { wanted = new URL(requested); } catch { return false; }
  if (wanted.protocol !== "http:" || !LOOPBACK.includes(wanted.hostname)) return false;
  return registered.some((entry) => {
    try {
      const allowed = new URL(entry);
      return allowed.protocol === "http:" && allowed.hostname === wanted.hostname && allowed.pathname === wanted.pathname && allowed.search === wanted.search;
    } catch { return false; }
  });
}

// ── Client ID Metadata Documents ─────────────────────────────────────────────────────────────

/** A CIMD client_id is an https URL with a path, e.g. Claude's https://claude.ai/oauth/claude-code-client-metadata. */
export function isMetadataClientId(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try { const url = new URL(value); return url.protocol === "https:" && url.pathname.length > 1 && !url.hash && !url.username; } catch { return false; }
}

/**
 * Reads a client's published metadata document (fetched safely: public https only, small) and keeps a
 * copy in mcp_clients so connections can reference it. The document must name itself as client_id.
 */
export async function resolveMetadataClient(clientId: string): Promise<McpClient> {
  let doc: Record<string, unknown>;
  try {
    const { bytes } = await downloadFile(clientId, 64 * 1024);
    doc = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch { throw new OAuthError("invalid_client", "Couldn't read this app's published client details."); }
  if (!doc || typeof doc !== "object" || doc.client_id !== clientId) throw new OAuthError("invalid_client", "This app's client details don't match its client id.");
  const uris = doc.redirect_uris;
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 10 || !uris.every(validRedirectUri)) throw new OAuthError("invalid_client", "This app's client details list no usable return address.");
  const method = typeof doc.token_endpoint_auth_method === "string" ? doc.token_endpoint_auth_method : "none";
  if (method !== "none") throw new OAuthError("invalid_client", "Only public clients can sign in with published client details.");
  const name = typeof doc.client_name === "string" && doc.client_name.trim() ? doc.client_name.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 120) : new URL(clientId).hostname;
  const client = { client_id: clientId, name, redirect_uris: uris as string[], secret_hash: null };
  const { error } = await getSupabase().from("mcp_clients").upsert(client);
  if (error) throw new OAuthError("server_error", "Could not save this app's details.", 500);
  return { ...client, created_at: new Date().toISOString() };
}

// ── Authorization ─────────────────────────────────────────────────────────────────────────────

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export type AuthorizeRequest = { client: McpClient; redirectUri: string; state: string | null; challenge: string; scopes: McpScope[] };

/**
 * Checks an authorization request. Errors before the redirect URI is trusted are shown on the page
 * (never redirected), as OAuth requires; the rest go back to the client with ?error=.
 */
export async function readAuthorizeRequest(params: Record<string, string | undefined>): Promise<AuthorizeRequest> {
  // Published client details are read fresh on every sign-in, so changes to them take effect.
  const client = isMetadataClientId(params.client_id) ? await resolveMetadataClient(params.client_id) : await getClient(params.client_id);
  if (!client) throw new OAuthError("invalid_client", "This app isn't registered with the studio. Remove the connection in the app and add it again.");
  const redirectUri = params.redirect_uri ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : "");
  if (!redirectAllowed(client.redirect_uris, redirectUri)) throw new OAuthError("invalid_request", "The app sent a return address it didn't register.");
  if (params.response_type !== "code") throw new OAuthError("unsupported_response_type", "Only the authorization code flow is supported.");
  const challenge = params.code_challenge ?? "";
  if (params.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new OAuthError("invalid_request", "PKCE with S256 is required.");
  const state = params.state ? params.state.slice(0, 1000) : null;
  return { client, redirectUri, state, challenge, scopes: parseScopes(params.scope ?? "read research build") };
}

export function redirectWith(redirectUri: string, values: Record<string, string | null>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) if (value !== null) url.searchParams.set(key, value);
  return url.toString();
}

/** The owner approved: one connection per app (reused on reconnect) and a single-use code for it. */
export async function approveAuthorization(request: AuthorizeRequest, scopes: McpScope[]) {
  const db = getSupabase();
  const { data: existing } = await db.from("mcp_connections").select("*").eq("store_id", STORE_ID).eq("client_id", request.client.client_id).is("revoked_at", null).maybeSingle();
  let connection = existing as McpConnection | null;
  if (connection) {
    const { error } = await db.from("mcp_connections").update({ scopes, name: request.client.name }).eq("id", connection.id);
    if (error) throw new OAuthError("server_error", "Could not save the connection.", 500);
  } else {
    const { data, error } = await db.from("mcp_connections").insert({ store_id: STORE_ID, kind: "oauth", name: request.client.name, client_id: request.client.client_id, scopes }).select("*").single();
    if (error || !data) throw new OAuthError("server_error", "Could not save the connection.", 500);
    connection = data as McpConnection;
  }
  const code = newSecret("vcac_");
  const { error } = await db.from("mcp_secrets").insert({
    hash: hashSecret(code), kind: "code", connection_id: connection.id, expires_at: iso(CODE_TTL),
    details: { redirectUri: request.redirectUri, challenge: request.challenge, clientId: request.client.client_id },
  });
  if (error) throw new OAuthError("server_error", "Could not finish connecting.", 500);
  return redirectWith(request.redirectUri, { code, state: request.state });
}

// ── Tokens ────────────────────────────────────────────────────────────────────────────────────

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Client credentials from client_secret_basic or client_secret_post. */
function clientCredentials(form: URLSearchParams, authorization: string | null) {
  if (authorization?.startsWith("Basic ")) {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const split = decoded.indexOf(":");
    if (split > 0) return { id: decodeURIComponent(decoded.slice(0, split)), secret: decodeURIComponent(decoded.slice(split + 1)) };
  }
  return { id: form.get("client_id") ?? "", secret: form.get("client_secret") };
}

async function authenticateClient(form: URLSearchParams, authorization: string | null) {
  const { id, secret } = clientCredentials(form, authorization);
  const client = await getClient(id);
  if (!client) throw new OAuthError("invalid_client", "Unknown client.", 401);
  if (client.secret_hash && !(secret && safeEqual(hashSecret(secret), client.secret_hash))) throw new OAuthError("invalid_client", "Client authentication failed.", 401);
  return client;
}

async function liveConnection(id: string) {
  const { data } = await getSupabase().from("mcp_connections").select("*").eq("id", id).maybeSingle();
  const connection = data as McpConnection | null;
  return connection && !connection.revoked_at ? connection : null;
}

async function issueTokens(connection: McpConnection) {
  const access = newSecret("vcat_");
  const refresh = newSecret("vcrt_");
  const { error } = await getSupabase().from("mcp_secrets").insert([
    { hash: hashSecret(access), kind: "access", connection_id: connection.id, expires_at: iso(ACCESS_TTL) },
    { hash: hashSecret(refresh), kind: "refresh", connection_id: connection.id, expires_at: iso(REFRESH_TTL) },
  ] as never);
  if (error) throw new OAuthError("server_error", "Could not issue tokens.", 500);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope: connection.scopes.join(" ") };
}

async function takeSecret(secret: string, kind: McpSecret["kind"]) {
  const db = getSupabase();
  const { data } = await db.from("mcp_secrets").select("*").eq("hash", hashSecret(secret)).eq("kind", kind).maybeSingle();
  const row = data as McpSecret | null;
  if (!row) return null;
  if (row.used_at) {
    // A code or refresh token used twice may have been stolen: end the whole connection's tokens.
    await db.from("mcp_secrets").delete().eq("connection_id", row.connection_id).eq("kind", "access");
    await db.from("mcp_secrets").delete().eq("connection_id", row.connection_id).eq("kind", "refresh");
    return null;
  }
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return null;
  const { data: claimed } = await db.from("mcp_secrets").update({ used_at: new Date().toISOString() }).eq("hash", row.hash).is("used_at", null).select("hash").maybeSingle();
  return claimed ? row : null;
}

export function verifyPkce(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return safeEqual(createHash("sha256").update(verifier).digest("base64url"), challenge);
}

export async function exchangeToken(form: URLSearchParams, authorization: string | null) {
  const client = await authenticateClient(form, authorization);
  const grant = form.get("grant_type");
  if (grant === "authorization_code") {
    const code = form.get("code") ?? "";
    const row = await takeSecret(code, "code");
    const details = row?.details as { redirectUri?: string; challenge?: string; clientId?: string } | undefined;
    if (!row || !details || details.clientId !== client.client_id) throw new OAuthError("invalid_grant", "The code is invalid or expired.");
    if ((form.get("redirect_uri") ?? details.redirectUri) !== details.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri doesn't match.");
    if (!verifyPkce(form.get("code_verifier") ?? "", details.challenge ?? "")) throw new OAuthError("invalid_grant", "PKCE verification failed.");
    const connection = await liveConnection(row.connection_id);
    if (!connection) throw new OAuthError("invalid_grant", "This connection was switched off.");
    return issueTokens(connection);
  }
  if (grant === "refresh_token") {
    const row = await takeSecret(form.get("refresh_token") ?? "", "refresh");
    const connection = row ? await liveConnection(row.connection_id) : null;
    if (!row || !connection || connection.client_id !== client.client_id) throw new OAuthError("invalid_grant", "The refresh token is invalid or expired.");
    return issueTokens(connection);
  }
  throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

/** RFC 7009: always succeeds for the caller; a known token is removed. */
export async function revokeToken(form: URLSearchParams) {
  const token = form.get("token");
  if (token) await getSupabase().from("mcp_secrets").delete().eq("hash", hashSecret(token));
}

// ── Personal tokens (Claude Code, Codex) ─────────────────────────────────────────────────────

export async function createPersonalToken(name: string, scopes: McpScope[]) {
  const label = name.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 120);
  if (!label) throw new HttpError(400, "Give the token a name, like “Claude Code”.");
  const db = getSupabase();
  const { data, error } = await db.from("mcp_connections").insert({ store_id: STORE_ID, kind: "token", name: label, scopes }).select("*").single();
  if (error || !data) throw new HttpError(500, "Could not create the token. Please try again.");
  const token = newSecret("vcs_");
  const { error: secretError } = await db.from("mcp_secrets").insert({ hash: hashSecret(token), kind: "personal", connection_id: (data as McpConnection).id });
  if (secretError) throw new HttpError(500, "Could not create the token. Please try again.");
  return { connection: data as McpConnection, token };
}

// ── Connections ──────────────────────────────────────────────────────────────────────────────

export type Caller = { connection: McpConnection; scopes: McpScope[] };

/** The caller behind an `Authorization: Bearer` header, or null. */
export async function verifyBearer(header: string | null): Promise<Caller | null> {
  const token = header?.match(/^Bearer\s+(\S{20,200})$/i)?.[1];
  if (!token) return null;
  const db = getSupabase();
  const { data } = await db.from("mcp_secrets").select("*").eq("hash", hashSecret(token)).maybeSingle();
  const secret = data as McpSecret | null;
  if (!secret || (secret.kind !== "access" && secret.kind !== "personal")) return null;
  if (secret.expires_at && Date.parse(secret.expires_at) <= Date.now()) return null;
  const connection = await liveConnection(secret.connection_id);
  if (!connection || connection.store_id !== STORE_ID) return null;
  if (!connection.last_used_at || Date.now() - Date.parse(connection.last_used_at) > LAST_USED_EVERY) {
    await db.from("mcp_connections").update({ last_used_at: new Date().toISOString() }).eq("id", connection.id);
  }
  return { connection, scopes: connection.scopes };
}

export async function listConnections() {
  const { data, error } = await getSupabase().from("mcp_connections").select("*").eq("store_id", STORE_ID).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Could not load connections");
  return (data ?? []) as McpConnection[];
}

/** Switches a connection off and deletes every secret it holds. */
export async function revokeConnection(id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "That connection wasn't found.");
  const db = getSupabase();
  const { data, error } = await db.from("mcp_connections").update({ revoked_at: new Date().toISOString() }).eq("store_id", STORE_ID).eq("id", id).select("id").maybeSingle();
  if (error) throw new HttpError(500, "Could not switch off that connection. Please try again.");
  if (!data) throw new HttpError(404, "That connection wasn't found.");
  await db.from("mcp_secrets").delete().eq("connection_id", id);
  return { id };
}

export async function updateConnectionScopes(id: unknown, scopes: McpScope[]) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "That connection wasn't found.");
  const { data, error } = await getSupabase().from("mcp_connections").update({ scopes }).eq("store_id", STORE_ID).eq("id", id).is("revoked_at", null).select("*").maybeSingle();
  if (error) throw new HttpError(500, "Could not save. Please try again.");
  if (!data) throw new HttpError(404, "That connection wasn't found, or it's switched off.");
  return data as McpConnection;
}
