-- Apply once as database owner after the member and moderation migrations.
-- This grants no account access. An owner separately inserts a verified
-- auth.users UUID into carlyfit_private.store_admins. Moderators are not admins.
begin;

create table carlyfit_private.store_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table carlyfit_private.store_admins enable row level security;
revoke all on table carlyfit_private.store_admins from public, anon, authenticated, service_role;

create function carlyfit_private.can_manage_store()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.role() = 'authenticated', false)
    and auth.uid() is not null
    and coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'false'
    and exists (
      select 1 from carlyfit_private.store_admins as a
      join auth.users as u on u.id = a.user_id
      where a.user_id = auth.uid() and coalesce(u.is_anonymous, false) = false
    );
$$;
revoke all on function carlyfit_private.can_manage_store() from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.can_manage_store() to authenticated;

create function public.can_manage_store()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select carlyfit_private.can_manage_store(); $$;
revoke all on function public.can_manage_store() from public, anon, authenticated, service_role;
grant execute on function public.can_manage_store() to authenticated;

-- A pending upload is never readable by its eventual recipient. This narrow
-- projection is populated only after the server has verified the object and
-- conditionally published its D1 material record. It holds no plan content.
create table carlyfit_private.store_material_access (
  object_path text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null,
  material_id uuid not null unique,
  published_at timestamptz not null default now()
);
alter table carlyfit_private.store_material_access enable row level security;
revoke all on table carlyfit_private.store_material_access from public, anon, authenticated, service_role;

create function carlyfit_private.can_read_store_material(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.role() = 'authenticated', false)
    and auth.uid() is not null
    and coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'false'
    and exists (
      select 1 from carlyfit_private.store_material_access as a
      where a.object_path = p_object_path and a.user_id = auth.uid()
    );
$$;
revoke all on function carlyfit_private.can_read_store_material(text) from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.can_read_store_material(text) to authenticated;

create function carlyfit_private.publish_store_material(
  p_object_path text, p_user_id uuid, p_order_id uuid, p_material_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
begin
  if not carlyfit_private.can_manage_store() then
    raise exception 'Store management permission required' using errcode = '42501';
  end if;
  v_prefix := p_user_id::text || '/' || p_order_id::text || '/' || p_material_id::text;
  if p_object_path is null or p_user_id is null or p_order_id is null or p_material_id is null
    or p_object_path not in (v_prefix || '.pdf', v_prefix || '.mp4', v_prefix || '.webm') then
    raise exception 'Invalid material path' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users as u where u.id = p_user_id and coalesce(u.is_anonymous, false) = false)
    or not exists (select 1 from storage.objects as o where o.bucket_id = 'carlyfit-plans' and o.name = p_object_path) then
    raise exception 'Material owner or object unavailable' using errcode = 'P0002';
  end if;
  insert into carlyfit_private.store_material_access (object_path, user_id, order_id, material_id)
    values (p_object_path, p_user_id, p_order_id, p_material_id)
    on conflict (object_path) do nothing;
  if not exists (
    select 1 from carlyfit_private.store_material_access as a
    where a.object_path = p_object_path and a.user_id = p_user_id
      and a.order_id = p_order_id and a.material_id = p_material_id
  ) then
    raise exception 'Material assignment changed' using errcode = '40001';
  end if;
  return true;
end;
$$;
revoke all on function carlyfit_private.publish_store_material(text, uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.publish_store_material(text, uuid, uuid, uuid) to authenticated;

create function public.publish_store_material(
  p_object_path text, p_user_id uuid, p_order_id uuid, p_material_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select carlyfit_private.publish_store_material(p_object_path, p_user_id, p_order_id, p_material_id); $$;
revoke all on function public.publish_store_material(text, uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.publish_store_material(text, uuid, uuid, uuid) to authenticated;

-- PUBLIC Storage policies are evaluated for anon too. Function permissions
-- are checked when PostgreSQL initializes expressions, before CASE branches
-- can exclude anonymous callers. These fixed boolean guards run as their
-- owner, but authorize exclusively from the request's verified auth claims.
create function carlyfit_private.store_storage_read_allowed(p_bucket_id text, p_object_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_bucket_id <> 'carlyfit-plans' then return true; end if;
  if auth.role() is distinct from 'authenticated'
    or auth.uid() is null
    or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    return false;
  end if;
  return carlyfit_private.can_manage_store()
    or (pg_catalog.split_part(p_object_path, '/', 1) = auth.uid()::text
      and carlyfit_private.can_read_store_material(p_object_path));
end;
$$;
revoke all on function carlyfit_private.store_storage_read_allowed(text, text) from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.store_storage_read_allowed(text, text) to anon, authenticated;

create function carlyfit_private.store_storage_insert_allowed(p_bucket_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_bucket_id <> 'carlyfit-plans' then return true; end if;
  if auth.role() is distinct from 'authenticated'
    or auth.uid() is null
    or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    return false;
  end if;
  return carlyfit_private.can_manage_store();
end;
$$;
revoke all on function carlyfit_private.store_storage_insert_allowed(text) from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.store_storage_insert_allowed(text) to anon, authenticated;

-- Store only PDFs and videos in the private bucket. Files use server-chosen
-- <verified owner UUID>/<order UUID>/<random upload UUID>.<extension> paths.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('carlyfit-plans', 'carlyfit-plans', false, 47185920, array['application/pdf','video/mp4','video/webm']);

create policy carlyfit_plans_read on storage.objects
for select to authenticated using (
  bucket_id = 'carlyfit-plans'
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  and (((storage.foldername(name))[1] = (select auth.uid()::text) and carlyfit_private.can_read_store_material(name)) or (select carlyfit_private.can_manage_store()))
);
create policy carlyfit_plans_insert_admin on storage.objects
for insert to authenticated with check (
  bucket_id = 'carlyfit-plans' and (select carlyfit_private.can_manage_store())
);

-- Restrictive guards keep broad pre-existing policies for other buckets from
-- accidentally opening these files. No user or admin UPDATE/DELETE permission
-- is granted; published files cannot be overwritten by a reusable upload URL.
create policy carlyfit_plans_read_guard on storage.objects
as restrictive for select to public using (
  carlyfit_private.store_storage_read_allowed(bucket_id, name)
);
create policy carlyfit_plans_insert_guard on storage.objects
as restrictive for insert to public with check (
  carlyfit_private.store_storage_insert_allowed(bucket_id)
);
create policy carlyfit_plans_no_overwrite on storage.objects
as restrictive for update to public
using (bucket_id <> 'carlyfit-plans') with check (bucket_id <> 'carlyfit-plans');
create policy carlyfit_plans_no_delete on storage.objects
as restrictive for delete to public using (bucket_id <> 'carlyfit-plans');

-- Storage RLS isolates published owner files; D1 retains payment state.
-- Application download URLs are issued only for currently approved orders and
-- expire after 60 seconds. Existing published-file access is not revoked by a
-- D1 payment change alone. A trusted operator can remove files when revocation
-- of the underlying object is required. No service-role key enters the app.
commit;
