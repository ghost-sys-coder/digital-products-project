-- Admin store editor (docs/physical-products-plan.md). Saving a physical store writes the product
-- and all of its variants, and saving a shipping profile writes the profile and all of its rates.
-- Each happens in one transaction, so a failed save never leaves half an edit behind.
-- The app validates every value first (lib/store-input.ts); the table constraints still apply.
-- Server-only: the service role may call these, the browser roles may not.
begin;

create or replace function public.save_shipping_profile(p_store_id uuid, p_profile_id uuid, p_name text, p_rates jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(p_rates) is distinct from 'array' then
    raise exception 'rates must be an array' using errcode = '22023';
  end if;

  insert into public.shipping_profiles as profile (id, store_id, name)
  values (p_profile_id, p_store_id, p_name)
  on conflict (id) do update set name = excluded.name
  where profile.store_id = excluded.store_id;
  if not exists (select 1 from public.shipping_profiles where id = p_profile_id and store_id = p_store_id) then
    raise exception 'This shipping profile belongs to another store.' using errcode = '42501';
  end if;

  -- Rates removed in the editor. Past checkouts and orders keep their own copy of what was charged.
  delete from public.shipping_rates rate
  where rate.store_id = p_store_id and rate.profile_id = p_profile_id
    and rate.id not in (select (entry->>'id')::uuid from jsonb_array_elements(p_rates) entry);

  insert into public.shipping_rates as rate (id, store_id, profile_id, market, name, amount, currency, min_days, max_days, position, active)
  select (entry->>'id')::uuid, p_store_id, p_profile_id, entry->>'market', entry->>'name', (entry->>'amount')::integer,
    entry->>'currency', (entry->>'min_days')::integer, (entry->>'max_days')::integer, (item.ord - 1)::integer, (entry->>'active')::boolean
  from jsonb_array_elements(p_rates) with ordinality as item(entry, ord)
  on conflict (id) do update set market = excluded.market, name = excluded.name, amount = excluded.amount,
    currency = excluded.currency, min_days = excluded.min_days, max_days = excluded.max_days,
    position = excluded.position, active = excluded.active
  where rate.store_id = excluded.store_id and rate.profile_id = excluded.profile_id;

  -- A rate id that belongs to another profile is skipped by the guarded update above; refuse it.
  if (select count(*) from public.shipping_rates where store_id = p_store_id and profile_id = p_profile_id) <> jsonb_array_length(p_rates) then
    raise exception 'A shipping rate belongs to another profile.' using errcode = '42501';
  end if;
  return p_profile_id;
end;
$$;

create or replace function public.save_physical_store(p_store_id uuid, p_product_id text, p_revision integer, p_product jsonb, p_variants jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_revision integer;
begin
  if jsonb_typeof(p_variants) is distinct from 'array' then
    raise exception 'variants must be an array' using errcode = '22023';
  end if;

  update public.products set
    name = p_product->>'name', slug = p_product->>'slug', tagline = p_product->>'tagline',
    status = p_product->>'status', theme = p_product->>'theme', brand = p_product->'brand', page = p_product->'page',
    policies = p_product->'policies', shipping_profile_id = (p_product->>'shipping_profile_id')::uuid,
    revision = revision + 1, updated_at = now()
  where id = p_product_id and store_id = p_store_id and kind = 'physical' and revision = p_revision
  returning revision into v_revision;
  if v_revision is null then
    -- PostgREST answers PT409 with HTTP 409.
    raise exception 'This store changed since it was loaded.' using errcode = 'PT409';
  end if;

  -- Variants removed in the editor. Checkouts and orders keep their own copy of what was bought.
  delete from public.product_variants variant
  where variant.store_id = p_store_id and variant.product_id = p_product_id
    and variant.id not in (select (entry->>'id')::uuid from jsonb_array_elements(p_variants) entry);

  insert into public.product_variants as variant (id, store_id, product_id, position, options, sku, price_amount,
    compare_at_amount, image_path, active, supplier_url, supplier_sku, updated_at)
  select (entry->>'id')::uuid, p_store_id, p_product_id, (item.ord - 1)::integer, entry->'options', entry->>'sku',
    (entry->>'price_amount')::integer, (entry->>'compare_at_amount')::integer, entry->>'image_path',
    (entry->>'active')::boolean, entry->>'supplier_url', entry->>'supplier_sku', now()
  from jsonb_array_elements(p_variants) with ordinality as item(entry, ord)
  on conflict (id) do update set position = excluded.position, options = excluded.options, sku = excluded.sku,
    price_amount = excluded.price_amount, compare_at_amount = excluded.compare_at_amount, image_path = excluded.image_path,
    active = excluded.active, supplier_url = excluded.supplier_url, supplier_sku = excluded.supplier_sku, updated_at = now()
  where variant.store_id = excluded.store_id and variant.product_id = excluded.product_id;

  if (select count(*) from public.product_variants where store_id = p_store_id and product_id = p_product_id) <> jsonb_array_length(p_variants) then
    raise exception 'A variant belongs to another product.' using errcode = '42501';
  end if;
  return v_revision;
end;
$$;

revoke all on function public.save_shipping_profile(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_physical_store(uuid, text, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_shipping_profile(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.save_physical_store(uuid, text, integer, jsonb, jsonb) to service_role;

commit;
