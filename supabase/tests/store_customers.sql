-- Run as database owner after 202610090001_store_customers.sql. All identities
-- below use random UUIDs and example.invalid addresses. No account is emailed.
-- ROLLBACK removes every fixture/helper. If an assertion fails, run ROLLBACK.
begin;
create temporary table carlyfit_customer_test_anchor (unused boolean) on commit drop;
do $$ declare v_schema text; begin
  select nspname into v_schema from pg_catalog.pg_namespace where oid=pg_catalog.pg_my_temp_schema();
  execute pg_catalog.format('grant usage on schema %I to anon, authenticated, service_role',v_schema);
end; $$;
create function pg_temp.customer_assert(p_condition boolean,p_message text)
returns void language plpgsql security invoker set search_path='' as $$ begin
  if p_condition is distinct from true then raise exception 'FAIL: %',p_message; end if;
end; $$;
create function pg_temp.customer_expect_error(p_sql text,p_state text,p_message text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_state text; begin
  begin execute p_sql; exception when others then
    get stacked diagnostics v_state=returned_sqlstate;
    if v_state=p_state then return; end if;
    raise exception 'FAIL: % (expected %, got %)',p_message,p_state,v_state;
  end;
  raise exception 'FAIL: % (expected %, no error)',p_message,p_state;
end; $$;
create function pg_temp.customer_fixture(p_name text)
returns uuid language sql stable security invoker set search_path='' as $$
  select pg_catalog.current_setting('carlyfit_customer_test.'||p_name)::uuid;
$$;
create function pg_temp.customer_marker()
returns text language sql stable security invoker set search_path='' as $$
  select pg_catalog.current_setting('carlyfit_customer_test.marker');
$$;
create function pg_temp.customer_claim(p_name text,p_anonymous boolean default false)
returns void language plpgsql security invoker set search_path='' as $$ begin
  perform pg_catalog.set_config('request.jwt.claim.sub','',true);
  perform pg_catalog.set_config('request.jwt.claim.role','',true);
  perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object(
    'sub',case when p_name is null then null else pg_temp.customer_fixture(p_name) end,
    'role',case when p_name is null then 'anon' else 'authenticated' end,
    'is_anonymous',p_anonymous,'user_metadata','{"role":"admin","canManageStore":true}'::jsonb
  )::text,true);
end; $$;
grant execute on function pg_temp.customer_assert(boolean,text),pg_temp.customer_expect_error(text,text,text),
  pg_temp.customer_fixture(text),pg_temp.customer_marker(),pg_temp.customer_claim(text,boolean) to anon,authenticated,service_role;

do $$ declare v_name text; v_id uuid; v_marker text; begin
  v_marker:='dirtest-'||gen_random_uuid()::text;
  perform set_config('carlyfit_customer_test.marker',v_marker,true);
  foreach v_name in array array['admin','customer','missing','moderator','anonymous','deleted'] loop
    v_id:=gen_random_uuid();perform set_config('carlyfit_customer_test.'||v_name,v_id::text,true);
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,is_anonymous,created_at,updated_at,deleted_at)
    values(v_id,'authenticated','authenticated',v_marker||'-'||v_name||'@example.invalid','',now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name',v_marker||' '||v_name,'role','admin'),
      v_name='anonymous','2026-01-01T00:00:00Z',now(),case when v_name='deleted' then now() else null end);
  end loop;
end; $$;
insert into carlyfit_private.store_admins(user_id) values(pg_temp.customer_fixture('admin')),(pg_temp.customer_fixture('anonymous'));
insert into carlyfit_private.testimonial_moderators(user_id) values(pg_temp.customer_fixture('moderator'));
update public.profiles set display_name=pg_temp.customer_marker()||E' %_\\' where id=pg_temp.customer_fixture('customer');
delete from public.profiles where id=pg_temp.customer_fixture('missing');

