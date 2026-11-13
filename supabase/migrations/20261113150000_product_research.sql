-- Product research board (lib/research.ts, /admin/research). Each row is a product idea the owner is
-- weighing up: the ads that suggest it sells, a supplier and its costs, a target price, and, once the
-- owner commits to it, the draft store made from it. Server-only, like every other table.
--
-- integration_tokens keeps API access tokens the server gets from other services (CJ Dropshipping),
-- so every server instance reuses one token instead of asking for a new one on each cold start.
begin;

create table public.research_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  stage text not null default 'saved' check (stage in ('saved', 'researching', 'sourcing', 'testing', 'live', 'rejected')),
  notes text not null default '' check (length(notes) <= 5000),
  image_url text check (image_url is null or (image_url ~ '^https://' and length(image_url) <= 2000)),
  -- Evidence it sells: up to 20 ads, each { id, url, page, startedAt, source, note }.
  ads jsonb not null default '[]' check (jsonb_typeof(ads) = 'array' and jsonb_array_length(ads) <= 20),
  -- { source, id, name, url, cost, shipping, shippingName, days } with amounts in cents (USD).
  supplier jsonb check (supplier is null or jsonb_typeof(supplier) = 'object'),
  target_price integer check (target_price is null or target_price between 0 and 10000000),
  store_product_id text references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index research_products_board on public.research_products(store_id, stage, updated_at desc);

create table public.integration_tokens (
  provider text primary key check (provider in ('cj')),
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.research_products enable row level security;
alter table public.integration_tokens enable row level security;
revoke all on public.research_products, public.integration_tokens from public, anon, authenticated;
grant all on public.research_products, public.integration_tokens to service_role;

commit;
