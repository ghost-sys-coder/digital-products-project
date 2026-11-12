-- Policy settings for physical stores (lib/store-policies.ts). The pages are generated from these
-- settings plus the live shipping rates. The app validates the content; the database refuses to
-- publish a physical store that has none.
begin;

alter table public.products add column policies jsonb not null default '{}'::jsonb
  check (jsonb_typeof(policies) = 'object');

-- A physical store published before policies existed goes back to draft until they are filled in.
-- (Production has no physical stores yet, so this changes nothing there.)
update public.products set status = 'draft', updated_at = now()
where kind = 'physical' and status = 'published';

alter table public.products drop constraint published_ready;
alter table public.products add constraint published_ready check (status <> 'published' or (
  case kind
    when 'digital' then price_amount is not null and storage_path is not null and download_filename is not null
    else theme is not null and page is not null and shipping_profile_id is not null and currency = 'usd'
      and policies ? 'version' and policies ? 'sellerName'
  end
));

commit;
