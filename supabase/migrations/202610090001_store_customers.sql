-- Read-only registration directory. Apply as database owner after store_portal.
-- Existing store administrators can view customers; no account receives a new
-- role, and no auth table, token, provider metadata, or password is exposed.
begin;

create function carlyfit_private.list_store_customers(
  p_search text, p_limit integer, p_offset integer
)
returns table (id uuid, display_name text, email text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text;
  v_pattern text;
begin
  if not carlyfit_private.can_manage_store() then
    raise exception 'Store management permission required' using errcode = '42501';
  end if;
  if p_search is null or char_length(p_search) > 100 or p_search ~ '[[:cntrl:]]'
    or p_limit is null or p_limit < 1 or p_limit > 21
    or p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'Invalid customer directory query' using errcode = '22023';
  end if;
  v_search := btrim(p_search);
  -- Treat wildcard characters as literal search text, including direct RPC
  -- callers. Parameters never become SQL identifiers or executable statements.
  v_pattern := '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  return query
    select u.id,
      coalesce(p.display_name, carlyfit_private.initial_display_name(u.raw_user_meta_data)),
      u.email::text, u.created_at
    from auth.users as u
    left join public.profiles as p on p.id = u.id
    where coalesce(u.is_anonymous, false) = false
      and u.deleted_at is null
      and (v_search = ''
        or u.email ilike v_pattern escape E'\\'
        or coalesce(p.display_name, carlyfit_private.initial_display_name(u.raw_user_meta_data)) ilike v_pattern escape E'\\')
    order by u.created_at desc, u.id desc
    limit p_limit offset p_offset;
end;
$$;
revoke all on function carlyfit_private.list_store_customers(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.list_store_customers(text, integer, integer) to authenticated;

create function public.list_store_customers(
  p_search text default '', p_limit integer default 21, p_offset integer default 0
)
returns table (id uuid, display_name text, email text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select id, display_name, email, created_at
  from carlyfit_private.list_store_customers(p_search, p_limit, p_offset);
$$;
revoke all on function public.list_store_customers(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_store_customers(text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
