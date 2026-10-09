-- Run the whole file as database owner AFTER migrations 202610080002 and 003.
-- Random fixtures and temporary permissive test policies are transactional.
-- These SQL-only object rows create no uploaded files. ROLLBACK removes every
-- fixture, grant, policy, and helper. If an assertion fails, run ROLLBACK.
begin;
create temporary table carlyfit_store_test_anchor (unused boolean) on commit drop;
do $$ declare v_schema text; begin
  select nspname into v_schema from pg_catalog.pg_namespace where oid = pg_catalog.pg_my_temp_schema();
  execute pg_catalog.format('grant usage on schema %I to anon, authenticated', v_schema);
end; $$;

create function pg_temp.store_assert(p_condition boolean, p_message text)
returns void language plpgsql security invoker set search_path = '' as $$ begin
  if p_condition is distinct from true then raise exception 'FAIL: %', p_message; end if;
end; $$;
create function pg_temp.store_expect_error(p_sql text, p_state text, p_message text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_state text;
begin
  begin execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = p_state then return; end if;
    raise exception 'FAIL: % (expected %, got %)', p_message, p_state, v_state;
  end;
  raise exception 'FAIL: % (expected %, no error)', p_message, p_state;
end; $$;
create function pg_temp.store_fixture(p_name text)
returns uuid language sql stable security invoker set search_path = '' as $$
  select pg_catalog.current_setting('carlyfit_store_test.' || p_name)::uuid;
$$;
create function pg_temp.store_path(p_name text)
returns text language sql stable security invoker set search_path = '' as $$
  select pg_temp.store_fixture('customer')::text || '/' || pg_temp.store_fixture('order')::text || '/' || pg_temp.store_fixture(p_name)::text || '.pdf';
$$;
create function pg_temp.store_claim(p_name text, p_anonymous boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$ begin
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
    'sub', case when p_name is null then null else pg_temp.store_fixture(p_name) end,
    'role', case when p_name is null then 'anon' else 'authenticated' end,
    'is_anonymous', p_anonymous,
    'user_metadata', '{"role":"admin","canManageStore":true}'::jsonb
  )::text, true);
end; $$;
grant execute on function pg_temp.store_assert(boolean,text), pg_temp.store_expect_error(text,text,text),
  pg_temp.store_fixture(text), pg_temp.store_path(text), pg_temp.store_claim(text,boolean) to anon, authenticated;

