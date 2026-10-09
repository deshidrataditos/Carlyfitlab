-- Run as owner after 202610090002_member_restrictions.sql. All target accounts
-- use random UUIDs and example.invalid emails. No real identity is changed.
-- Tests do not call email providers or AI. All fixtures/helpers are rolled back.
-- If any assertion fails, execute ROLLBACK before doing anything else.
begin;
create temporary table carlyfit_restriction_test_anchor (unused boolean) on commit drop;
do $$ declare v_schema text; begin
  select nspname into v_schema from pg_catalog.pg_namespace where oid=pg_catalog.pg_my_temp_schema();
  execute pg_catalog.format('grant usage on schema %I to anon, authenticated, service_role',v_schema);
end; $$;
create function pg_temp.restriction_assert(p_condition boolean,p_message text)
returns void language plpgsql security invoker set search_path='' as $$ begin
  if p_condition is distinct from true then raise exception 'FAIL: %',p_message; end if;
end; $$;
create function pg_temp.restriction_expect_error(p_sql text,p_state text,p_message text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_state text; begin
  begin execute p_sql; exception when others then
    get stacked diagnostics v_state=returned_sqlstate;
    if v_state=p_state then return; end if;
    raise exception 'FAIL: % (expected %, got %)',p_message,p_state,v_state;
  end;
  raise exception 'FAIL: % (expected %, no error)',p_message,p_state;
end; $$;
create function pg_temp.restriction_fixture(p_name text)
returns uuid language sql stable security invoker set search_path='' as $$
  select pg_catalog.current_setting('carlyfit_restriction_test.'||p_name)::uuid;
$$;
create function pg_temp.restriction_path()
returns text language sql stable security invoker set search_path='' as $$
  select pg_temp.restriction_fixture('customer')::text||'/'||pg_temp.restriction_fixture('order')::text||'/'||pg_temp.restriction_fixture('material')::text||'.pdf';
$$;
create function pg_temp.restriction_claim(p_name text,p_anonymous boolean default false)
returns void language plpgsql security invoker set search_path='' as $$ begin
  perform pg_catalog.set_config('request.jwt.claim.sub','',true);
  perform pg_catalog.set_config('request.jwt.claim.role','',true);
  perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object(
    'sub',case when p_name is null then null else pg_temp.restriction_fixture(p_name) end,
    'role',case when p_name is null then 'anon' else 'authenticated' end,
    'is_anonymous',p_anonymous,'user_metadata','{"role":"admin","canManageStore":true,"is_suspended":false}'::jsonb
  )::text,true);
end; $$;
grant execute on function pg_temp.restriction_assert(boolean,text),pg_temp.restriction_expect_error(text,text,text),
  pg_temp.restriction_fixture(text),pg_temp.restriction_path(),pg_temp.restriction_claim(text,boolean) to anon,authenticated,service_role;

do $$ declare v_name text; v_id uuid; begin
  foreach v_name in array array['admin','admin2','customer','stranger','moderator','anonymous','deleted'] loop
    v_id:=gen_random_uuid();perform set_config('carlyfit_restriction_test.'||v_name,v_id::text,true);
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,is_anonymous,created_at,updated_at,deleted_at)
    values(v_id,'authenticated','authenticated','restriction-test-'||v_id::text||'@example.invalid','',now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Temporary restriction test","role":"admin","is_suspended":false}'::jsonb,
      v_name='anonymous',now(),now(),case when v_name='deleted' then now() else null end);
  end loop;
  foreach v_name in array array['unknown','order','material'] loop
    perform set_config('carlyfit_restriction_test.'||v_name,gen_random_uuid()::text,true);
  end loop;
