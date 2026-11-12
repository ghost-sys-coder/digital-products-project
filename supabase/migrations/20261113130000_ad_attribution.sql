-- TikTok ads measurement (lib/tiktok.ts). A physical checkout remembers what the shopper's browser
-- told us for ad attribution (TikTok click id and cookie, IP address, user agent, page) so the paid
-- webhook can report the purchase from the server. It is cleared once the event is sent, is never
-- copied to the order, and is not collected at all for shoppers who opted out.
begin;

alter table public.checkouts add column attribution jsonb
  check (attribution is null or jsonb_typeof(attribution) = 'object');

commit;
