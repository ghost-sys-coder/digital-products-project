begin;

create table public.stores (
  id uuid primary key,
  owner_user_id uuid references auth.users(id),
  name text not null default 'VeilCode Studio',
  tagline text not null default 'Good systems. Better work.',
  bio text not null default 'Practical guides and editable templates for independent creatives. Built to help you spend less time figuring it out, and more time doing your best work.',
  support_email text not null default 'support@veilcode.studio',
  website_url text default 'https://veilcode.studio'
);
insert into public.stores(id) values ('c9fdc8a4-3d95-4d43-97f2-b650386179d2');

create table public.products (
  id text primary key,
  store_id uuid not null references public.stores(id),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 120),
  tagline text not null default '',
  description text not null default '',
  includes text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  stripe_product_id text,
  stripe_price_id text,
  price_amount integer check (price_amount between 50 and 99999999),
  currency text not null default 'usd' check (currency in ('usd', 'gbp', 'eur', 'cad', 'aud')),
  stripe_livemode boolean,
  storage_path text,
  download_filename text,
  templates_url text,
  cover_path text,
  cover_type text,
  sort_order integer not null default 0,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug),
  unique (store_id, id),
  constraint published_ready check (status <> 'published' or (
    stripe_price_id is not null and stripe_product_id is not null and price_amount is not null
    and storage_path is not null and download_filename is not null and stripe_livemode is not null
  ))
);
insert into public.products(id, store_id, slug, name, tagline, description, includes, storage_path, download_filename)
values ('lead-to-kickoff', 'c9fdc8a4-3d95-4d43-97f2-b650386179d2', 'lead-to-kickoff',
  'Lead to Kickoff: The Client Onboarding System',
  'Turn a new inquiry into a confident project kickoff.',
  'A practical guide and editable templates to give your client onboarding a clear, repeatable process. Bring structure to the steps between a new lead and your first project meeting.',
  array['The Lead to Kickoff PDF guide', 'Editable client onboarding templates', 'A clear process from inquiry to kickoff'],
  'lead-to-kickoff/lead-to-kickoff.pdf', 'Lead-to-Kickoff.pdf');

alter table public.orders add column store_id uuid not null default 'c9fdc8a4-3d95-4d43-97f2-b650386179d2' references public.stores(id);
alter table public.orders add column product_snapshot jsonb;
create index orders_store_created on public.orders(store_id, created_at desc);
create index products_store_published on public.products(store_id, status, sort_order);

create table public.checkouts (
  id uuid primary key,
  store_id uuid not null references public.stores(id),
  product_id text not null,
  stripe_session_id text unique,
  stripe_price_id text not null,
  product_slug text not null,
  amount integer not null,
  currency text not null,
  product_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (store_id, product_id) references public.products(store_id, id)
);

alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.checkouts enable row level security;
revoke all on public.stores, public.products, public.checkouts from anon, authenticated;
grant all on public.stores, public.products, public.checkouts to service_role;
-- The server provides public catalog DTOs and verifies the owner for admin access.
-- No client grants: private resource URLs, checkout snapshots, and orders stay private.

drop function public.consume_download(text);
create function public.consume_download(p_token_hash text)
returns table (product_id text, product_snapshot jsonb)
language sql security invoker set search_path = ''
as $$
  update public.orders
     set download_count = download_count + 1
   where download_token_hash = p_token_hash
     and download_count < max_downloads and token_expires_at > now()
  returning orders.product_id, orders.product_snapshot;
$$;
revoke all on function public.consume_download(text) from public, anon, authenticated;
grant execute on function public.consume_download(text) to service_role;

commit;