end; $$;
insert into carlyfit_private.store_admins(user_id) values(pg_temp.restriction_fixture('admin')),(pg_temp.restriction_fixture('admin2')),(pg_temp.restriction_fixture('anonymous'));
insert into carlyfit_private.testimonial_moderators(user_id) values(pg_temp.restriction_fixture('moderator'));
insert into storage.objects(bucket_id,name,metadata) values('carlyfit-plans',pg_temp.restriction_path(),'{"size":250,"mimetype":"application/pdf"}'::jsonb);
insert into carlyfit_private.store_material_access(object_path,user_id,order_id,material_id)
values(pg_temp.restriction_path(),pg_temp.restriction_fixture('customer'),pg_temp.restriction_fixture('order'),pg_temp.restriction_fixture('material'));
insert into public.testimonials(user_id,body,rating,status)
values(pg_temp.restriction_fixture('customer'),'Comentario aprobado que debe permanecer visible.',5,'approved');

-- An unrelated permissive policy must not override the new restrictive guard.
create policy carlyfit_restriction_test_permissive on public.testimonials
for insert to authenticated with check (user_id=(select auth.uid()) and status='pending');

do $$ declare v_function text; v_role text; begin
  foreach v_function in array array[
    'get_my_community_access()',
    'list_store_customer_restrictions(uuid[])',
    'set_store_customer_restriction(uuid,boolean,text,integer)'
  ] loop
    foreach v_role in array array['anon','service_role'] loop
      perform pg_temp.restriction_assert(not has_function_privilege(v_role,'public.'||v_function,'EXECUTE'),'public RPC not executable by '||v_role||': '||v_function);
      perform pg_temp.restriction_assert(not has_function_privilege(v_role,'carlyfit_private.'||v_function,'EXECUTE'),'private function not executable by '||v_role||': '||v_function);
    end loop;
    perform pg_temp.restriction_assert(has_function_privilege('authenticated','public.'||v_function,'EXECUTE'),'member wrapper executable: '||v_function);
    perform pg_temp.restriction_assert((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid=('carlyfit_private.'||v_function)::regprocedure),'private definer fixes search path: '||v_function);
    perform pg_temp.restriction_assert((select not prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid=('public.'||v_function)::regprocedure),'public invoker fixes search path: '||v_function);
  end loop;
end; $$;
select pg_temp.restriction_assert((select not polpermissive and polcmd='a' from pg_policy where polrelid='public.testimonials'::regclass and polname='testimonials_active_community_only'),'testimonial guard is restrictive INSERT only');
select pg_temp.restriction_assert((select count(*)=2 and bool_and(relrowsecurity) from pg_class where oid in ('carlyfit_private.member_restrictions'::regclass,'carlyfit_private.member_restriction_audit'::regclass)),'private tables retain RLS');