do $$ declare v_name text; v_id uuid; begin
  foreach v_name in array array['admin','customer','stranger','moderator','anonymous'] loop
    v_id := gen_random_uuid();
    perform set_config('carlyfit_store_test.' || v_name, v_id::text, true);
    insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,is_anonymous,created_at,updated_at)
    values (v_id,'authenticated','authenticated','store-test-' || v_id::text || '@example.invalid','',now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Temporary store test","role":"admin"}'::jsonb,v_name='anonymous',now(),now());
  end loop;
  foreach v_name in array array['order','pending','published'] loop
    perform set_config('carlyfit_store_test.' || v_name, gen_random_uuid()::text, true);
  end loop;
end; $$;
insert into carlyfit_private.store_admins(user_id) values (pg_temp.store_fixture('admin')), (pg_temp.store_fixture('anonymous'));
insert into carlyfit_private.testimonial_moderators(user_id) values (pg_temp.store_fixture('moderator'));
insert into storage.objects(bucket_id,name,metadata) values
  ('carlyfit-plans',pg_temp.store_path('pending'),'{"size":250,"mimetype":"application/pdf"}'::jsonb),
  ('carlyfit-plans',pg_temp.store_path('published'),'{"size":250,"mimetype":"application/pdf"}'::jsonb);

-- Simulate unrelated, overly broad existing policies. The migration's
-- restrictive guards must still protect the private plans bucket.
grant select,insert,update,delete on storage.objects to anon, authenticated;
create policy carlyfit_store_test_broad_select on storage.objects for select to public using (bucket_id='carlyfit-plans');
create policy carlyfit_store_test_broad_insert on storage.objects for insert to public with check (bucket_id='carlyfit-plans');
create policy carlyfit_store_test_broad_update on storage.objects for update to public using (bucket_id='carlyfit-plans') with check (bucket_id='carlyfit-plans');
create policy carlyfit_store_test_broad_delete on storage.objects for delete to public using (bucket_id='carlyfit-plans');

set local role anon;
select pg_temp.store_claim(null);
select pg_temp.store_assert(not carlyfit_private.store_storage_read_allowed('carlyfit-plans',pg_temp.store_path('published')),'anonymous read guard safely returns false');
select pg_temp.store_assert(not carlyfit_private.store_storage_insert_allowed('carlyfit-plans'),'anonymous insert guard safely returns false');
select pg_temp.store_assert((select count(*)=0 from storage.objects where bucket_id='carlyfit-plans' and name in (pg_temp.store_path('pending'),pg_temp.store_path('published'))),'anonymous cannot see any fixture');
select pg_temp.store_expect_error('select public.can_manage_store()','42501','visitor permission RPC denied');
select pg_temp.store_expect_error($q$select public.publish_store_material(pg_temp.store_path('published'),pg_temp.store_fixture('customer'),pg_temp.store_fixture('order'),pg_temp.store_fixture('published'))$q$,'42501','visitor publish RPC denied');
reset role;

set local role authenticated;
select pg_temp.store_claim('customer');
select pg_temp.store_assert(not public.can_manage_store(),'forged metadata cannot grant store role');
select pg_temp.store_assert((select count(*)=0 from storage.objects where bucket_id='carlyfit-plans' and name in (pg_temp.store_path('pending'),pg_temp.store_path('published'))),'owner cannot read or list unverified uploads');
select pg_temp.store_expect_error($q$select public.publish_store_material(pg_temp.store_path('published'),pg_temp.store_fixture('customer'),pg_temp.store_fixture('order'),pg_temp.store_fixture('published'))$q$,'42501','customer cannot publish own material');
select pg_temp.store_expect_error('select * from carlyfit_private.store_admins','42501','role allowlist remains private');
select pg_temp.store_expect_error('select * from carlyfit_private.store_material_access','42501','publication allowlist remains private');
select pg_temp.store_expect_error($q$insert into storage.objects(bucket_id,name) values ('carlyfit-plans',pg_temp.store_fixture('customer')::text || '/forged.pdf')$q$,'42501','customer cannot upload even with broad policy');
select pg_temp.store_claim('moderator');
select pg_temp.store_assert(not public.can_manage_store(),'testimonial moderator is not store admin');
select pg_temp.store_claim('anonymous', false);
select pg_temp.store_assert(not public.can_manage_store(),'database anonymous identity remains unprivileged');

select pg_temp.store_claim('admin');
select pg_temp.store_assert(public.can_manage_store(),'explicit store admin has permission');
select pg_temp.store_assert((select count(*)=2 from storage.objects where bucket_id='carlyfit-plans' and name in (pg_temp.store_path('pending'),pg_temp.store_path('published'))),'admin can inspect pending upload metadata');
select pg_temp.store_expect_error($q$select public.publish_store_material(pg_temp.store_path('published'),pg_temp.store_fixture('stranger'),pg_temp.store_fixture('order'),pg_temp.store_fixture('published'))$q$,'22023','mismatched owner and path rejected');
select pg_temp.store_assert(public.publish_store_material(pg_temp.store_path('published'),pg_temp.store_fixture('customer'),pg_temp.store_fixture('order'),pg_temp.store_fixture('published')),'verified material publication succeeds');
select pg_temp.store_assert(public.publish_store_material(pg_temp.store_path('published'),pg_temp.store_fixture('customer'),pg_temp.store_fixture('order'),pg_temp.store_fixture('published')),'publication retry is idempotent');

select pg_temp.store_claim('customer');
select pg_temp.store_assert((select count(*)=1 from storage.objects where bucket_id='carlyfit-plans' and name in (pg_temp.store_path('pending'),pg_temp.store_path('published'))),'owner sees published material only');
select pg_temp.store_assert(exists(select 1 from storage.objects where bucket_id='carlyfit-plans' and name=pg_temp.store_path('published')),'published owner path readable');
select pg_temp.store_assert(not exists(select 1 from storage.objects where bucket_id='carlyfit-plans' and name=pg_temp.store_path('pending')),'pending owner path still hidden after another publication');
do $$ declare v_rows integer; begin
  update storage.objects set metadata='{"size":999}'::jsonb where bucket_id='carlyfit-plans' and name=pg_temp.store_path('published');
  get diagnostics v_rows = row_count;
  perform pg_temp.store_assert(v_rows=0,'owner cannot overwrite published file');
  begin
    delete from storage.objects where bucket_id='carlyfit-plans' and name=pg_temp.store_path('published');
    get diagnostics v_rows = row_count;
    perform pg_temp.store_assert(v_rows=0,'owner cannot delete published file');
  exception when insufficient_privilege then
    -- Some Supabase versions additionally reject every direct SQL DELETE
    -- through storage.protect_delete. Keep that protection enabled.
    null;
  end;
  perform pg_temp.store_assert(exists(
    select 1 from storage.objects where bucket_id='carlyfit-plans' and name=pg_temp.store_path('published')
  ),'published object remains after denied deletion');
end; $$;
select pg_temp.store_claim('stranger');
select pg_temp.store_assert((select count(*)=0 from storage.objects where bucket_id='carlyfit-plans' and name in (pg_temp.store_path('pending'),pg_temp.store_path('published'))),'another member cannot see published or pending paths');
select pg_temp.store_claim('customer', true);
select pg_temp.store_assert((select count(*)=0 from storage.objects where bucket_id='carlyfit-plans' and name=pg_temp.store_path('published')),'anonymous claim cannot read a published owner path');
reset role;

select pg_temp.store_assert((select count(*)=1 from carlyfit_private.store_material_access where material_id=pg_temp.store_fixture('published')),'retry created exactly one access row');
select pg_temp.store_assert((select public=false and file_size_limit=47185920 from storage.buckets where id='carlyfit-plans'),'bucket remains private with 45 MiB cap');
delete from carlyfit_private.store_admins where user_id=pg_temp.store_fixture('admin');
set local role authenticated;
select pg_temp.store_claim('admin');
select pg_temp.store_assert(not public.can_manage_store(),'role revocation takes effect');
select pg_temp.store_expect_error($q$select public.publish_store_material(pg_temp.store_path('pending'),pg_temp.store_fixture('customer'),pg_temp.store_fixture('order'),pg_temp.store_fixture('pending'))$q$,'42501','revoked admin cannot publish pending file');
reset role;
rollback;
select 'PASS: store roles and Storage RLS checks completed; all fixtures rolled back.' as result;
