begin;

create table public.payment_connections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  provider text not null check (provider in ('stripe', 'paypal')),
  external_account_id text not null,
  livemode boolean not null,
  is_current boolean not null default true,
  status text not null check (status in ('connected', 'restricted', 'disconnected')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  country text,
  requirements text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, livemode, external_account_id),
  unique (store_id, id)
);
create unique index payment_connections_current on public.payment_connections(store_id, provider, livemode) where is_current;

create table public.payment_oauth_attempts (
  state_hash text primary key,
  store_id uuid not null references public.stores(id),
  owner_user_id uuid not null references auth.users(id),
  livemode boolean not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index payment_oauth_expiry on public.payment_oauth_attempts(expires_at);

create table public.product_payment_refs (
  store_id uuid not null,
  connection_id uuid not null,
  product_id text not null,
  external_product_id text not null,
  external_price_id text not null,
  amount integer not null,
  currency text not null,
  primary key (connection_id, product_id),
  foreign key (store_id, connection_id) references public.payment_connections(store_id, id),
  foreign key (store_id, product_id) references public.products(store_id, id)
);

alter table public.checkouts add column payment_connection_id uuid;
alter table public.checkouts add column checkout_origin text;
alter table public.checkouts add constraint checkouts_payment_connection_store
  foreign key (store_id, payment_connection_id) references public.payment_connections(store_id, id);
alter table public.orders add column payment_connection_id uuid;
alter table public.orders add constraint orders_payment_connection_store
  foreign key (store_id, payment_connection_id) references public.payment_connections(store_id, id);
create index checkouts_payment_connection on public.checkouts(payment_connection_id);
create index orders_payment_connection on public.orders(payment_connection_id);

-- Stripe IDs are per payment connection. New connected-account products need not
-- have legacy platform-account references in the products table.
alter table public.products drop constraint published_ready;
alter table public.products add constraint published_ready check (status <> 'published' or (
  price_amount is not null and storage_path is not null and download_filename is not null
));

alter table public.payment_connections enable row level security;
alter table public.payment_oauth_attempts enable row level security;
alter table public.product_payment_refs enable row level security;
revoke all on public.payment_connections, public.payment_oauth_attempts, public.product_payment_refs from public, anon, authenticated;
grant all on public.payment_connections, public.payment_oauth_attempts, public.product_payment_refs to service_role;

-- One transaction switches the selected connection while retaining history.
create function public.activate_payment_connection(
  p_store_id uuid, p_owner_id uuid, p_account_id text, p_livemode boolean,
  p_charges_enabled boolean, p_payouts_enabled boolean, p_country text, p_requirements text[]
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare connection_id uuid;
begin
  perform 1 from public.stores where id = p_store_id and owner_user_id = p_owner_id for update;
  if not found then raise exception 'Store ownership required'; end if;
  if exists(select 1 from public.payment_connections where provider = 'stripe'
    and livemode = p_livemode and external_account_id = p_account_id and store_id <> p_store_id)
  then raise exception 'Account already linked to another store'; end if;
  update public.payment_connections set is_current = false
    where store_id = p_store_id and provider = 'stripe' and livemode = p_livemode;
  insert into public.payment_connections(store_id, provider, external_account_id, livemode,
    status, charges_enabled, payouts_enabled, country, requirements)
  values(p_store_id, 'stripe', p_account_id, p_livemode,
    case when p_charges_enabled and p_payouts_enabled then 'connected' else 'restricted' end,
    p_charges_enabled, p_payouts_enabled, p_country, p_requirements)
  on conflict(provider, livemode, external_account_id) do update set
    is_current = true, status = excluded.status, charges_enabled = excluded.charges_enabled,
    payouts_enabled = excluded.payouts_enabled, country = excluded.country,
    requirements = excluded.requirements, updated_at = now()
  returning id into connection_id;
  return connection_id;
end;
$$;
revoke all on function public.activate_payment_connection(uuid, uuid, text, boolean, boolean, boolean, text, text[]) from public, anon, authenticated;
grant execute on function public.activate_payment_connection(uuid, uuid, text, boolean, boolean, boolean, text, text[]) to service_role;
commit;