set local role anon;
select pg_temp.restriction_claim(null);
select pg_temp.restriction_expect_error('select public.get_my_community_access()','42501','anonymous own status denied');
select pg_temp.restriction_expect_error($q$select * from public.list_store_customer_restrictions(array[pg_temp.restriction_fixture('customer')])$q$,'42501','anonymous directory status denied');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),true,'Prueba de acceso',0)$q$,'42501','anonymous mutation denied');
reset role;
set local role authenticated;
select pg_temp.restriction_claim('customer');
select pg_temp.restriction_assert(public.get_my_community_access(),'new registered account is active');
select pg_temp.restriction_expect_error($q$select * from public.list_store_customer_restrictions(array[pg_temp.restriction_fixture('stranger')])$q$,'42501','customer cannot inspect another restriction');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('stranger'),true,'Prueba de acceso',0)$q$,'42501','metadata cannot grant mutation access');
select pg_temp.restriction_expect_error($q$select * from carlyfit_private.set_store_customer_restriction(pg_temp.restriction_fixture('stranger'),true,'Prueba de acceso',0)$q$,'42501','private function cannot bypass authorization');
select pg_temp.restriction_expect_error('select * from carlyfit_private.member_restrictions','42501','state cannot be read directly');
select pg_temp.restriction_expect_error('select * from carlyfit_private.member_restriction_audit','42501','audit cannot be read by customers');
select pg_temp.restriction_expect_error($q$insert into carlyfit_private.member_restrictions(user_id,is_suspended,reason,updated_at,version) values (pg_temp.restriction_fixture('stranger'),true,'Intento directo',now(),1)$q$,'42501','direct state writes denied');
select pg_temp.restriction_claim('moderator');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),true,'Prueba de acceso',0)$q$,'42501','testimonial moderator cannot suspend accounts');
select pg_temp.restriction_claim('anonymous',false);
select pg_temp.restriction_expect_error('select public.get_my_community_access()','42501','database anonymous flag cannot be forged');
select pg_temp.restriction_claim('deleted');
select pg_temp.restriction_expect_error('select public.get_my_community_access()','42501','deleted identity denied');
select pg_temp.restriction_claim('unknown');
select pg_temp.restriction_expect_error('select public.get_my_community_access()','42501','unknown identity denied');
select pg_temp.restriction_claim('admin',true);
select pg_temp.restriction_expect_error($q$select * from public.list_store_customer_restrictions(array[pg_temp.restriction_fixture('customer')])$q$,'42501','anonymous claim cannot use administrator RPC');
select pg_temp.restriction_claim('admin');
select pg_temp.restriction_assert((select not is_suspended and reason is null and updated_at is null and version=0 and can_suspend from public.list_store_customer_restrictions(array[pg_temp.restriction_fixture('customer')])),'new customer has version zero and action available');
select pg_temp.restriction_assert((select count(*)=2 and bool_and(not can_suspend) from public.list_store_customer_restrictions(array[pg_temp.restriction_fixture('admin'),pg_temp.restriction_fixture('admin2')])),'self and other administrator actions unavailable');
select pg_temp.restriction_assert((select count(*)=0 from public.list_store_customer_restrictions(array[]::uuid[])),'empty page accepted');
select pg_temp.restriction_assert((select count(*)=0 from public.list_store_customer_restrictions(array[pg_temp.restriction_fixture('unknown'),pg_temp.restriction_fixture('deleted'),pg_temp.restriction_fixture('anonymous')])),'unknown, deleted and anonymous identities excluded');
select pg_temp.restriction_expect_error('select * from public.list_store_customer_restrictions(null)','22023','null page denied');
select pg_temp.restriction_expect_error('select * from public.list_store_customer_restrictions(array[null]::uuid[])','22023','null target denied');
select pg_temp.restriction_expect_error($q$select * from public.list_store_customer_restrictions(array_fill(pg_temp.restriction_fixture('customer'),array[21]))$q$,'22023','unbounded page denied');
select pg_temp.restriction_expect_error($q$select * from public.list_store_customer_restrictions(array[[pg_temp.restriction_fixture('customer')]])$q$,'22023','multidimensional page denied');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('admin'),true,'Prueba de bloqueo',0)$q$,'42501','self suspension denied');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('admin2'),true,'Prueba de bloqueo',0)$q$,'42501','other administrator suspension denied');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('anonymous'),true,'Prueba de bloqueo',0)$q$,'P0002','anonymous target denied');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('unknown'),true,'Prueba de bloqueo',0)$q$,'P0002','unknown target denied');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('deleted'),true,'Prueba de bloqueo',0)$q$,'P0002','deleted target denied');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),true,'    ',0)$q$,'22023','blank reason denied');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),true,repeat('a',501),0)$q$,'22023','overlong reason denied');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),true,'Motivo'||chr(10),0)$q$,'22023','control characters denied');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),true,'Prueba de bloqueo',-1)$q$,'22023','negative version denied');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),null,'Prueba de bloqueo',0)$q$,'22023','null state denied');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),false,'Prueba sin cambio',0)$q$,'22023','no-op does not create an audit event');

select pg_temp.restriction_assert((select is_suspended and reason='Uso indebido de prueba' and updated_at is not null and version=1 and can_suspend
  from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),true,'  Uso indebido de prueba  ',0)),'suspension returns normalized reason and new version');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),true,'Reintento de la misma solicitud',0)$q$,'40001','duplicate stale request cannot overwrite or duplicate audit');
