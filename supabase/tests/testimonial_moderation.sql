-- Run the whole file as the project database owner in Supabase SQL Editor,
-- AFTER both migrations. No pgTAP extension or real client JWT is required.
-- The simulated claims are trusted test inputs set by the database owner;
-- the website must still pass a real, verified Supabase JWT.
-- Every fixture has a random UUID and is uncommitted. No existing users or
-- testimonials are changed. ROLLBACK removes fixtures and temporary helpers.
-- On an assertion/error, run ROLLBACK before retrying this file. Audit identity
-- sequence values may have gaps after rollback (normal PostgreSQL behavior).
begin;

-- SQL Editor can start with no temporary namespace. A temporary table creates
-- it before the helper functions refer to pg_temp. GRANT SCHEMA needs the
-- actual pg_temp_N name rather than the pg_temp relation/function alias.
create temporary table carlyfit_test_session_anchor (unused boolean) on commit drop;
do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_catalog.pg_namespace
  where oid = pg_catalog.pg_my_temp_schema();
  execute pg_catalog.format('grant usage on schema %I to anon, authenticated', v_schema);
end;
$$;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_condition is distinct from true then
    raise exception 'FAIL: %', p_message;
  end if;
end;
$$;

create function pg_temp.expect_error(p_sql text, p_state text, p_message text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = p_state then return; end if;
    raise exception 'FAIL: % (expected SQLSTATE %, got %)', p_message, p_state, v_state;
  end;
  raise exception 'FAIL: % (expected SQLSTATE %, no error)', p_message, p_state;
end;
$$;

create function pg_temp.fixture(p_name text)
returns uuid language sql stable security invoker set search_path = '' as $$
  select pg_catalog.current_setting('carlyfit_test.' || p_name)::uuid;
$$;

create function pg_temp.claim_as(p_name text, p_anonymous boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  -- Clear legacy per-claim settings so they cannot override this simulation.
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
    'sub', case when p_name is null then null else pg_temp.fixture(p_name) end,
    'role', case when p_name is null then 'anon' else 'authenticated' end,
    'is_anonymous', p_anonymous,
    -- Deliberately forged metadata must never grant moderator permissions.
    'user_metadata', pg_catalog.jsonb_build_object('role', 'admin', 'is_admin', true),
    'app_metadata', pg_catalog.jsonb_build_object('role', 'admin', 'is_admin', true)
  )::text, true);
end;
$$;

grant execute on function pg_temp.assert_true(boolean, text),
  pg_temp.expect_error(text, text, text), pg_temp.fixture(text),
  pg_temp.claim_as(text, boolean) to anon, authenticated;

do $$
declare v_name text; v_id uuid;
begin
  foreach v_name in array array['moderator', 'customer', 'other_customer', 'anonymous'] loop
    v_id := gen_random_uuid();
    perform set_config('carlyfit_test.' || v_name, v_id::text, true);
    insert into auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at
    ) values (
      v_id, 'authenticated', 'authenticated',
      'moderation-test-' || v_id::text || '@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Temporary moderation test","role":"admin","is_admin":true}'::jsonb,
      v_name = 'anonymous', now(), now()
    );
  end loop;
  foreach v_name in array array['pending', 'approved', 'rejected', 'moderator_own'] loop
    perform set_config('carlyfit_test.' || v_name, gen_random_uuid()::text, true);
  end loop;
end;
$$;

insert into carlyfit_private.testimonial_moderators(user_id)
values (pg_temp.fixture('moderator')), (pg_temp.fixture('anonymous'));

-- Dates in the future keep only these fixtures at the top of the bounded
-- lists even when the project already contains customer testimonials.
insert into public.testimonials(id, user_id, body, rating, status, created_at)
values
  (pg_temp.fixture('pending'), pg_temp.fixture('customer'),
   'Temporary pending fixture, transaction rollback only.', 5, 'pending', '9999-01-04 UTC'),
  (pg_temp.fixture('approved'), pg_temp.fixture('other_customer'),
   'Temporary approved fixture, transaction rollback only.', 4, 'approved', '9999-01-03 UTC'),
  (pg_temp.fixture('rejected'), pg_temp.fixture('other_customer'),
   'Temporary rejected fixture, transaction rollback only.', 3, 'rejected', '9999-01-02 UTC'),
  (pg_temp.fixture('moderator_own'), pg_temp.fixture('moderator'),
   'Temporary moderator-owned fixture, transaction rollback only.', 5, 'pending', '9999-01-01 UTC');

-- Public visitors only receive the approved projection; all moderation RPCs
-- and direct table access remain unavailable.
set local role anon;
select pg_temp.claim_as(null);
do $$
begin
  perform pg_temp.assert_true(
    exists(select 1 from public.list_public_testimonials(50) where id = pg_temp.fixture('approved'))
    and not exists(select 1 from public.list_public_testimonials(50)
      where id in (pg_temp.fixture('pending'), pg_temp.fixture('rejected'), pg_temp.fixture('moderator_own'))),
    'visitors see approved testimonials only');
  perform pg_temp.expect_error('select public.can_moderate_testimonials()', '42501', 'visitor capability RPC denied');
  perform pg_temp.expect_error('select * from public.list_moderation_testimonials()', '42501', 'visitor list denied');
  perform pg_temp.expect_error($sql$select * from public.moderate_testimonial(pg_temp.fixture('pending'), 'approved', 'pending')$sql$,
    '42501', 'visitor moderation denied');
  perform pg_temp.expect_error('select * from public.testimonials', '42501', 'visitor raw table denied');
