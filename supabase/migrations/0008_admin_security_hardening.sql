-- Phase 6.1 — Security, transactional integrity and production hardening
--
-- Corrects defects found in review of the Phase 6 admin platform:
--
--   1. admin_users RLS policies recursed into admin_users (error 42P17),
--      which made every admin read fail — login was completely broken.
--   2. SECURITY DEFINER helpers kept PostgreSQL's default PUBLIC EXECUTE
--      grant, so the earlier `revoke ... from anon` had no effect.
--   3. Location saving performed four independent writes with no
--      transaction, so a mid-sequence failure left the private position and
--      the published projection disagreeing with each other.
--   4. audit_log was writable and deletable by any admin, so the audit
--      trail could be rewritten by the people it exists to hold accountable.

-- ======================================================================
-- 1. Authorization helpers
-- ======================================================================
--
-- Both helpers are SECURITY DEFINER so they read `admin_users` with the
-- function owner's privileges, bypassing RLS on that table. That is what
-- breaks the recursion cycle: a policy on admin_users may call these
-- without re-entering its own policy.
--
-- `set search_path = ''` is mandatory for SECURITY DEFINER. Without it a
-- caller could put a malicious schema ahead of `public` on their own
-- search_path and have this function resolve `admin_users` to a table they
-- control — a privilege-escalation path. Every reference below is therefore
-- fully schema-qualified.
--
-- Both are STABLE, so PostgreSQL evaluates them once per statement rather
-- than once per row. That matters: these run inside row-level policies.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
      and is_active
  );
$$;

comment on function public.is_admin() is
  'True when the current user is an active administrator of any role. SECURITY DEFINER with a locked search_path so RLS policies on admin_users can call it without recursing.';

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
      and is_active
      and role = 'super_admin'
  );
$$;

comment on function public.is_super_admin() is
  'True when the current user is an active super administrator. Governs changes to the administrator roster itself.';

-- --- Least privilege on both helpers ---------------------------------
--
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, and PUBLIC is
-- inherited by every role including anon. Revoking from `anon` alone — as
-- migration 0006 did — therefore changed nothing. The grant must be removed
-- from PUBLIC and then handed back only to the roles that need it.

revoke all on function public.is_admin() from public;
revoke all on function public.is_super_admin() from public;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- `anon` is deliberately not granted execute. Anonymous visitors have no
-- admin-gated policies to satisfy, so they never need to ask.

-- ======================================================================
-- 2. admin_users — replace the recursive policies
-- ======================================================================
--
-- The originals read:
--
--   using (exists (select 1 from public.admin_users au where ...))
--
-- Evaluating that SELECT re-triggers the very policy being evaluated.
-- PostgreSQL detects the cycle and aborts the statement with 42P17, so
-- `requireAdmin()` could never load an administrator record.

drop policy if exists "admins can read admin roster" on public.admin_users;
drop policy if exists "super admins can manage admin roster" on public.admin_users;

-- Any active administrator may read the roster.
create policy "admins read roster"
  on public.admin_users for select
  to authenticated
  using (public.is_admin());

-- Only super administrators may change it. Split per command so the intent
-- of each is auditable, and so a future change to one cannot silently widen
-- the others.
create policy "super admins insert roster"
  on public.admin_users for insert
  to authenticated
  with check (public.is_super_admin());

create policy "super admins update roster"
  on public.admin_users for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "super admins delete roster"
  on public.admin_users for delete
  to authenticated
  using (public.is_super_admin());

-- Guard against a super administrator removing their own access and
-- leaving the installation with no way back in.
create or replace function public.prevent_self_admin_removal()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.user_id = (select auth.uid()) then
    if tg_op = 'DELETE' then
      raise exception 'You cannot remove your own administrator access.'
        using errcode = 'check_violation';
    end if;

    if tg_op = 'UPDATE'
       and (new.is_active is distinct from old.is_active
            or new.role is distinct from old.role) then
      raise exception 'You cannot change your own administrator role or status.'
        using errcode = 'check_violation';
    end if;
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

comment on function public.prevent_self_admin_removal() is
  'Stops an administrator demoting or deleting themselves, which could lock everyone out of the installation.';

create trigger prevent_self_admin_removal
  before update or delete on public.admin_users
  for each row execute function public.prevent_self_admin_removal();

revoke all on function public.prevent_self_admin_removal() from public;