select pg_temp.restriction_claim('admin2');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),false,'Otra pestaña desactualizada',0)$q$,'40001','second administrator must reload current version');
select pg_temp.restriction_claim('customer');
select pg_temp.restriction_assert(not public.get_my_community_access(),'suspension applies despite an existing valid JWT');
select pg_temp.restriction_expect_error($q$insert into public.testimonials(user_id,body,rating) values (pg_temp.restriction_fixture('customer'),'Este comentario no debe publicarse por suspensión.',5)$q$,'42501','direct testimonial insert denied even with another permissive policy');
select pg_temp.restriction_assert((select count(*)=1 from public.profiles where id=pg_temp.restriction_fixture('customer')),'suspended member can read own account profile');
select pg_temp.restriction_assert((select count(*)=1 from public.testimonials where user_id=pg_temp.restriction_fixture('customer') and status='approved'),'suspension preserves historical approved testimonial');
select pg_temp.restriction_assert(carlyfit_private.can_read_store_material(pg_temp.restriction_path()),'paid-material entitlement remains intact');
select pg_temp.restriction_assert(exists(select 1 from storage.objects where bucket_id='carlyfit-plans' and name=pg_temp.restriction_path()),'suspended member can still read paid material through Storage RLS');
select pg_temp.restriction_claim('stranger');
select pg_temp.restriction_assert(public.get_my_community_access(),'another account remains active');
select pg_temp.restriction_assert(not exists(select 1 from storage.objects where bucket_id='carlyfit-plans' and name=pg_temp.restriction_path()),'paid material remains private from other accounts');
reset role;
select pg_temp.restriction_assert((select count(*)=1 and bool_and(actor_id=pg_temp.restriction_fixture('admin') and is_suspended and version=1 and reason='Uso indebido de prueba') from carlyfit_private.member_restriction_audit where user_id=pg_temp.restriction_fixture('customer')),'exactly one atomic audit event exists after rejected retries');
update auth.users set email='changed-'||id::text||'@example.invalid' where id=pg_temp.restriction_fixture('customer');
set local role authenticated;
select pg_temp.restriction_claim('customer');
select pg_temp.restriction_assert(not public.get_my_community_access(),'changing verified email does not bypass account suspension');
select pg_temp.restriction_claim('admin');
select pg_temp.restriction_assert((select not is_suspended and reason='Revisión finalizada de prueba' and version=2
  from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),false,'Revisión finalizada de prueba',1)),'reactivation is recorded with next version');
select pg_temp.restriction_claim('customer');
select pg_temp.restriction_assert(public.get_my_community_access(),'reactivation takes effect without waiting for token expiry');
insert into public.testimonials(user_id,body,rating) values(pg_temp.restriction_fixture('customer'),'Comentario permitido después de reactivar la cuenta.',5);
select pg_temp.restriction_assert((select count(*)=1 from public.testimonials where user_id=pg_temp.restriction_fixture('customer') and status='pending'),'reactivated member can submit a testimonial');
reset role;
select pg_temp.restriction_assert((select count(*)=2 and min(version)=1 and max(version)=2 from carlyfit_private.member_restriction_audit where user_id=pg_temp.restriction_fixture('customer')),'audit preserves both actions');

-- Promotion takes precedence over any earlier customer restriction.
set local role authenticated;
select pg_temp.restriction_claim('admin');
select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('stranger'),true,'Cuenta temporal de prueba',0);
reset role;
insert into carlyfit_private.store_admins(user_id) values(pg_temp.restriction_fixture('stranger'));
set local role authenticated;
select pg_temp.restriction_claim('stranger');
select pg_temp.restriction_assert(public.get_my_community_access(),'promoted administrator cannot be implicitly restricted');
select pg_temp.restriction_assert((select not is_suspended and not can_suspend from public.list_store_customer_restrictions(array[pg_temp.restriction_fixture('stranger')])),'directory shows effective administrator access');
reset role;
delete from carlyfit_private.store_admins where user_id=pg_temp.restriction_fixture('admin');
set local role authenticated;
select pg_temp.restriction_claim('admin');
select pg_temp.restriction_expect_error($q$select * from public.set_store_customer_restriction(pg_temp.restriction_fixture('customer'),true,'Intento después de revocación',2)$q$,'42501','removed administrator loses mutation access immediately');
reset role;
rollback;
select 'member restriction authorization, reactivation and paid-access tests passed' as result;
