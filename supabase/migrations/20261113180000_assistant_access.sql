-- Assistant access (lib/mcp, /api/mcp, /admin/connections): the studio's own MCP server, so Claude,
-- ChatGPT, Codex and Claude Code can read the store, research products and build draft stores.
--
-- mcp_clients      apps registered through OAuth dynamic client registration (claude.ai, ChatGPT).
-- mcp_connections  one per approved app or personal token: what it may do, and whether it's switched off.
-- mcp_secrets      authorization codes, access, refresh and personal tokens, stored only as SHA-256 hashes.
-- mcp_activity     every tool an assistant ran, for the owner's log.
-- mcp_uploads      files an assistant sends in pieces, until they're complete.
-- research_products.kind  the research board holds digital product ideas as well as physical ones.
-- All server-only, like every other table.
begin;

create table public.mcp_clients (
  client_id text primary key check (length(client_id) between 8 and 80),
  name text not null check (length(name) between 1 and 120),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  -- Set only for apps that register as confidential clients (they send a secret with each token request).
  secret_hash text check (secret_hash is null or secret_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create table public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  kind text not null check (kind in ('oauth', 'token')),
  name text not null check (length(name) between 1 and 120),
  client_id text references public.mcp_clients(client_id) on delete cascade,
  scopes text[] not null check (scopes <@ array['read', 'research', 'build']::text[] and cardinality(scopes) >= 1),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  check ((kind = 'oauth') = (client_id is not null))
);
create index mcp_connections_store on public.mcp_connections(store_id, created_at desc);
create index mcp_connections_client on public.mcp_connections(client_id);

create table public.mcp_secrets (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('code', 'access', 'refresh', 'personal')),
  connection_id uuid not null references public.mcp_connections(id) on delete cascade,
  -- Codes: { redirectUri, challenge }.
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index mcp_secrets_connection on public.mcp_secrets(connection_id);
create index mcp_secrets_expiry on public.mcp_secrets(expires_at) where expires_at is not null;

create table public.mcp_activity (
  id bigint generated always as identity primary key,
  connection_id uuid not null references public.mcp_connections(id) on delete cascade,
  tool text not null check (length(tool) <= 80),
  summary text not null default '' check (length(summary) <= 300),
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index mcp_activity_recent on public.mcp_activity(created_at desc);
create index mcp_activity_connection on public.mcp_activity(connection_id, created_at desc);

create table public.mcp_uploads (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.mcp_connections(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  filename text not null check (length(filename) between 1 and 255),
  size integer not null check (size between 1 and 26214400),
  -- Base64 pieces in order; joined and checked when the upload completes.
  parts text[] not null default '{}',
  received integer not null default 0,
  created_at timestamptz not null default now()
);
create index mcp_uploads_connection on public.mcp_uploads(connection_id);
create index mcp_uploads_product on public.mcp_uploads(product_id);

alter table public.research_products add column kind text not null default 'physical' check (kind in ('physical', 'digital'));
create index research_products_store_product on public.research_products(store_product_id);

alter table public.mcp_clients enable row level security;
alter table public.mcp_connections enable row level security;
alter table public.mcp_secrets enable row level security;
alter table public.mcp_activity enable row level security;
alter table public.mcp_uploads enable row level security;
revoke all on public.mcp_clients, public.mcp_connections, public.mcp_secrets, public.mcp_activity, public.mcp_uploads from public, anon, authenticated;
grant all on public.mcp_clients, public.mcp_connections, public.mcp_secrets, public.mcp_activity, public.mcp_uploads to service_role;

commit;
