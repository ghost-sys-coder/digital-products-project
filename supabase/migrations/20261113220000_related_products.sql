-- Related products (lib/manage-products.ts, /p/<slug>). The owner picks up to four other digital products
-- to suggest under a product's page, in the order they should appear. Ids only: the page shows the ones
-- that are still published, so a draft can be linked ahead of its launch.
begin;

alter table public.products add column related_ids text[] not null default '{}';
alter table public.products add constraint products_related_ids_check
  check (cardinality(related_ids) <= 4 and not (id = any(related_ids)));

commit;
