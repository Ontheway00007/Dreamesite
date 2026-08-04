-- Verification harness — Supabase platform stubs
--
-- NOT part of the migration set and never applied to a real project. Supabase
-- provides the `auth` and `storage` schemas, the three API roles, and
-- `auth.uid()`. Plain PostgreSQL does not, so the migrations cannot be applied
-- to a stock image without them.
--
-- These stubs exist so migrations 0001–0009 can be executed against real
-- PostgreSQL to check that they parse, that the constraints and indexes behave
-- as intended, and that the functions do what their comments claim. They
-- reproduce only the surface the migrations touch.
--
-- What this harness does NOT verify: whether Supabase's own RLS enforcement
-- and Storage API behave as expected. Storage policies are exercised here only
-- through the SQL predicate that backs them.

-- --- API roles ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- --- auth schema -------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

/*
  `auth.uid()` reads the subject claim in production. Here it reads a session
  setting, so a test can act as a specific user with:

    set local request.jwt.claim.sub = '<uuid>';

  The signature and return type match, which is what the migrations depend on.
*/
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- --- storage schema ----------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text,
  owner     uuid
);

-- Matches production: Supabase ships storage.objects with RLS on.
alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