end;
$$;
reset role;

-- A real customer remains unprivileged even when both stored user metadata
-- and the simulated JWT metadata contain forged administrator properties.
set local role authenticated;
select pg_temp.claim_as('customer');
do $$
begin
  perform pg_temp.assert_true(not public.can_moderate_testimonials(), 'metadata cannot grant moderation');
  perform pg_temp.assert_true(
    (select count(*) = 1 from public.testimonials where id in
      (pg_temp.fixture('pending'), pg_temp.fixture('approved'), pg_temp.fixture('rejected'), pg_temp.fixture('moderator_own'))),
    'customer RLS still exposes only their own testimonial');
  perform pg_temp.expect_error('select * from public.list_moderation_testimonials()', '42501', 'customer moderation list denied');
  perform pg_temp.expect_error($sql$select * from public.moderate_testimonial(pg_temp.fixture('pending'), 'approved', 'pending')$sql$,
    '42501', 'customer cannot self-approve');
  perform pg_temp.expect_error($sql$select * from carlyfit_private.moderate_testimonial(pg_temp.fixture('pending'), 'approved', 'pending')$sql$,
    '42501', 'private function cannot bypass authorization');
  perform pg_temp.expect_error('select * from carlyfit_private.list_moderation_testimonials(''pending'', 20, 0)',
    '42501', 'private list cannot bypass authorization');
  perform pg_temp.expect_error($sql$update public.testimonials set status = 'approved' where id = pg_temp.fixture('pending')$sql$,
    '42501', 'customer direct status update denied');
  perform pg_temp.expect_error($sql$insert into carlyfit_private.testimonial_moderators(user_id) values (pg_temp.fixture('customer'))$sql$,
    '42501', 'customer cannot enroll as moderator');
  perform pg_temp.expect_error('select * from carlyfit_private.testimonial_moderation_audit', '42501', 'audit is private');
end;
$$;

-- Being placed on the allowlist must not make an anonymous Auth identity
-- privileged, even if the JWT incorrectly omits its anonymous flag.
select pg_temp.claim_as('anonymous', false);
select pg_temp.assert_true(not public.can_moderate_testimonials(), 'database anonymous identity denied');
select pg_temp.expect_error('select * from public.list_moderation_testimonials()', '42501', 'anonymous Auth list denied');
select pg_temp.expect_error($sql$select * from public.moderate_testimonial(pg_temp.fixture('pending'), 'approved', 'pending')$sql$,
  '42501', 'anonymous Auth moderation denied');
select pg_temp.claim_as('moderator', true);
select pg_temp.assert_true(not public.can_moderate_testimonials(), 'JWT anonymous identity denied');

-- Only the assigned, non-anonymous moderator can list and make audited
-- decisions. Their ordinary table permissions remain as narrow as a customer.
select pg_temp.claim_as('moderator');
do $$
begin
  perform pg_temp.assert_true(public.can_moderate_testimonials(), 'assigned moderator capability');
  perform pg_temp.assert_true(
    (select count(*) = 2 from public.list_moderation_testimonials('pending', 50, 0)
      where id in (pg_temp.fixture('pending'), pg_temp.fixture('moderator_own'))),
    'moderator can list pending testimonials from other users');
  perform pg_temp.assert_true(
    (select id = pg_temp.fixture('moderator_own') from public.list_moderation_testimonials('pending', 1, 1)),
    'moderation pagination is deterministic');
  perform pg_temp.assert_true(
    exists(select 1 from public.list_moderation_testimonials('rejected', 50, 0) where id = pg_temp.fixture('rejected')),
    'moderator can list rejected testimonials');
  perform pg_temp.expect_error($sql$update public.testimonials set status = 'approved' where id = pg_temp.fixture('moderator_own')$sql$,
    '42501', 'moderator cannot bypass RPC with a direct status update');
  perform pg_temp.expect_error($sql$update public.testimonials set body = 'Attempted direct moderator rewrite' where id = pg_temp.fixture('moderator_own')$sql$,
    '42501', 'moderator cannot rewrite testimonial body');
  perform pg_temp.expect_error('select * from carlyfit_private.testimonial_moderators', '42501', 'moderator cannot read allowlist');
  perform pg_temp.expect_error('select * from carlyfit_private.testimonial_moderation_audit', '42501', 'moderator cannot read raw audit');
  perform pg_temp.expect_error('select * from public.list_moderation_testimonials(null, 20, 0)', '22023', 'null status rejected');
  perform pg_temp.expect_error('select * from public.list_moderation_testimonials(''pending'', 51, 0)', '22023', 'unbounded list rejected');
  perform pg_temp.expect_error('select * from public.list_moderation_testimonials(''pending'', 20, -1)', '22023', 'negative offset rejected');
  perform pg_temp.expect_error($sql$select * from public.moderate_testimonial(pg_temp.fixture('pending'), 'pending', 'pending')$sql$,
    '22023', 'invalid target status rejected');
  perform pg_temp.expect_error($sql$select * from public.moderate_testimonial(pg_temp.fixture('pending'), 'approved', null)$sql$,
    '22023', 'expected state required');
  perform pg_temp.expect_error($sql$select * from public.moderate_testimonial(gen_random_uuid(), 'approved', 'pending')$sql$,
    'P0002', 'missing testimonial rejected');
  perform pg_temp.assert_true(
    (select status = 'approved' and moderated_at is not null
      from public.moderate_testimonial(pg_temp.fixture('pending'), 'approved', 'pending')),
    'moderator approval succeeds');
  perform pg_temp.expect_error($sql$select * from public.moderate_testimonial(pg_temp.fixture('pending'), 'rejected', 'pending')$sql$,
    '40001', 'stale decision cannot overwrite approval');
  perform pg_temp.assert_true(
    (select status = 'rejected' and moderated_at is not null
      from public.moderate_testimonial(pg_temp.fixture('approved'), 'rejected', 'approved')),
    'moderator rejection succeeds');
