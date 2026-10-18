begin;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique not null,
  product_id text not null,
  email text not null,
  amount_total integer,
  currency text,
  download_token_hash text unique not null,
  download_count integer not null default 0 check (download_count >= 0),
  max_downloads integer not null default 5 check (max_downloads > 0),
  token_expires_at timestamptz not null,
  email_status text not null default 'pending' check (email_status in ('pending', 'sent')),
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  delivery_lock_id uuid,
  delivery_locked_until timestamptz
);

alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
grant all on public.orders to service_role;
-- No RLS policies: only the server-side service role can access orders.

create or replace function public.consume_download(p_token_hash text)
returns table (product_id text)
language sql
security invoker
set search_path = ''
as $$
  update public.orders
     set download_count = download_count + 1
   where download_token_hash = p_token_hash
     and download_count < max_downloads
     and token_expires_at > now()
  returning orders.product_id;
$$;

-- One sender per order, including support resends. A crashed invocation releases
-- its lease after five minutes. Routes have a 60-second maximum duration.
create or replace function public.claim_delivery(
  p_session_id text,
  p_lock_id uuid,
  p_force boolean default false
)
returns setof public.orders
language sql
security invoker
set search_path = ''
as $$
  update public.orders
     set delivery_lock_id = p_lock_id,
         delivery_locked_until = now() + interval '5 minutes'
   where stripe_session_id = p_session_id
     and (p_force or email_status = 'pending')
     and (delivery_locked_until is null or delivery_locked_until <= now())
  returning orders.*;
$$;

revoke all on function public.consume_download(text) from public, anon, authenticated;
revoke all on function public.claim_delivery(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.consume_download(text) to service_role;
grant execute on function public.claim_delivery(text, uuid, boolean) to service_role;

commit;