select pg_temp.customer_assert(not has_function_privilege('anon','public.list_store_customers(text,integer,integer)','EXECUTE'),'visitor cannot execute public RPC');
select pg_temp.customer_assert(not has_function_privilege('service_role','public.list_store_customers(text,integer,integer)','EXECUTE'),'service role has no public RPC grant');
select pg_temp.customer_assert(not has_function_privilege('anon','carlyfit_private.list_store_customers(text,integer,integer)','EXECUTE'),'visitor cannot execute private function');
select pg_temp.customer_assert(not has_function_privilege('service_role','carlyfit_private.list_store_customers(text,integer,integer)','EXECUTE'),'service role has no private function grant');
select pg_temp.customer_assert((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='carlyfit_private.list_store_customers(text,integer,integer)'::regprocedure),'private definer fixes empty search path');
select pg_temp.customer_assert((select not prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.list_store_customers(text,integer,integer)'::regprocedure),'public wrapper is invoker with empty search path');

set local role anon;
select pg_temp.customer_claim(null);
select pg_temp.customer_expect_error('select * from public.list_store_customers()','42501','anonymous visitor denied');
reset role;
set local role authenticated;
select pg_temp.customer_claim('customer');
select pg_temp.customer_expect_error('select * from public.list_store_customers()','42501','customer cannot forge metadata to list other accounts');
select pg_temp.customer_expect_error('select * from carlyfit_private.list_store_customers('''',21,0)','42501','customer cannot bypass public wrapper');
select pg_temp.customer_claim('moderator');
select pg_temp.customer_expect_error('select * from public.list_store_customers()','42501','testimonial moderator is not store administrator');
select pg_temp.customer_claim('anonymous',false);
select pg_temp.customer_expect_error('select * from public.list_store_customers()','42501','anonymous database identity denied even if allowlisted');
select pg_temp.customer_claim('admin',true);
select pg_temp.customer_expect_error('select * from public.list_store_customers()','42501','anonymous claim denied');
select pg_temp.customer_claim('admin');

select pg_temp.customer_assert((select count(*)=4 from public.list_store_customers(pg_temp.customer_marker(),21,0)),'all registered fixtures including no-profile/no-order customers appear; anonymous and deleted excluded');
select pg_temp.customer_assert((select display_name=pg_temp.customer_marker()||' missing' and email=pg_temp.customer_marker()||'-missing@example.invalid' and created_at='2026-01-01T00:00:00Z' from public.list_store_customers(pg_temp.customer_marker(),21,0) where id=pg_temp.customer_fixture('missing')),'missing profile falls back without changing registration date or verified auth email');
select pg_temp.customer_assert((select count(*)=1 and bool_and(id=pg_temp.customer_fixture('customer')) from public.list_store_customers(E'%_\\',21,0) where email like pg_temp.customer_marker()||'%'),'wildcards and slash are literal');
select pg_temp.customer_assert((select count(*)=1 and bool_and(id=pg_temp.customer_fixture('missing')) from public.list_store_customers(upper(pg_temp.customer_marker()||'-missing@'),21,0)),'email search is case insensitive');
select pg_temp.customer_assert((select count(*)=0 from public.list_store_customers(''' OR 1=1 --',21,0)),'query text never becomes SQL');
select pg_temp.customer_assert((select count(*)=2 from public.list_store_customers(pg_temp.customer_marker(),2,0)),'direct RPC limit respected');
select pg_temp.customer_assert((select count(*)=2 from public.list_store_customers(pg_temp.customer_marker(),2,2)),'offset respected');
select pg_temp.customer_assert(not exists(select id from public.list_store_customers(pg_temp.customer_marker(),2,0) intersect select id from public.list_store_customers(pg_temp.customer_marker(),2,2)),'stable ID tie-breaker keeps same-timestamp pages distinct');
select pg_temp.customer_expect_error('select * from public.list_store_customers(repeat(''a'',101),21,0)','22023','overlong search denied');
select pg_temp.customer_expect_error('select * from public.list_store_customers(chr(10),21,0)','22023','control search denied');
select pg_temp.customer_expect_error('select * from public.list_store_customers('''',22,0)','22023','unbounded page denied');
select pg_temp.customer_expect_error('select * from public.list_store_customers('''',21,-1)','22023','negative offset denied');
select pg_temp.customer_expect_error('select * from public.list_store_customers('''',21,100001)','22023','excessive offset denied');
select pg_temp.customer_expect_error('select * from public.list_store_customers(null,21,0)','22023','null search denied');
reset role;

-- Permission is checked on each call even while the same JWT is still valid.
delete from carlyfit_private.store_admins where user_id=pg_temp.customer_fixture('admin');
set local role authenticated;
select pg_temp.customer_claim('admin');
select pg_temp.customer_expect_error('select * from public.list_store_customers()','42501','revoked administrator immediately denied');
reset role;
rollback;
select 'store customer directory authorization and search tests passed' as result;
