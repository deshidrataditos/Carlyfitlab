-- Carlyfit Lab: narrowly scoped testimonial moderation for explicitly assigned
-- accounts. Apply once as the project database owner, after members.sql.
-- This migration grants no account access. An owner must separately add the
-- verified auth.users UUID to carlyfit_private.testimonial_moderators.
begin;

alter table public.testimonials add column moderated_at timestamptz;

create table carlyfit_private.testimonial_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

-- UUIDs deliberately have no cascading foreign keys: removing a customer or
-- moderator must not erase the record of an administrative status change.
-- The log contains no testimonial body, customer email, or display name.
create table carlyfit_private.testimonial_moderation_audit (
  id bigint generated always as identity primary key,
  moderator_id uuid not null,
  testimonial_id uuid not null,
  old_status text not null check (old_status in ('pending', 'approved', 'rejected')),
  new_status text not null check (new_status in ('approved', 'rejected')),
  moderated_at timestamptz not null default now()
);
create index testimonial_moderation_audit_testimonial_idx
  on carlyfit_private.testimonial_moderation_audit(testimonial_id, moderated_at desc);

alter table carlyfit_private.testimonial_moderators enable row level security;
alter table carlyfit_private.testimonial_moderation_audit enable row level security;
-- No client policies or direct table grants. Only the fixed RPCs below can
-- read the allowlist or make audited, status-only changes.
revoke all on table carlyfit_private.testimonial_moderators,
  carlyfit_private.testimonial_moderation_audit
  from public, anon, authenticated, service_role;
revoke all on sequence carlyfit_private.testimonial_moderation_audit_id_seq
  from public, anon, authenticated, service_role;

create function carlyfit_private.can_moderate_testimonials()
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
      select 1
      from carlyfit_private.testimonial_moderators as m
      join auth.users as u on u.id = m.user_id
      where m.user_id = auth.uid()
        and coalesce(u.is_anonymous, false) = false
    );
$$;
revoke all on function carlyfit_private.can_moderate_testimonials()
  from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.can_moderate_testimonials()
  to authenticated;

create function public.can_moderate_testimonials()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select carlyfit_private.can_moderate_testimonials();
$$;
revoke all on function public.can_moderate_testimonials()
  from public, anon, authenticated, service_role;
grant execute on function public.can_moderate_testimonials() to authenticated;

create function carlyfit_private.list_moderation_testimonials(
  p_status text, p_limit integer, p_offset integer
)
returns table (
  id uuid, display_name text, body text, rating smallint, status text,
  created_at timestamptz, moderated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not carlyfit_private.can_moderate_testimonials() then
    raise exception 'Testimonial moderator permission required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('pending', 'approved', 'rejected')
    or p_limit is null or p_limit < 1 or p_limit > 50
    or p_offset is null or p_offset < 0 then
    raise exception 'Invalid moderation list parameters' using errcode = '22023';
  end if;
  return query
    select t.id, p.display_name, t.body, t.rating, t.status, t.created_at, t.moderated_at
    from public.testimonials as t
    join public.profiles as p on p.id = t.user_id
    where t.status = p_status
    order by t.created_at desc, t.id desc
    limit p_limit offset p_offset;
end;
$$;
revoke all on function carlyfit_private.list_moderation_testimonials(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.list_moderation_testimonials(text, integer, integer)
  to authenticated;

create function public.list_moderation_testimonials(
  p_status text default 'pending', p_limit integer default 20, p_offset integer default 0
)
returns table (
  id uuid, display_name text, body text, rating smallint, status text,
  created_at timestamptz, moderated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.display_name, t.body, t.rating, t.status, t.created_at, t.moderated_at
  from carlyfit_private.list_moderation_testimonials(p_status, p_limit, p_offset) as t;
$$;
revoke all on function public.list_moderation_testimonials(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_moderation_testimonials(text, integer, integer)
  to authenticated;

create function carlyfit_private.moderate_testimonial(
  p_id uuid, p_status text, p_expected_status text
)
returns table (id uuid, status text, moderated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_testimonial public.testimonials%rowtype;
  v_moderated_at timestamptz;
begin
  -- Authorize before inspecting inputs or records, including calls made
  -- directly to the private function with a customer's signed JWT.
  if not carlyfit_private.can_moderate_testimonials() then
    raise exception 'Testimonial moderator permission required' using errcode = '42501';
  end if;
  if p_id is null or p_status is null or p_status not in ('approved', 'rejected')
    or p_expected_status is null
    or p_expected_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid moderation parameters' using errcode = '22023';
  end if;

  -- Serialize simultaneous decisions, then compare the state the moderator
  -- saw. A stale browser cannot silently overwrite a newer decision.
  select t.* into v_testimonial
  from public.testimonials as t where t.id = p_id for update;
  if not found then
    raise exception 'Testimonial not found' using errcode = 'P0002';
  end if;
  if v_testimonial.status <> p_expected_status then
    raise exception 'Testimonial status changed; reload before deciding'
      using errcode = '40001';
  end if;

  -- A repeated choice is a no-op: retain its original date and avoid a
  -- misleading audit entry that suggests another status transition.
  if v_testimonial.status = p_status then
    return query select v_testimonial.id, v_testimonial.status, v_testimonial.moderated_at;
    return;
  end if;

  v_moderated_at := pg_catalog.clock_timestamp();
  update public.testimonials as t
    set status = p_status, moderated_at = v_moderated_at
    where t.id = p_id;
  insert into carlyfit_private.testimonial_moderation_audit
    (moderator_id, testimonial_id, old_status, new_status, moderated_at)
    values (auth.uid(), p_id, v_testimonial.status, p_status, v_moderated_at);
  return query select p_id, p_status, v_moderated_at;
end;
$$;
revoke all on function carlyfit_private.moderate_testimonial(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.moderate_testimonial(uuid, text, text)
  to authenticated;

create function public.moderate_testimonial(
  p_id uuid, p_status text, p_expected_status text
)
returns table (id uuid, status text, moderated_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select t.id, t.status, t.moderated_at
  from carlyfit_private.moderate_testimonial(p_id, p_status, p_expected_status) as t;
$$;
revoke all on function public.moderate_testimonial(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.moderate_testimonial(uuid, text, text) to authenticated;

-- Leave the original customer RLS, column grants, and approved-only public
-- testimonial projection unchanged. Never expose carlyfit_private via the API.
commit;
