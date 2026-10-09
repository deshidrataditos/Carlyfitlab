-- Repair an already-applied 202610080002 without changing management grants
-- or stored data.
-- PUBLIC policies must only call functions executable by anon: PostgreSQL
-- checks permissions during expression initialization, before a CASE branch
-- can exclude the caller. Keep all management/publication RPCs private.
begin;

create or replace function carlyfit_private.store_storage_read_allowed(p_bucket_id text, p_object_path text)
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

create or replace function carlyfit_private.store_storage_insert_allowed(p_bucket_id text)
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

alter policy carlyfit_plans_read_guard on storage.objects
using (carlyfit_private.store_storage_read_allowed(bucket_id, name));
alter policy carlyfit_plans_insert_guard on storage.objects
with check (carlyfit_private.store_storage_insert_allowed(bucket_id));

commit;
