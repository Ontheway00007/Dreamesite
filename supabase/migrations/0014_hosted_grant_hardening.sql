-- Phase 6.4 — Grant hardening for hosted Supabase
--
-- Closes a hole that the local verification harness could not see, found by
-- introspecting the first real hosted project.
--
-- ## What was wrong
--
-- A Supabase project ships with default privileges on the `public` schema:
--
--   alter default privileges in schema public
--     grant all on tables to anon, authenticated, service_role;
--   alter default privileges in schema public
--     grant all on functions to anon, authenticated, service_role;
--
-- So every table and function created by a migration is granted ALL to `anon`
-- and `authenticated` the moment it exists. Migration 0003 revoked and re-granted
-- deliberately, but it could only cover the tables that existed in Phase 5.
-- Everything added afterwards inherited the default instead:
--
--   admin_users    anon had SELECT, INSERT, UPDATE, DELETE, TRUNCATE
--   audit_log      anon had SELECT, INSERT
--   site_settings  anon had SELECT, INSERT, UPDATE, DELETE, TRUNCATE
--   authenticated  had TRUNCATE on every table
--
-- Row level security stopped the reads and writes — none of those tables has an
-- `anon` policy, so PostgREST returned nothing and refused every write. The
-- defence in depth held, which is why nothing was observably broken.
--
-- It is still wrong, for two reasons. TRUNCATE is a table-level privilege that
-- RLS does not filter: a role holding it can empty the table regardless of any
-- policy, so `anon` holding TRUNCATE on `admin_users` was one exposed code path
-- away from being an outage. And the documented model says these roles have no
-- grant on these tables at all; a model that is only true in the harness is not
-- a model.
--
-- ## Why the harness missed it
--
-- `supabase/verify/00_supabase_stubs.sql` creates bare `anon` and
-- `authenticated` roles with no default privileges, because plain PostgreSQL has
-- none. Every grant in the harness is therefore one a migration wrote
-- explicitly, and the suites correctly reported the intended model. The stub
-- file already warns that it does not reproduce the platform; this is what that
-- warning looks like in practice.
--
-- ## The two-part fix
--
-- 1. State the intended grant for every table and function explicitly, revoking
--    first so the result does not depend on what came before.
-- 2. Change the default privileges, so the next migration that adds a table does
--    not silently reintroduce this. Deny by default is the point; a table should
--    be unreachable until a migration says otherwise.

-- ======================================================================
-- 1. Stop the defaults from granting anything further
-- ======================================================================
--
-- `for role postgres` matters: default privileges are recorded per granting
-- role, and migrations run as `postgres`. Without it this would only affect
-- objects created by the role executing this statement.
--
-- service_role is left alone. It is the platform's own bypass identity, it never
-- reaches this application (no module reads the key), and narrowing it would
-- break the dashboard's own table editor.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- ======================================================================
-- 2. Tables — revoke everything, then grant the intended set
-- ======================================================================

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

-- --- Public catalogue: anonymous read ---------------------------------
grant select on public.properties                to anon, authenticated;
grant select on public.property_public_locations to anon, authenticated;
grant select on public.suburb_references         to anon, authenticated;
grant select on public.property_images           to anon, authenticated;
grant select on public.property_features         to anon, authenticated;
grant select on public.construction_updates      to anon, authenticated;
grant select on public.property_resources        to anon, authenticated;
grant select on public.property_testimonials     to anon, authenticated;

-- The public projection of site settings. The base table stays admin-only.
grant select on public.site_settings_public      to anon, authenticated;

-- --- Enquiries: anyone may submit, only staff may read ----------------
grant insert on public.enquiries to anon, authenticated;
grant select, update on public.enquiries to authenticated;
-- No DELETE, for anyone: enquiries are archived, never destroyed.

-- --- Administrator write access ---------------------------------------
--
-- RLS still decides who among the authenticated may actually do these; the
-- grant only decides which verbs are reachable at all.
grant insert, update, delete on public.properties            to authenticated;
grant insert, update, delete on public.suburb_references      to authenticated;
grant insert, update, delete on public.property_images        to authenticated;
grant insert, update, delete on public.property_features      to authenticated;
grant insert, update, delete on public.construction_updates   to authenticated;
grant insert, update, delete on public.property_resources     to authenticated;
grant insert, update, delete on public.property_testimonials  to authenticated;

-- --- Location tables: read-only, writable only through the RPCs -------
--
-- 0012 made these function-write-only. The functions are SECURITY DEFINER, so
-- they do not need the caller to hold the write privilege — that is the point.
grant select on public.property_private_locations to authenticated;
grant select on public.property_location_settings to authenticated;
-- property_public_locations already granted SELECT above, to anon as well.

-- --- Administration -------------------------------------------------
grant select, insert, update, delete on public.admin_users to authenticated;
grant select, insert on public.audit_log to authenticated;   -- append-only
grant select on public.admin_login_attempts to authenticated;
grant select, insert, update on public.site_settings to authenticated;

