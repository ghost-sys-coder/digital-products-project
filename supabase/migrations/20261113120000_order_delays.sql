-- Delays and cancellations for physical orders (lib/order-delays.ts). When an order can't ship by
-- the date promised, the owner emails a delay notice with a new date and a link the customer can
-- use to cancel for a full refund. Cancelling, by the owner or the customer, can refund in Stripe.
begin;

-- Each notice sent: [{ "sentAt": timestamptz, "shipBy": "YYYY-MM-DD", "reason": text }].
alter table public.orders add column delay_notices jsonb not null default '[]'::jsonb
  check (jsonb_typeof(delay_notices) = 'array');
-- SHA-256 of the cancel link's secret. Only the newest notice's link works; it stops working once
-- the order ships or is cancelled.
alter table public.orders add column cancel_token_hash text
  check (cancel_token_hash is null or cancel_token_hash ~ '^[0-9a-f]{64}$');
create unique index orders_cancel_token on public.orders(cancel_token_hash) where cancel_token_hash is not null;

alter table public.orders add column cancelled_at timestamptz;
alter table public.orders add column cancelled_by text check (cancelled_by in ('owner', 'customer'));
alter table public.orders add column refund_id text check (refund_id is null or length(refund_id) <= 100);
alter table public.orders add column refunded_amount integer check (refunded_amount is null or refunded_amount >= 0);

commit;
