-- Physical products sold as single-product stores (docs/physical-products-plan.md, Phase 1).
-- Digital products, checkouts, and orders keep working unchanged: every new column has a
-- default or is nullable, and digital-only requirements move into kind-aware checks.
-- Apply to the PREVIEW project first, verify, then production.
begin;

-- Markets each store sells to. US at launch; GB is added here later.
alter table public.stores add column enabled_markets text[] not null default '{US}'
  check (enabled_markets <@ array['US', 'GB']);

-- 1. Shipping profiles and their rates per market.
create table public.shipping_profiles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  name text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (store_id, id)
);
create table public.shipping_rates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  profile_id uuid not null,
  market text not null check (market in ('US', 'GB')),
  name text not null check (length(name) between 1 and 80),
  amount integer not null check (amount between 0 and 99999999),
  currency text not null check (currency in ('usd', 'gbp')),
  min_days integer not null check (min_days between 1 and 90),
  max_days integer not null check (max_days between min_days and 120),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, id),
  check ((market = 'US' and currency = 'usd') or (market = 'GB' and currency = 'gbp')),
  foreign key (store_id, profile_id) references public.shipping_profiles(store_id, id) on delete cascade
);
create index shipping_rates_profile on public.shipping_rates(profile_id, market, position);

-- 2. Products: kind, store page, theme, and brand.
alter table public.products add column kind text not null default 'digital' check (kind in ('digital', 'physical'));
alter table public.products add column theme text check (theme in ('clean-minimal', 'bold-dark', 'soft-luxe', 'vibrant-pop'));
-- { name, logoPath, accent }: shown in the store header, emails, and card statement.
alter table public.products add column brand jsonb not null default '{}'::jsonb check (jsonb_typeof(brand) = 'object');
-- Versioned, app-validated list of page sections. Never rendered without validation.
alter table public.products add column page jsonb check (page is null or jsonb_typeof(page) = 'object');
alter table public.products add column shipping_profile_id uuid;
alter table public.products add constraint products_shipping_profile
  foreign key (store_id, shipping_profile_id) references public.shipping_profiles(store_id, id);

alter table public.products drop constraint published_ready;
alter table public.products add constraint published_ready check (status <> 'published' or (
  case kind
    when 'digital' then price_amount is not null and storage_path is not null and download_filename is not null
    else theme is not null and page is not null and shipping_profile_id is not null and currency = 'usd'
  end
));
alter table public.products add constraint digital_products_have_no_store_page check (
  kind = 'physical' or (page is null and shipping_profile_id is null)
);

-- 3. Variants: what the buyer actually picks and pays for.
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id text not null,
  position integer not null default 0,
  -- Option name -> value, e.g. {"Color": "Black", "Size": "M"}. Empty for a single variant.
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  sku text check (sku is null or length(sku) <= 80),
  price_amount integer not null check (price_amount between 50 and 99999999),
  -- Must be a genuine earlier price; the app labels it as such.
  compare_at_amount integer check (compare_at_amount is null or compare_at_amount > price_amount),
  image_path text,
  active boolean not null default true,
  -- Private: never sent to the storefront.
  supplier_url text check (supplier_url is null or supplier_url ~ '^https://'),
  supplier_sku text check (supplier_sku is null or length(supplier_sku) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, product_id) references public.products(store_id, id) on delete cascade
);
create index product_variants_product on public.product_variants(product_id, position);

-- 4. Checkouts: physical reservations snapshot the variant, quantity, and shipping choices.
alter table public.checkouts add column kind text not null default 'digital' check (kind in ('digital', 'physical'));
alter table public.checkouts add column variant_id uuid;
alter table public.checkouts add column quantity integer not null default 1 check (quantity between 1 and 10);
-- { items: [...], shippingOptions: [...], brand: {...} } as charged; see lib/physical-checkout.ts.
alter table public.checkouts add column physical_snapshot jsonb;
alter table public.checkouts alter column stripe_price_id drop not null;
alter table public.checkouts alter column product_snapshot drop not null;
alter table public.checkouts add constraint checkouts_kind_fields check (
  case kind
    when 'digital' then stripe_price_id is not null and product_snapshot is not null
    else variant_id is not null and physical_snapshot is not null
  end
);

-- 5. Orders: shipping details and manual fulfilment.
alter table public.orders add column kind text not null default 'digital' check (kind in ('digital', 'physical'));
alter table public.orders alter column download_token_hash drop not null;
alter table public.orders alter column token_expires_at drop not null;
alter table public.orders add column customer_name text;
alter table public.orders add column shipping_address jsonb;
alter table public.orders add column physical_snapshot jsonb;
alter table public.orders add column fulfillment_status text check (fulfillment_status in ('needs_ordering', 'ordered', 'shipped', 'delivered', 'cancelled'));
alter table public.orders add column supplier_order_ref text check (supplier_order_ref is null or length(supplier_order_ref) <= 200);
alter table public.orders add column tracking_number text check (tracking_number is null or length(tracking_number) <= 100);
alter table public.orders add column tracking_carrier text check (tracking_carrier is null or length(tracking_carrier) <= 60);
alter table public.orders add column tracking_url text check (tracking_url is null or tracking_url ~ '^https://');
alter table public.orders add column ordered_at timestamptz;
alter table public.orders add column shipped_at timestamptz;
alter table public.orders add column delivered_at timestamptz;
alter table public.orders add column tracking_email_sent_at timestamptz;
alter table public.orders add constraint orders_kind_fields check (
  case kind
    when 'digital' then download_token_hash is not null and token_expires_at is not null and fulfillment_status is null
    else download_token_hash is null and shipping_address is not null and physical_snapshot is not null and fulfillment_status is not null
  end
);
create index orders_fulfillment on public.orders(store_id, fulfillment_status, created_at desc) where kind = 'physical';

-- 6. Lock down the new tables exactly like the existing ones: server-only access.
alter table public.shipping_profiles enable row level security;
alter table public.shipping_rates enable row level security;
alter table public.product_variants enable row level security;
revoke all on public.shipping_profiles, public.shipping_rates, public.product_variants from public, anon, authenticated;
grant all on public.shipping_profiles, public.shipping_rates, public.product_variants to service_role;

-- 7. Public bucket for storefront images and short videos (marketing assets only).
--    Paid downloads stay in the private "products" bucket. Writes are server-only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('storefront', 'storefront', true, 26214400,
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'video/mp4', 'video/webm'])
on conflict (id) do nothing;

commit;