-- `anon` deliberately receives nothing on: property_private_locations,
-- property_location_settings, admin_users, audit_log, admin_login_attempts,
-- site_settings. Enumerated here so the omission reads as a decision.

-- ======================================================================
-- 3. Functions — nothing for anon except the two pre-authentication ones
-- ======================================================================
--
-- Done dynamically rather than as a list, so a function added by a later
-- migration that forgets its own revoke is still covered when this is re-run,
-- and so nothing is missed today.
--
-- Extension-owned functions (pgcrypto) are excluded: they belong to the
-- extension, not to this schema, and revoking from them is not ours to do.

do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    -- PUBLIC first. CREATE FUNCTION grants EXECUTE to PUBLIC by default, and
    -- every role inherits it, so revoking from a named role alone changes
    -- nothing while the PUBLIC grant stands. This is the same mistake
    -- migration 0006 made and 0008 corrected for two functions; here it is
    -- corrected for all of them.
    execute format('revoke all on function %s from public', v_function.signature);
    execute format('revoke all on function %s from anon', v_function.signature);
    -- `authenticated` too, and re-granted explicitly below. Without this, the
    -- platform default leaves every function callable by any signed-in user,
    -- including `lock_group_internal`, which is meant to be reachable only from
    -- SECURITY DEFINER code and is granted to nobody. Suite 05 asserts exactly
    -- that, and caught it.
    execute format('revoke all on function %s from authenticated', v_function.signature);
  end loop;
end $$;

-- A failed login is unauthenticated by definition, so these two must be
-- callable before a session exists. They are the only ones.
grant execute on function public.record_login_attempt(text, text, boolean, text)
  to anon, authenticated;
grant execute on function public.check_login_throttle(text, text)
  to anon, authenticated;

-- Re-grant the administrator-facing RPCs to `authenticated`. Each one checks
-- `is_admin()` in its own body, so being callable is not being permitted.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.property_lock_key(uuid) to authenticated;
grant execute on function public.lock_property(uuid) to authenticated;
grant execute on function public.lock_admin_roster() to authenticated;
grant execute on function public.lock_group(text, uuid, text) to authenticated;
grant execute on function public.group_lock_key(text, uuid, text) to authenticated;
grant execute on function public.is_valid_property_media_path(text) to authenticated;
grant execute on function public.property_publish_blockers(uuid) to authenticated;
grant execute on function public.publish_property_if_ready(uuid) to authenticated;
grant execute on function public.count_publish_blocked_properties() to authenticated;
grant execute on function public.clear_property_location(uuid) to authenticated;
grant execute on function public.set_property_hero_image(uuid, uuid) to authenticated;
grant execute on function public.reorder_property_images(uuid, text, uuid[]) to authenticated;
grant execute on function public.reorder_property_resources(uuid, text, uuid[]) to authenticated;
grant execute on function public.reorder_construction_updates(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_property_features(uuid, text, uuid[]) to authenticated;
grant execute on function public.purge_login_attempts(integer) to authenticated;
grant execute on function public.save_regenerated_public_location(
  uuid, timestamptz, timestamptz, timestamptz, text,
  double precision, double precision, text, text, text, text, boolean
) to authenticated;
grant execute on function public.save_property_location(
  uuid, timestamptz, double precision, double precision, text, text, text,
  text, integer, text, double precision, double precision, text,
  boolean, boolean, boolean, boolean, boolean,
  double precision, double precision, text, text, text, text, boolean
) to authenticated;

-- Trigger functions are reachable only from the trigger engine, which does not
-- consult EXECUTE. Granted to nobody, so they cannot be invoked as RPCs:
--
--   set_updated_at, prevent_self_admin_removal, prevent_last_super_admin_removal,
--   audit_log_is_append_only, flag_stale_public_location,
--   serialise_group_mutation, lock_group_internal
--
-- The loop above already revoked them; they are simply not re-granted.

-- ======================================================================
-- 4. set_updated_at — pin the search_path
-- ======================================================================
--
-- Flagged by Supabase's own linter. It is SECURITY INVOKER, so the risk is far
-- smaller than for a definer function, but a trigger function with a mutable
-- search_path resolves `now()` against whatever the writing session put first.
-- Pinned for the same reason every other function here is.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Keeps updated_at honest for editors. Attached to every editable table. search_path pinned and EXECUTE granted to nobody: it runs from the trigger engine, which does not consult either.';

revoke all on function public.set_updated_at() from public;

-- ======================================================================
-- 5. Sequences
-- ======================================================================
--
-- There are none today: every primary key is a uuid with a
-- `gen_random_uuid()` default. Revoked anyway so that adding one later does not
-- quietly hand `anon` the ability to advance it.

revoke all on all sequences in schema public from anon;
revoke all on all sequences in schema public from authenticated;