end;
$$;
reset role;

-- Audit checks run as owner; no real audit records are inspected or returned.
do $$
declare v_approved_at timestamptz;
begin
  select moderated_at into v_approved_at from public.testimonials where id = pg_temp.fixture('pending');
  perform set_config('carlyfit_test.approved_at', v_approved_at::text, true);
  perform pg_temp.assert_true(
    (select count(*) = 2 from carlyfit_private.testimonial_moderation_audit
      where testimonial_id in (pg_temp.fixture('pending'), pg_temp.fixture('approved'))),
    'one audit row per transition; failed attempts write none');
  perform pg_temp.assert_true(exists(
    select 1 from carlyfit_private.testimonial_moderation_audit
    where testimonial_id = pg_temp.fixture('pending') and moderator_id = pg_temp.fixture('moderator')
      and old_status = 'pending' and new_status = 'approved' and moderated_at = v_approved_at),
    'approval audit records actor, states, and matching timestamp');
  perform pg_temp.assert_true(exists(
    select 1 from carlyfit_private.testimonial_moderation_audit as a
    join public.testimonials as t on t.id = a.testimonial_id
    where a.testimonial_id = pg_temp.fixture('approved') and a.moderator_id = pg_temp.fixture('moderator')
      and a.old_status = 'approved' and a.new_status = 'rejected' and a.moderated_at = t.moderated_at),
    'rejection audit records actor, states, and matching timestamp');
  perform pg_temp.assert_true(
    (select body = 'Temporary pending fixture, transaction rollback only.' and rating = 5
      and user_id = pg_temp.fixture('customer') and created_at = '9999-01-04 UTC'::timestamptz
      from public.testimonials where id = pg_temp.fixture('pending')),
    'moderation leaves original content, author, rating, and submission date unchanged');
end;
$$;

set local role authenticated;
select pg_temp.claim_as('moderator');
select pg_temp.assert_true(
  (select status = 'approved' and moderated_at = current_setting('carlyfit_test.approved_at')::timestamptz
    from public.moderate_testimonial(pg_temp.fixture('pending'), 'approved', 'approved')),
  'repeated decision is a no-op retaining its timestamp');
reset role;
select pg_temp.assert_true(
  (select count(*) = 1 from carlyfit_private.testimonial_moderation_audit where testimonial_id = pg_temp.fixture('pending')),
  'repeated decision does not duplicate audit');

set local role anon;
select pg_temp.claim_as(null);
select pg_temp.assert_true(
  exists(select 1 from public.list_public_testimonials(50) where id = pg_temp.fixture('pending'))
  and not exists(select 1 from public.list_public_testimonials(50)
    where id in (pg_temp.fixture('approved'), pg_temp.fixture('rejected'), pg_temp.fixture('moderator_own'))),
  'public list immediately reflects approval and rejection');
reset role;

-- Removing the grant takes effect on the next call with the same identity.
delete from carlyfit_private.testimonial_moderators where user_id = pg_temp.fixture('moderator');
set local role authenticated;
select pg_temp.claim_as('moderator');
select pg_temp.assert_true(not public.can_moderate_testimonials(), 'grant revocation takes effect');
select pg_temp.expect_error('select * from public.list_moderation_testimonials()', '42501', 'revoked moderator list denied');
select pg_temp.expect_error($sql$select * from public.moderate_testimonial(pg_temp.fixture('pending'), 'rejected', 'approved')$sql$,
  '42501', 'revoked moderator action denied');
reset role;

rollback;
select 'PASS: testimonial moderation checks completed; all fixture changes rolled back.' as result;