-- ======================================================================
-- 3. audit_log — genuinely append-only
-- ======================================================================
--
-- Migration 0007 granted `select, insert`, but never revoked update or
-- delete, and PostgREST is happy to issue either. An audit trail the
-- audited party can edit is not an audit trail.

revoke update, delete, truncate on public.audit_log from authenticated;
revoke update, delete, truncate on public.audit_log from anon;

-- Defence in depth: even if a later migration re-grants those privileges by
-- accident, the table itself refuses the write.
create or replace function public.audit_log_is_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only: % is not permitted.', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

comment on function public.audit_log_is_append_only() is
  'Refuses any UPDATE, DELETE or TRUNCATE on audit_log. Belt and braces alongside the revoked grants.';

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_is_append_only();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_is_append_only();

revoke all on function public.audit_log_is_append_only() from public;

-- Retention and deletion remain possible for the service role, which
-- bypasses both RLS and these triggers only by explicitly disabling them.
-- That is deliberate: purging on a retention schedule is an operational
-- act, not something an admin session should be able to do.

-- ======================================================================
-- 4. Atomic location save
-- ======================================================================
--
-- Saving a location touches three tables plus the audit trail. Performed as
-- separate statements, a failure partway through leaves the stored position
-- updated while the published projection still reflects the previous
-- privacy settings — the exact class of inconsistency that leaks a location
-- the owner asked to have generalised.
--
-- A PL/pgSQL function body runs inside a single transaction, so every write
-- below commits together or not at all.
--
-- The privacy algorithm itself stays in TypeScript
-- (`src/lib/properties/privacy.ts`). This function does not recompute it —
-- the caller passes the already-derived projection in. Duplicating the
-- algorithm in SQL would create a second definition of "what may be
-- published", and the two would eventually disagree.
--
-- SECURITY INVOKER (the default) is deliberate: RLS still applies, so this
-- function grants no privilege the caller did not already have. The explicit
-- admin check below only exists to fail with a readable message instead of
-- an opaque policy violation.

create or replace function public.save_property_location(
  p_property_id uuid,
  -- Stored position and address parts
  p_private_latitude double precision,
  p_private_longitude double precision,
  p_house_number text,
  p_street text,
  p_postcode text,
  -- Privacy configuration
  p_location_visibility text,
  p_privacy_radius_meters integer,
  p_public_marker_mode text,
  p_manual_public_latitude double precision,
  p_manual_public_longitude double precision,
  p_suburb_reference text,
  p_show_house_number boolean,
  p_show_street boolean,
  p_show_suburb boolean,
  p_show_postcode boolean,
  p_allow_directions boolean,
  -- Projection, already derived by the TypeScript privacy pipeline
  p_public_latitude double precision,
  p_public_longitude double precision,
  p_public_address text,
  p_marker_mode text,
  p_location_label text,
  p_accuracy_note text,
  p_public_allow_directions boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.properties where id = p_property_id
  ) then
    raise exception 'That property no longer exists.'
      using errcode = 'no_data_found';
  end if;

  insert into public.property_private_locations (
    property_id, private_latitude, private_longitude,
    house_number, street, postcode
  )
  values (
    p_property_id, p_private_latitude, p_private_longitude,
    p_house_number, p_street, p_postcode
  )
  on conflict (property_id) do update set
    private_latitude  = excluded.private_latitude,
    private_longitude = excluded.private_longitude,
    house_number      = excluded.house_number,
    street            = excluded.street,
    postcode          = excluded.postcode;

  insert into public.property_location_settings (
    property_id, location_visibility, privacy_radius_meters,
    public_marker_mode, manual_public_latitude, manual_public_longitude,
    suburb_reference, show_house_number, show_street, show_suburb,
    show_postcode, allow_directions
  )
  values (
    p_property_id, p_location_visibility, p_privacy_radius_meters,
    p_public_marker_mode, p_manual_public_latitude, p_manual_public_longitude,
    p_suburb_reference, p_show_house_number, p_show_street, p_show_suburb,
    p_show_postcode, p_allow_directions
  )
  on conflict (property_id) do update set
    location_visibility     = excluded.location_visibility,
    privacy_radius_meters   = excluded.privacy_radius_meters,
    public_marker_mode      = excluded.public_marker_mode,
    manual_public_latitude  = excluded.manual_public_latitude,
    manual_public_longitude = excluded.manual_public_longitude,
    suburb_reference        = excluded.suburb_reference,
    show_house_number       = excluded.show_house_number,
    show_street             = excluded.show_street,
    show_suburb             = excluded.show_suburb,
    show_postcode           = excluded.show_postcode,
    allow_directions        = excluded.allow_directions;

  insert into public.property_public_locations (
    property_id, location_visibility, public_latitude, public_longitude,
    public_address, marker_mode, location_label, accuracy_note,
    allow_directions, generated_at
  )
  values (
    p_property_id, p_location_visibility, p_public_latitude, p_public_longitude,
    p_public_address, p_marker_mode, p_location_label, p_accuracy_note,
    coalesce(p_public_allow_directions, false), now()
  )
  on conflict (property_id) do update set
    location_visibility = excluded.location_visibility,
    public_latitude     = excluded.public_latitude,
    public_longitude    = excluded.public_longitude,
    public_address      = excluded.public_address,
    marker_mode         = excluded.marker_mode,
    location_label      = excluded.location_label,
    accuracy_note       = excluded.accuracy_note,
    allow_directions    = excluded.allow_directions,
    generated_at        = excluded.generated_at;

  -- Inside the same transaction, so the trail cannot record a save that
  -- was subsequently rolled back.
  insert into public.audit_log (user_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'updated',
    'property_location',
    p_property_id,
    jsonb_build_object(
      'location_visibility', p_location_visibility,
      'public_marker_mode', p_public_marker_mode,
      'has_public_coordinate', p_public_latitude is not null
    )
  );
