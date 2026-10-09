-- Community-only suspension: AI and new testimonials. This does not ban the
-- Supabase identity or change order, profile, or paid-material access policies.
-- Apply as database owner after store_customers. No customer is suspended here.
begin;

create table carlyfit_private.member_restrictions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_suspended boolean not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 500 and reason !~ '[[:cntrl:]]'),
  updated_at timestamptz not null,
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null check (version > 0)
);
create table carlyfit_private.member_restriction_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  is_suspended boolean not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 500 and reason !~ '[[:cntrl:]]'),
  changed_at timestamptz not null,
  version integer not null check (version > 0),
  unique (user_id, version)
);
alter table carlyfit_private.member_restrictions enable row level security;
alter table carlyfit_private.member_restriction_audit enable row level security;
revoke all on table carlyfit_private.member_restrictions, carlyfit_private.member_restriction_audit
  from public, anon, authenticated, service_role;

create function carlyfit_private.get_my_community_access()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
    or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false'
    or not exists (select 1 from auth.users as u where u.id = auth.uid()
      and coalesce(u.is_anonymous, false) = false and u.deleted_at is null) then
    raise exception 'Registered account required' using errcode = '42501';
  end if;
  -- A later promotion must never leave a store administrator locked out by
  -- an older customer restriction. Roles never come from editable metadata.
  return exists (select 1 from carlyfit_private.store_admins as a where a.user_id = auth.uid())
    or not exists (select 1 from carlyfit_private.member_restrictions as r
      where r.user_id = auth.uid() and r.is_suspended);
end;
$$;
revoke all on function carlyfit_private.get_my_community_access() from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.get_my_community_access() to authenticated;

create function public.get_my_community_access()
returns boolean
language sql stable security invoker set search_path = ''
as $$ select carlyfit_private.get_my_community_access(); $$;
revoke all on function public.get_my_community_access() from public, anon, authenticated, service_role;
grant execute on function public.get_my_community_access() to authenticated;

-- AND with every permissive INSERT policy, including direct authenticated
-- Supabase requests that do not pass through the website's server.
create policy testimonials_active_community_only on public.testimonials
as restrictive for insert to authenticated
with check ((select carlyfit_private.get_my_community_access()));

create function carlyfit_private.list_store_customer_restrictions(p_user_ids uuid[])
returns table (
  user_id uuid, is_suspended boolean, reason text, updated_at timestamptz,
  version integer, can_suspend boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not carlyfit_private.can_manage_store()
    or not exists (select 1 from auth.users as u where u.id = auth.uid() and u.deleted_at is null) then
    raise exception 'Store management permission required' using errcode = '42501';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) > 20
    or (cardinality(p_user_ids) > 0 and array_ndims(p_user_ids) <> 1) then
    raise exception 'Invalid customer selection' using errcode = '22023';
  end if;
  if array_position(p_user_ids, null) is not null then
    raise exception 'Invalid customer selection' using errcode = '22023';
  end if;
  return query
    select u.id,
      coalesce(r.is_suspended, false) and a.user_id is null,
      r.reason, r.updated_at, coalesce(r.version, 0),
      u.id <> auth.uid() and a.user_id is null
    from auth.users as u
    left join carlyfit_private.member_restrictions as r on r.user_id = u.id
    left join carlyfit_private.store_admins as a on a.user_id = u.id
    where u.id = any(p_user_ids) and coalesce(u.is_anonymous, false) = false
      and u.deleted_at is null
    order by array_position(p_user_ids, u.id);
end;
$$;
revoke all on function carlyfit_private.list_store_customer_restrictions(uuid[]) from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.list_store_customer_restrictions(uuid[]) to authenticated;

create function public.list_store_customer_restrictions(p_user_ids uuid[])
returns table (
  user_id uuid, is_suspended boolean, reason text, updated_at timestamptz,
  version integer, can_suspend boolean
)
language sql stable security invoker set search_path = ''
as $$ select * from carlyfit_private.list_store_customer_restrictions(p_user_ids); $$;
revoke all on function public.list_store_customer_restrictions(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.list_store_customer_restrictions(uuid[]) to authenticated;

create function carlyfit_private.set_store_customer_restriction(
  p_user_id uuid, p_suspended boolean, p_reason text, p_expected_version integer
)
returns table (
  user_id uuid, is_suspended boolean, reason text, updated_at timestamptz,
  version integer, can_suspend boolean
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_version integer;
  v_suspended boolean;
  v_reason text;
  v_now timestamptz;
begin
  if not carlyfit_private.can_manage_store()
    or not exists (select 1 from auth.users as u where u.id = auth.uid() and u.deleted_at is null) then
    raise exception 'Store management permission required' using errcode = '42501';
  end if;
  v_reason := btrim(p_reason);
  if p_user_id is null or p_suspended is null or p_expected_version is null
    or p_expected_version < 0 or p_expected_version > 2147483646
    or v_reason is null or char_length(v_reason) not between 5 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception 'Invalid account restriction' using errcode = '22023';
  end if;
  -- Lock an existing identity even before its first restriction is created.
  -- Concurrent administrators then see the committed version before writing.
  perform u.id from auth.users as u where u.id = p_user_id
    and coalesce(u.is_anonymous, false) = false and u.deleted_at is null for update;
  if not found then
    raise exception 'Registered customer not found' using errcode = 'P0002';
  end if;
  if p_user_id = auth.uid()
    or exists (select 1 from carlyfit_private.store_admins as a where a.user_id = p_user_id) then
    raise exception 'Store administrators cannot be restricted' using errcode = '42501';
  end if;
  select r.version, r.is_suspended into v_version, v_suspended
    from carlyfit_private.member_restrictions as r where r.user_id = p_user_id;
  v_version := coalesce(v_version, 0);
  v_suspended := coalesce(v_suspended, false);
  if v_version <> p_expected_version then
    raise exception 'Account restriction changed; reload the customer' using errcode = '40001';
  end if;
  if v_suspended = p_suspended then
    raise exception 'Account already has the requested status' using errcode = '22023';
  end if;
  v_version := v_version + 1;
  v_now := clock_timestamp();
  insert into carlyfit_private.member_restrictions as current_restriction
    (user_id, is_suspended, reason, updated_at, updated_by, version)
    values (p_user_id, p_suspended, v_reason, v_now, auth.uid(), v_version)
    on conflict on constraint member_restrictions_pkey do update
      set is_suspended = excluded.is_suspended, reason = excluded.reason,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by, version = excluded.version;
  insert into carlyfit_private.member_restriction_audit
    (user_id, actor_id, is_suspended, reason, changed_at, version)
    values (p_user_id, auth.uid(), p_suspended, v_reason, v_now, v_version);
  return query select * from carlyfit_private.list_store_customer_restrictions(array[p_user_id]);
end;
$$;
revoke all on function carlyfit_private.set_store_customer_restriction(uuid,boolean,text,integer) from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.set_store_customer_restriction(uuid,boolean,text,integer) to authenticated;

create function public.set_store_customer_restriction(
  p_user_id uuid, p_suspended boolean, p_reason text, p_expected_version integer
)
returns table (
  user_id uuid, is_suspended boolean, reason text, updated_at timestamptz,
  version integer, can_suspend boolean
)
language sql security invoker set search_path = ''
as $$ select * from carlyfit_private.set_store_customer_restriction(p_user_id,p_suspended,p_reason,p_expected_version); $$;
revoke all on function public.set_store_customer_restriction(uuid,boolean,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.set_store_customer_restriction(uuid,boolean,text,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
