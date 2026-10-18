-- Run as a migration administrator. All probe data is rolled back.
begin;
do $$
declare
  owner_id uuid;
  first_store uuid := gen_random_uuid();
  second_store uuid := gen_random_uuid();
  first_account text := 'acct_probe' || replace(gen_random_uuid()::text, '-', '');
  second_account text := 'acct_probe' || replace(gen_random_uuid()::text, '-', '');
  first_connection uuid;
  second_connection uuid;
  product_id text := gen_random_uuid()::text;
  denied boolean := false;
begin
  select owner_user_id into owner_id from public.stores where owner_user_id is not null limit 1;
  if owner_id is null then raise exception 'An owner is required to run the probe'; end if;
  insert into public.stores(id, owner_user_id) values(first_store, owner_id), (second_store, owner_id);
  begin
    perform public.activate_payment_connection(first_store, gen_random_uuid(), first_account, false, true, true, 'GB', '{}');
  exception when others then
    if sqlerrm = 'Store ownership required' then denied := true; else raise; end if;
  end;
  if not denied then raise exception 'Wrong-owner activation was accepted'; end if;
  first_connection := public.activate_payment_connection(first_store, owner_id, first_account, false, true, true, 'GB', '{}');
  second_connection := public.activate_payment_connection(first_store, owner_id, second_account, false, true, true, 'GB', '{}');
  if (select count(*) from public.payment_connections where store_id = first_store) <> 2
    or (select count(*) from public.payment_connections where store_id = first_store and is_current) <> 1
    or (select is_current from public.payment_connections where id = first_connection)
  then raise exception 'Switching accounts did not retain history and one current account'; end if;
  denied := false;
  begin
    perform public.activate_payment_connection(second_store, owner_id, second_account, false, true, true, 'GB', '{}');
  exception when others then
    if sqlerrm = 'Account already linked to another store' then denied := true; else raise; end if;
  end;
  if not denied then raise exception 'Cross-store account reuse was accepted'; end if;
  insert into public.products(id,store_id,slug,name) values(product_id,second_store,'probe-product','Probe');
  denied := false;
  begin
    insert into public.product_payment_refs(store_id,connection_id,product_id,external_product_id,external_price_id,amount,currency)
    values(second_store,second_connection,product_id,'prod_probe','price_probe',100,'gbp');
  exception when foreign_key_violation then denied := true;
  end;
  if not denied then raise exception 'Cross-store payment product reference was accepted'; end if;
end;
$$;
rollback;
select 'Ownership, account history, cross-store account reuse, and reference isolation passed; all probe records rolled back' as verification;