end;
$$;

comment on function public.save_property_location is
  'Writes the stored position, the privacy settings, the derived public projection and the audit entry in one transaction. The projection is supplied by the caller — the privacy algorithm lives in TypeScript and is never duplicated here.';

revoke all on function public.save_property_location from public;
grant execute on function public.save_property_location to authenticated;

-- ======================================================================
-- 5. Publish readiness
-- ======================================================================
--
-- Publishing is the moment a property becomes visible to the public, so it
-- is the right place to insist the record is complete. Returning the reasons
-- rather than a bare boolean lets the admin UI list exactly what is missing.

create or replace function public.property_publish_blockers(p_property_id uuid)
returns text[]
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  v_property public.properties;
  v_blockers text[] := array[]::text[];
begin
  select * into v_property
  from public.properties
  where id = p_property_id;

  if not found then
    return array['That property no longer exists.'];
  end if;

  if coalesce(btrim(v_property.name), '') = '' then
    v_blockers := v_blockers || 'Add a name.';
  end if;

  if coalesce(btrim(v_property.summary), '') = '' then
    v_blockers := v_blockers || 'Add a summary.';
  end if;

  if coalesce(btrim(v_property.slug), '') = '' then
    v_blockers := v_blockers || 'Add a URL slug.';
  end if;

  if coalesce(btrim(v_property.suburb), '') = '' then
    v_blockers := v_blockers || 'Add a suburb.';
  end if;

  if coalesce(btrim(v_property.state), '') = '' then
    v_blockers := v_blockers || 'Add a state.';
  end if;

  if not exists (
    select 1 from public.property_location_settings
    where property_id = p_property_id
  ) then
    v_blockers := v_blockers ||
      'Choose the location privacy settings on the Location tab.';
  end if;

  -- Without a projection row the public map and property page have no
  -- location to read at all, not even a "hidden" one.
  if not exists (
    select 1 from public.property_public_locations
    where property_id = p_property_id
  ) then
    v_blockers := v_blockers ||
      'Save the Location tab so the public location is generated.';
  end if;

  return v_blockers;
end;
$$;

comment on function public.property_publish_blockers(uuid) is
  'Returns the human-readable reasons a property cannot be published yet. Empty array means it is ready.';

revoke all on function public.property_publish_blockers(uuid) from public;
grant execute on function public.property_publish_blockers(uuid) to authenticated;

-- ======================================================================
-- 6. Retire the ineffective revoke from 0006
-- ======================================================================
-- Recorded for the reader: migration 0006 attempted
--   revoke execute on function public.is_admin() from anon;
-- which was a no-op because EXECUTE was held via PUBLIC, not via anon.
-- Section 1 above revokes from PUBLIC, which is what actually closes it.
