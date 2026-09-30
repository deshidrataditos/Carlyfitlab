-- Carlyfit Lab: profiles, moderated testimonials and member promotions.
-- Apply once as the project database owner. This migration is atomic and does
-- not change the separate D1 checkout/order tables.
begin;

create schema carlyfit_private;
revoke all on schema carlyfit_private from public, anon, authenticated;
-- USAGE is necessary for the public invoker wrapper below. Keep this schema
-- out of Supabase's exposed schemas; only the named function is executable.
grant usage on schema carlyfit_private to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  email text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 20 and 1500),
  rating smallint not null check (rating between 1 and 5),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create index testimonials_owner_created_idx on public.testimonials(user_id, created_at desc);
create unique index testimonials_one_pending_per_user on public.testimonials(user_id)
  where status = 'pending';
create index testimonials_published_idx on public.testimonials(created_at desc, id desc)
  where status = 'approved';

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  active boolean not null default false,
  constraint promotions_valid_period check (ends_at > starts_at)
);

alter table public.profiles enable row level security;
alter table public.testimonials enable row level security;
alter table public.promotions enable row level security;

-- Revoke the automatic grants present on some Supabase projects before
-- granting precisely the operations used by the customer-facing site.
revoke all on table public.profiles, public.testimonials, public.promotions
  from public, anon, authenticated, service_role;
grant select on public.profiles to authenticated;
grant update (display_name, marketing_opt_in) on public.profiles to authenticated;
grant select on public.testimonials to authenticated;
grant insert (user_id, body, rating) on public.testimonials to authenticated;
grant select on public.promotions to authenticated;
-- Reserved for trusted administration only; never use this role in a browser.
grant select, insert, update, delete on public.profiles, public.testimonials, public.promotions
  to service_role;

create policy profiles_read_own on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  );
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (
    id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  )
  with check (
    id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  );

create policy testimonials_read_own on public.testimonials
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  );
create policy testimonials_submit_own_pending on public.testimonials
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  );
-- Customers cannot update or delete testimonials, including approved ones.
-- Moderation is a trusted dashboard/server action; no role comes from metadata.

create policy promotions_read_current_members on public.promotions
  for select to authenticated
  using (
    (select auth.uid()) is not null
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
    and active
    and starts_at <= now()
    and ends_at > now()
  );

-- Metadata is display text only, never an authorization source. Ignore
-- non-string values, normalize controls, and never expose an email as a name.
create function carlyfit_private.initial_display_name(metadata jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce((
    select name from (
      select ordinal, left(btrim(regexp_replace(
        case when jsonb_typeof(metadata -> field) = 'string'
          then metadata ->> field else '' end,
        '[[:cntrl:]]', ' ', 'g'
      )), 80) as name
      from (values (1, 'full_name'), (2, 'name')) as candidates(ordinal, field)
    ) as names
    where char_length(name) >= 2
    order by ordinal limit 1
  ), 'Cliente Carlyfit');
$$;
revoke all on function carlyfit_private.initial_display_name(jsonb)
  from public, anon, authenticated, service_role;

create function carlyfit_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email, marketing_opt_in, created_at)
  values (
    new.id,
    carlyfit_private.initial_display_name(new.raw_user_meta_data),
    new.email,
    false,
    coalesce(new.created_at, now())
  );
  return new;
end;
$$;
revoke all on function carlyfit_private.handle_new_auth_user()
  from public, anon, authenticated, service_role;
create trigger carlyfit_auth_user_created
  after insert on auth.users
  for each row execute function carlyfit_private.handle_new_auth_user();

-- Email changes must come from Supabase Auth's verified account flow, never
-- from an arbitrary profile patch sent by the customer.
create function carlyfit_private.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;
revoke all on function carlyfit_private.sync_auth_user_email()
  from public, anon, authenticated, service_role;
create trigger carlyfit_auth_user_email_updated
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function carlyfit_private.sync_auth_user_email();

-- Include legitimate users created before this migration; no sample customers.
insert into public.profiles (id, display_name, email, marketing_opt_in, created_at)
select id, carlyfit_private.initial_display_name(raw_user_meta_data), email,
       false, coalesce(created_at, now())
from auth.users
on conflict (id) do nothing;

-- Public output deliberately contains no user ID, email, consent flag, or
-- moderation state. Definer access is isolated in an unexposed schema and
-- restricted to this fixed, approved-only projection; no dynamic SQL.
create function carlyfit_private.list_public_testimonials(p_limit integer)
returns table (id uuid, display_name text, body text, rating smallint, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, p.display_name, t.body, t.rating, t.created_at
  from public.testimonials as t
  join public.profiles as p on p.id = t.user_id
  where t.status = 'approved'
  order by t.created_at desc, t.id desc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;
revoke all on function carlyfit_private.list_public_testimonials(integer)
  from public, anon, authenticated, service_role;
grant execute on function carlyfit_private.list_public_testimonials(integer)
  to anon, authenticated;

create function public.list_public_testimonials(p_limit integer default 12)
returns table (id uuid, display_name text, body text, rating smallint, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select id, display_name, body, rating, created_at
  from carlyfit_private.list_public_testimonials(p_limit);
$$;
revoke all on function public.list_public_testimonials(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_testimonials(integer)
  to anon, authenticated;

commit;
