-- ======================================================================
-- 0012  Phase 6.3.2 — integrity: RPC-only locations, group locks, audit
-- ======================================================================
--
-- Additive. Nothing earlier is edited; every change is a new object or a
-- `create or replace` of an existing one, so this applies to a database already
-- carrying 0001–0011.
--
-- Six problems, one of them a regression introduced by 0011.
--
-- 1. **Location writes could bypass every guarantee.** Administrators held
--    direct INSERT/UPDATE/DELETE on the three location tables, so ordinary
--    PostgREST CRUD skipped the property lock, the three-table atomicity, the
--    projection derivation, the audit entry and the automatic unpublish.
--
-- 2. **The projection generator could restore stale public data.** It read,
--    computed, then upserted with the service role and no version check.
--
-- 3. **Group mutations were not serialised with reordering.** A create, delete
--    or category change could interleave with a reorder.
--
-- 4. **The hero audit entry was lost.** 0009 wrote a `hero_set` row inside
--    `set_property_hero_image`; the 0011 replacement dropped it, and the Server
--    Action still assumed the RPC was writing it. Hero promotions since 0011
--    have gone unrecorded.
--
-- 5. **Location saves used unversioned property data.** The projection is built
--    in TypeScript from the property's suburb, state and name, read before the
--    RPC takes the lock.
--
-- 6. **Lock helpers were open to any authenticated user**, and
--    `clear_property_location` audited property ids that did not exist.


-- ======================================================================
-- 1. Locks: keys, guarded helpers, and an unguarded internal one
-- ======================================================================
--
-- Three kinds of function here, and the distinction is the security boundary.
--
-- *Key functions* are pure hashes. They confer nothing — knowing a lock key
-- does not let you take the lock — so they stay executable by `authenticated`,
-- which the SECURITY INVOKER callers below require.
--
-- *Guarded lock helpers* actually take locks, and holding a lock is something a
-- hostile authenticated account could abuse to stall administrators. Each now
-- refuses a non-administrator. This is the smallest change that closes it: the
-- alternative, moving them to a private schema, would force every caller to
-- become SECURITY DEFINER and lose RLS as defence in depth.
--
-- *The internal helper* is used by the trigger in section 3 and is deliberately
-- not admin-guarded, because a trigger's job is serialisation, not
-- authorization — the table's own RLS policy has already decided who may write.
-- It is revoked from everyone; the trigger reaches it by being SECURITY DEFINER.

/** Namespaced 64-bit key. `md5` because it is documented and stable. */
create or replace function public.group_lock_key(
  p_class text,
  p_property_id uuid,
  p_group text
)
returns bigint
language sql
immutable
security invoker
set search_path = ''
as $$
  select ('x' || pg_catalog.substr(
    pg_catalog.md5(
      'dreame.' || p_class || ':' || p_property_id::text || ':' || coalesce(p_group, '')
    ), 1, 16
  ))::bit(64)::bigint;
$$;

comment on function public.group_lock_key(text, uuid, text) is
  'Deterministic advisory-lock key for one ordered group. Pure: knowing the key does not permit taking the lock.';

revoke all on function public.group_lock_key(text, uuid, text) from public;
grant execute on function public.group_lock_key(text, uuid, text) to authenticated;

/**
 * Takes the group lock. Not admin-guarded, and granted to nobody.
 *
 * Exists so the trigger in section 3 can serialise every mutation of an ordered
 * group without depending on who is making it. Reachable only from SECURITY
 * DEFINER code owned by the migration role.
 */
create or replace function public.lock_group_internal(
  p_class text,
  p_property_id uuid,
  p_group text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    public.group_lock_key(p_class, p_property_id, p_group)
  );
$$;

comment on function public.lock_group_internal(text, uuid, text) is
  'Takes an ordered-group advisory lock with no authorization check. Granted to nobody: for SECURITY DEFINER callers only.';

revoke all on function public.lock_group_internal(text, uuid, text) from public;

/** The administrator-facing group lock, used by the reorder functions. */
create or replace function public.lock_group(
  p_class text,
  p_property_id uuid,
  p_group text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.group_lock_key(p_class, p_property_id, p_group)
  );
end;
$$;

comment on function public.lock_group(text, uuid, text) is
  'Takes an ordered-group advisory lock. Refuses non-administrators, so a hostile authenticated account cannot hold locks to stall the admin interface.';

revoke all on function public.lock_group(text, uuid, text) from public;
grant execute on function public.lock_group(text, uuid, text) to authenticated;

-- The two locks from 0011 gain the same guard. Bodies are otherwise unchanged.

create or replace function public.lock_property(p_property_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.property_lock_key(p_property_id)
  );
end;
$$;

comment on function public.lock_property(uuid) is
  'Takes the transaction-scoped advisory lock for one property. Required by every write affecting publish readiness, and always acquired before any row lock. Refuses non-administrators.';

revoke all on function public.lock_property(uuid) from public;
grant execute on function public.lock_property(uuid) to authenticated;

create or replace function public.lock_admin_roster()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- The roster guard trigger reaches this while an administrator is editing the
  -- roster, so `is_admin()` is true on every legitimate path.
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    ('x' || pg_catalog.substr(pg_catalog.md5('dreame.admin_roster'), 1, 16))::bit(64)::bigint
  );
end;
$$;

comment on function public.lock_admin_roster() is
  'Takes the single transaction-scoped advisory lock guarding the active super administrator count. Intentionally global: the invariant is table-wide. Refuses non-administrators.';

revoke all on function public.lock_admin_roster() from public;
grant execute on function public.lock_admin_roster() to authenticated;


-- ======================================================================
-- 2. Location writes happen only through functions
-- ======================================================================
--
-- The three location tables carried admin INSERT/UPDATE/DELETE policies and
-- table-level grants, which meant `supabase.from('property_location_settings')
-- .update(...)` was a legal way to change a property's privacy — bypassing the
-- property lock, the atomic three-table write, the derived projection, the audit
-- entry, and the unpublish that has to follow removal.
--
-- Nothing in the application did that. But the reason nothing did was
-- convention, and a policy is not a convention.
--
-- SELECT stays. The admin location tab reads all three tables, and reading them
-- is what the existing admin-only SELECT policies are for.
--
-- Removing the write grants means the writing functions can no longer be
-- SECURITY INVOKER — an invoker function has exactly the caller's privileges,
-- and the caller now has none. They become SECURITY DEFINER, which is the point:
-- the function *is* the privilege. Each one checks `is_admin()` before doing
-- anything, and each pins `search_path` so a caller cannot redirect the tables
-- it writes.

drop policy if exists "admins can insert private locations" on public.property_private_locations;
drop policy if exists "admins can update private locations" on public.property_private_locations;
drop policy if exists "admins can delete private locations" on public.property_private_locations;

drop policy if exists "admins can insert location settings" on public.property_location_settings;
drop policy if exists "admins can update location settings" on public.property_location_settings;
drop policy if exists "admins can delete location settings" on public.property_location_settings;

drop policy if exists "admins can insert public locations" on public.property_public_locations;
drop policy if exists "admins can update public locations" on public.property_public_locations;
drop policy if exists "admins can delete public locations" on public.property_public_locations;

revoke insert, update, delete on public.property_private_locations from authenticated;
revoke insert, update, delete on public.property_location_settings from authenticated;
revoke insert, update, delete on public.property_public_locations from authenticated;

-- Belt and braces: `anon` never had these, and must not acquire them.
revoke all on public.property_private_locations from anon;
revoke all on public.property_location_settings from anon;
revoke insert, update, delete on public.property_public_locations from anon;

comment on table public.property_private_locations is
  'Exact stored position and address parts. Never exposed publicly. Writable only through save_property_location and clear_property_location — direct INSERT, UPDATE and DELETE are revoked.';
comment on table public.property_location_settings is
  'Per-property privacy configuration. Writable only through save_property_location and clear_property_location.';
comment on table public.property_public_locations is
  'Derived public projection. Publicly readable for published properties. Writable only through save_property_location, clear_property_location and save_regenerated_public_location.';


-- ======================================================================
-- 3. Staleness: a projection built from property data that has since changed
-- ======================================================================
--
-- The projection embeds the property's suburb and state — a suburb-only marker
-- is *derived from* `properties.suburb`. Change the suburb and the stored
-- projection now points at the previous one. That is wrong public data: not a
-- privacy leak, because the coordinate is still the privacy-correct one, but a
-- marker in the wrong place.
--
-- Recomputing the projection from inside a trigger is not possible: the privacy
-- algorithm lives in TypeScript and is deliberately not duplicated in SQL. So
-- the trigger records that the projection is out of date and the admin surfaces
-- it. Saving the location again clears it.
--
-- Deliberately does not block publishing. The failure is a stale label, and
-- making an administrator unable to publish because they renamed a property
-- would be disproportionate. It appears in the admin instead, where it can be
-- acted on.

alter table public.property_public_locations
  add column if not exists stale_since timestamptz;

comment on column public.property_public_locations.stale_since is
  'Set when a property field the projection derives from changed after this row was generated. Cleared by saving the location again. Null means the projection matches the property.';

create or replace function public.flag_stale_public_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the fields the projection actually reads.
  if new.suburb is distinct from old.suburb
     or new.state is distinct from old.state
     or new.name is distinct from old.name
  then
    update public.property_public_locations
    set stale_since = now()
    where property_id = new.id
      and stale_since is null;
  end if;

  return new;
end;
$$;

comment on function public.flag_stale_public_location() is
  'Marks a property''s public projection stale when the suburb, state or name it was derived from changes. SECURITY DEFINER because the location tables are no longer writable by the administrator making the property edit.';

revoke all on function public.flag_stale_public_location() from public;

drop trigger if exists flag_stale_public_location on public.properties;

create trigger flag_stale_public_location
  after update of suburb, state, name on public.properties
  for each row execute function public.flag_stale_public_location();


-- ======================================================================
-- 4. save_property_location — version-checked, and the only way in
-- ======================================================================
--
-- Two changes beyond becoming SECURITY DEFINER.
--
-- **A version check.** The caller derives the projection in TypeScript from the
-- property's suburb, state and name, read before this function takes the lock.
-- Another administrator can change any of them in between, and the projection
-- would be written from data that no longer exists. The caller now passes the
-- `updated_at` it read; if the row has moved on, nothing is written and the
-- administrator is told to reload.
--
-- Passing `null` skips the check, which is what the bulk regeneration path and
-- the verification harness use — both derive from data they read under no
-- assumption of freshness.
--
-- **Clearing staleness.** A successful save is by definition a projection
-- derived from current property data, so `stale_since` goes back to null.
--
-- The old 24-argument signature is dropped rather than left as an overload: two
-- versions of a function that writes location data is exactly the ambiguity this
-- migration exists to remove.

drop function if exists public.save_property_location(
  uuid, double precision, double precision, text, text, text,
  text, integer, text, double precision, double precision, text,
  boolean, boolean, boolean, boolean, boolean,
  double precision, double precision, text, text, text, text, boolean
);

create or replace function public.save_property_location(
  p_property_id uuid,
  -- Optimistic concurrency: the `properties.updated_at` the caller derived the
  -- projection from. Null skips the check.
  p_expected_property_updated_at timestamptz,
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
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_updated_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Before touching either location table, so a concurrent publish waits
  -- rather than reading a half-written state.
  perform public.lock_property(p_property_id);

  select updated_at into v_updated_at
  from public.properties
  where id = p_property_id
  for update;

  if not found then
    raise exception 'That property no longer exists.'
      using errcode = 'no_data_found';
  end if;

  -- The projection was derived from the property row. If the row has changed,
  -- the derivation is void — the suburb it used may no longer be the suburb.
  if p_expected_property_updated_at is not null
     and v_updated_at is distinct from p_expected_property_updated_at
  then
    raise exception
      'This property changed while you were editing its location. Reload and try again.'
      using errcode = 'PT409';
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
    allow_directions, generated_at, stale_since
  )
  values (
    p_property_id, p_location_visibility, p_public_latitude, p_public_longitude,
    p_public_address, p_marker_mode, p_location_label, p_accuracy_note,
    coalesce(p_public_allow_directions, false), now(), null
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
    generated_at        = excluded.generated_at,
    -- Freshly derived from current property data.
    stale_since         = null;

  insert into public.audit_log (user_id, action, entity_type, entity_id, metadata)
  values (
    v_actor, 'updated', 'property_location', p_property_id,
    jsonb_build_object(
      'location_visibility', p_location_visibility,
      'public_marker_mode', p_public_marker_mode,
      'has_public_coordinate', p_public_latitude is not null
    )
  );
end;
$$;

comment on function public.save_property_location is
  'Writes the stored position, the privacy settings, the derived public projection and the audit entry in one transaction, under the property advisory lock. Refuses with PT409 when the property changed after the caller derived the projection. SECURITY DEFINER because direct writes to the location tables are revoked — this function is the privilege.';

revoke all on function public.save_property_location from public;
grant execute on function public.save_property_location to authenticated;


-- ======================================================================
-- 5. clear_property_location — existence checked before anything is recorded
-- ======================================================================
--
-- The 0011 version deleted, unpublished and audited without checking the
-- property existed. Called with an id that was never real, it wrote an audit
-- entry describing the removal of a location from a property that had none.
-- The audit trail is append-only, so that entry could never be corrected.

create or replace function public.clear_property_location(p_property_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.lock_property(p_property_id);

  -- Under the lock, so the answer cannot change before the deletes below.
  if not exists (
    select 1 from public.properties where id = p_property_id
  ) then
    raise exception 'That property no longer exists.'
      using errcode = 'no_data_found';
  end if;

  -- The projection first, then the settings, then the stored position: the
  -- reverse of the order they are written in, so no intermediate state has a
  -- projection without the settings that justify it.
  delete from public.property_public_locations where property_id = p_property_id;
  delete from public.property_location_settings where property_id = p_property_id;
  delete from public.property_private_locations where property_id = p_property_id;

  -- A property with no location cannot be published, so clearing one is also
  -- an unpublish. Doing it here means the two can never disagree.
  update public.properties
  set is_published = false
  where id = p_property_id
    and is_published;

  insert into public.audit_log (user_id, action, entity_type, entity_id, metadata)
  values (
    v_actor, 'deleted', 'property_location', p_property_id,
    jsonb_build_object('unpublished', true)
  );
end;
$$;

comment on function public.clear_property_location(uuid) is
  'Removes a property''s stored position, privacy settings and public projection under the property advisory lock, and unpublishes the property. Refuses a property that does not exist, so no audit entry describes a removal that never happened.';

revoke all on function public.clear_property_location(uuid) from public;
grant execute on function public.clear_property_location(uuid) to authenticated;


-- ======================================================================
-- 6. Regenerating a projection without restoring stale data
-- ======================================================================
--
-- The old generator read the property, the private location and the settings,
-- computed the projection in TypeScript, then upserted with the service role. A
-- location save committing between the read and the write was silently undone —
-- and the direction of that failure is the worst one available: a privacy
-- setting changed to `hidden` could have its previous public coordinate
-- restored.
--
-- This function is the replacement. The caller passes the `updated_at` of all
-- three rows it derived from; if any has moved, nothing is written and PT409
-- says so. The caller re-reads, recomputes and retries.
--
-- The privacy algorithm stays in TypeScript. This function writes what it is
-- given and verifies it was derived from data that is still current — it does
-- not decide anything about privacy.
--
-- Only the projection is written. Regeneration must never alter the stored
-- position or the settings, which are the administrator's input rather than
-- derived output.

create or replace function public.save_regenerated_public_location(
  p_property_id uuid,
  p_expected_property_updated_at timestamptz,
  p_expected_private_updated_at timestamptz,
  p_expected_settings_updated_at timestamptz,
  p_location_visibility text,
  p_public_latitude double precision,
  p_public_longitude double precision,
  p_public_address text,
  p_marker_mode text,
  p_location_label text,
  p_accuracy_note text,
  p_allow_directions boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_property_updated_at timestamptz;
  v_private_updated_at timestamptz;
  v_settings_updated_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.lock_property(p_property_id);

  select updated_at into v_property_updated_at
  from public.properties where id = p_property_id;

  if not found then
    raise exception 'That property no longer exists.'
      using errcode = 'no_data_found';
  end if;

  select updated_at into v_private_updated_at
  from public.property_private_locations where property_id = p_property_id;

  select updated_at into v_settings_updated_at
  from public.property_location_settings where property_id = p_property_id;

  -- All three, because the projection is a function of all three. `is distinct
  -- from` rather than `<>` so a row that has since been deleted — null here,
  -- non-null in the expectation — is caught rather than compared away.
  if v_property_updated_at is distinct from p_expected_property_updated_at
     or v_private_updated_at is distinct from p_expected_private_updated_at
     or v_settings_updated_at is distinct from p_expected_settings_updated_at
  then
    raise exception
      'This property''s location changed while the projection was being regenerated. Nothing was written.'
      using errcode = 'PT409';
  end if;

  insert into public.property_public_locations (
    property_id, location_visibility, public_latitude, public_longitude,
    public_address, marker_mode, location_label, accuracy_note,
    allow_directions, generated_at, stale_since
  )
  values (
    p_property_id, p_location_visibility, p_public_latitude, p_public_longitude,
    p_public_address, p_marker_mode, p_location_label, p_accuracy_note,
    coalesce(p_allow_directions, false), now(), null
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
    generated_at        = excluded.generated_at,
    stale_since         = null;

  insert into public.audit_log (user_id, action, entity_type, entity_id, metadata)
  values (
    v_actor, 'updated', 'property_public_location', p_property_id,
    jsonb_build_object('regenerated', true, 'location_visibility', p_location_visibility)
  );
end;
$$;

comment on function public.save_regenerated_public_location is
  'Rewrites only the public projection, refusing with PT409 unless the property, private location and settings all still match the versions the caller derived from. Cannot restore a projection that a newer privacy decision has superseded.';

revoke all on function public.save_regenerated_public_location from public;
grant execute on function public.save_regenerated_public_location to authenticated;



-- ======================================================================
-- 7. Every ordered-group mutation serialises, by trigger
-- ======================================================================
--
-- 0011 made reordering detect a stale list. It did not stop a mutation landing
-- *during* a reorder: an insert after the count, a delete after the ownership
-- check, or a category change moving a row between groups mid-flight.
--
-- The fix has to cover create, delete, category change and reorder. Only
-- reorder is an RPC — the others are ordinary PostgREST writes from Server
-- Actions, and there is no way to make a PostgREST insert take an advisory lock.
--
-- So the lock is taken by a trigger instead. That is better than adding it to
-- four more call sites: 0011 already learned that a lock is only as good as
-- everyone remembering it, and a trigger cannot be forgotten. Any future code
-- path — an admin action, a repair script, a psql session — participates
-- automatically.
--
-- ## The four groups
--
--   property-image:<property>:<image_type>
--   property-resource:<property>:<resource_type>
--   construction:<property>
--   feature:<property>:<category>
--
-- Separate namespaces, so reordering a gallery does not block reordering the
-- floor plans, and two properties never contend.
--
-- ## Category changes lock two groups, in key order
--
-- Moving a row between groups affects both, so both are locked. Always in
-- ascending key order: two rows moving in opposite directions at once would
-- otherwise deadlock, each holding what the other wants.
--
-- ## Colliding positions are resolved rather than stored
--
-- The application computes the next position by reading the current maximum,
-- which is a read outside this lock. Two simultaneous creates can therefore both
-- choose the same number. Under the lock, a collision is detectable — so an
-- insert whose position is already taken is moved to the end instead. This is
-- the only place ordering can be made correct without changing every call site,
-- and "the second one went last" is what the administrator expects anyway.

create or replace function public.serialise_group_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_class text;
  v_property_id uuid;
  v_group text;
  v_old_group text;
  v_key_new bigint;
  v_key_old bigint;
  v_taken boolean;
  v_next integer;
begin
  v_row := case tg_op when 'DELETE' then old else new end;

  -- Which group this table is grouped by. Construction updates are one list per
  -- property and have no second column.
  case tg_table_name
    when 'property_images' then
      v_class := 'property-image';
      v_property_id := v_row.property_id;
      v_group := v_row.image_type;
      v_old_group := case when tg_op = 'UPDATE' then old.image_type end;
    when 'property_resources' then
      v_class := 'property-resource';
      v_property_id := v_row.property_id;
      v_group := v_row.resource_type;
      v_old_group := case when tg_op = 'UPDATE' then old.resource_type end;
    when 'construction_updates' then
      v_class := 'construction';
      v_property_id := v_row.property_id;
      v_group := '';
      v_old_group := '';
    when 'property_features' then
      v_class := 'feature';
      v_property_id := v_row.property_id;
      v_group := v_row.category;
      v_old_group := case when tg_op = 'UPDATE' then old.category end;
    else
      -- Not a grouped table. Nothing to serialise.
      return v_row;
  end case;

  v_key_new := public.group_lock_key(v_class, v_property_id, v_group);

  -- A row moving between groups, or between properties, touches two groups.
  if tg_op = 'UPDATE'
     and (v_old_group is distinct from v_group
          or old.property_id is distinct from new.property_id)
  then
    v_key_old := public.group_lock_key(v_class, old.property_id, v_old_group);

    -- Ascending key order, always, so two opposite moves cannot deadlock.
    if v_key_old < v_key_new then
      perform pg_catalog.pg_advisory_xact_lock(v_key_old);
      perform pg_catalog.pg_advisory_xact_lock(v_key_new);
    else
      perform pg_catalog.pg_advisory_xact_lock(v_key_new);
      perform pg_catalog.pg_advisory_xact_lock(v_key_old);
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(v_key_new);
  end if;

  /*
    Collision resolution applies to a row *arriving* in a group: an insert, or an
    update that moves it from another group. Both pick a position from a read
    taken outside this lock, so both can collide.

    It deliberately does not apply to an update that only changes `sort_order`
    within a group, because that is what the reorder functions do. A permutation
    is written as one statement and passes through intermediate states where two
    rows briefly share a position — resolving those "collisions" would rewrite
    the very order being applied. Reorder is validated as a complete permutation
    before it runs, so it needs no help here.
  */
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and v_old_group is distinct from v_group)
  then
    if tg_op = 'UPDATE' then
      -- A row moving into a different group goes to the end of it. Keeping the
      -- position it held in its previous group is meaningless — the two groups
      -- are separate sequences — and would leave a gap or a collision depending
      -- on what the destination happens to contain.
      v_taken := true;
    else
      execute format(
        'select exists (select 1 from public.%I where property_id = $1 and %s sort_order = $2 and id <> $3)',
        tg_table_name,
        case tg_table_name
          when 'property_images' then 'image_type = $4 and'
          when 'property_resources' then 'resource_type = $4 and'
          when 'property_features' then 'category = $4 and'
          else ''
        end
      )
      into v_taken
      using v_property_id, new.sort_order, new.id, v_group;
    end if;

    if v_taken then
      execute format(
        'select coalesce(max(sort_order), -1) + 1 from public.%I where property_id = $1 and %s true',
        tg_table_name,
        case tg_table_name
          when 'property_images' then 'image_type = $2 and'
          when 'property_resources' then 'resource_type = $2 and'
          when 'property_features' then 'category = $2 and'
          else ''
        end
      )
      into v_next
      using v_property_id, v_group;

      new.sort_order := v_next;
    end if;
  end if;

  -- `new` is re-read here rather than returning the `v_row` copy taken at the
  -- top: that copy was made before the reassignment above, so returning it would
  -- silently discard the corrected position.
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

comment on function public.serialise_group_mutation() is
  'Takes the ordered-group advisory lock for every insert, update and delete on a grouped table, and moves a colliding sort_order to the end. SECURITY DEFINER so it does not depend on who is writing — serialisation is not authorization, and the table''s RLS policy has already decided that.';

revoke all on function public.serialise_group_mutation() from public;

drop trigger if exists serialise_group_mutation on public.property_images;
drop trigger if exists serialise_group_mutation on public.property_resources;
drop trigger if exists serialise_group_mutation on public.construction_updates;
drop trigger if exists serialise_group_mutation on public.property_features;

create trigger serialise_group_mutation
  before insert or update or delete on public.property_images
  for each row execute function public.serialise_group_mutation();

create trigger serialise_group_mutation
  before insert or update or delete on public.property_resources
  for each row execute function public.serialise_group_mutation();

create trigger serialise_group_mutation
  before insert or update or delete on public.construction_updates
  for each row execute function public.serialise_group_mutation();

create trigger serialise_group_mutation
  before insert or update or delete on public.property_features
  for each row execute function public.serialise_group_mutation();


-- ======================================================================
-- 8. Hero selection — the audit entry, restored
-- ======================================================================
--
-- 0009 wrote a `hero_set` audit row inside this function. 0011 rewrote the
-- function to add the publication guard and the authored error codes, and the
-- audit insert did not survive the rewrite. `setHeroImage` never logged it
-- itself — it relied on the RPC — so every hero promotion since 0011 has gone
-- unrecorded.
--
-- Restored in the same transaction as the promotion, which is the property that
-- matters: a refused promotion writes nothing, and a promotion that is rolled
-- back takes its audit entry with it. Exactly one entry per successful change.

create or replace function public.set_property_hero_image(
  p_property_id uuid,
  p_image_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_image public.property_images;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_image
  from public.property_images
  where id = p_image_id
  for update;

  if not found then
    raise exception 'That image no longer exists.'
      using errcode = 'no_data_found';
  end if;

  if v_image.property_id <> p_property_id then
    raise exception 'That image does not belong to this property.'
      using errcode = 'PT422';
  end if;

  if v_image.image_type = 'floor_plan' then
    raise exception 'A floor plan cannot be the main image. Choose a photograph.'
      using errcode = 'PT422';
  end if;

  if v_image.storage_path is null and v_image.external_url is null then
    raise exception 'That image has no file or link attached.'
      using errcode = 'PT422';
  end if;

  if not v_image.is_published then
    raise exception 'Publish this image before making it the main image.'
      using errcode = 'PT422';
  end if;

  if coalesce(btrim(v_image.alt_text), '') = '' then
    raise exception 'Describe this image before making it the main image.'
      using errcode = 'PT422';
  end if;

  -- Demote first, so the partial unique index never sees two heroes.
  update public.property_images
  set image_type = 'gallery'
  where property_id = p_property_id
    and image_type = 'hero'
    and id <> p_image_id;

  update public.property_images
  set image_type = 'hero'
  where id = p_image_id;

  -- Same transaction as the promotion it describes.
  insert into public.audit_log (user_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    'hero_set',
    'property_image',
    p_image_id,
    jsonb_build_object('property_id', p_property_id)
  );
end;
$$;

comment on function public.set_property_hero_image(uuid, uuid) is
  'Promotes one published, described photograph to hero, demotes the previous hero, and records the change — all in one transaction. Refuses drafts, undescribed images, floor plans and images belonging to another property.';

revoke all on function public.set_property_hero_image(uuid, uuid) from public;
grant execute on function public.set_property_hero_image(uuid, uuid) to authenticated;


-- ======================================================================
-- 9. Reordering, under the group lock
-- ======================================================================
--
-- Same validation as 0011, with three additions:
--
-- - The group lock is taken first, so every concurrent mutation of the group
--   either completed before the count or waits until after the rewrite.
-- - The number of rows actually updated is confirmed against the number
--   supplied. A mismatch means the group changed despite the lock, which should
--   be impossible — so it raises rather than being ignored.
-- - Reordering writes an audit entry. It changes what visitors see first, which
--   is worth being able to attribute.

create or replace function public.reorder_property_images(
  p_property_id uuid,
  p_image_type text,
  p_image_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_supplied integer := coalesce(array_length(p_image_ids, 1), 0);
  v_distinct integer;
  v_owned integer;
  v_total integer;
  v_updated integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.lock_group('property-image', p_property_id, p_image_type);

  select count(*) into v_total
  from public.property_images
  where property_id = p_property_id
    and image_type = p_image_type;

  if v_supplied = 0 and v_total = 0 then
    return;
  end if;

  select count(distinct value) into v_distinct
  from unnest(p_image_ids) as value;

  if v_distinct <> v_supplied then
    raise exception 'The new order lists the same image more than once.'
      using errcode = 'PT422';
  end if;

  select count(*) into v_owned
  from public.property_images
  where id = any (p_image_ids)
    and property_id = p_property_id
    and image_type = p_image_type;

  if v_owned <> v_supplied then
    raise exception 'Those images do not all belong to this property group.'
      using errcode = 'PT422';
  end if;

  if v_total <> v_supplied then
    raise exception 'The list changed while you were editing it. Reload and try again.'
      using errcode = 'PT409';
  end if;

  update public.property_images as target
  set sort_order = ordered.position - 1
  from unnest(p_image_ids) with ordinality as ordered(id, position)
  where target.id = ordered.id;

  get diagnostics v_updated = row_count;

  if v_updated <> v_supplied then
    raise exception 'The list changed while you were editing it. Reload and try again.'
      using errcode = 'PT409';
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), 'reordered', 'property_image', p_property_id,
    jsonb_build_object('image_type', p_image_type, 'count', v_supplied)
  );
end;
$$;

comment on function public.reorder_property_images(uuid, text, uuid[]) is
  'Rewrites sort_order for one image group from a complete permutation of it, under the group advisory lock. Rejects foreign ids, duplicates, and lists that no longer match the group.';

revoke all on function public.reorder_property_images(uuid, text, uuid[]) from public;
grant execute on function public.reorder_property_images(uuid, text, uuid[]) to authenticated;

create or replace function public.reorder_property_resources(
  p_property_id uuid,
  p_resource_type text,
  p_resource_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_supplied integer := coalesce(array_length(p_resource_ids, 1), 0);
  v_distinct integer;
  v_owned integer;
  v_total integer;
  v_updated integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.lock_group('property-resource', p_property_id, p_resource_type);

  select count(*) into v_total
  from public.property_resources
  where property_id = p_property_id
    and resource_type = p_resource_type;

  if v_supplied = 0 and v_total = 0 then
    return;
  end if;

  select count(distinct value) into v_distinct
  from unnest(p_resource_ids) as value;

  if v_distinct <> v_supplied then
    raise exception 'The new order lists the same item more than once.'
      using errcode = 'PT422';
  end if;

  select count(*) into v_owned
  from public.property_resources
  where id = any (p_resource_ids)
    and property_id = p_property_id
    and resource_type = p_resource_type;

  if v_owned <> v_supplied then
    raise exception 'Those items do not all belong to this property group.'
      using errcode = 'PT422';
  end if;

  if v_total <> v_supplied then
    raise exception 'The list changed while you were editing it. Reload and try again.'
      using errcode = 'PT409';
  end if;

  update public.property_resources as target
  set sort_order = ordered.position - 1
  from unnest(p_resource_ids) with ordinality as ordered(id, position)
  where target.id = ordered.id;

  get diagnostics v_updated = row_count;

  if v_updated <> v_supplied then
    raise exception 'The list changed while you were editing it. Reload and try again.'
      using errcode = 'PT409';
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), 'reordered', 'property_resource', p_property_id,
    jsonb_build_object('resource_type', p_resource_type, 'count', v_supplied)
  );
end;
$$;

comment on function public.reorder_property_resources(uuid, text, uuid[]) is
  'Rewrites sort_order for one resource group from a complete permutation of it, under the group advisory lock.';

revoke all on function public.reorder_property_resources(uuid, text, uuid[]) from public;
grant execute on function public.reorder_property_resources(uuid, text, uuid[]) to authenticated;

create or replace function public.reorder_construction_updates(
  p_property_id uuid,
  p_update_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_supplied integer := coalesce(array_length(p_update_ids, 1), 0);
  v_distinct integer;
  v_owned integer;
  v_total integer;
  v_updated integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Construction updates form one list per property, so the property is the
  -- group and the group key is empty.
  perform public.lock_group('construction', p_property_id, '');

  select count(*) into v_total
  from public.construction_updates
  where property_id = p_property_id;

  if v_supplied = 0 and v_total = 0 then
    return;
  end if;

  select count(distinct value) into v_distinct
  from unnest(p_update_ids) as value;

  if v_distinct <> v_supplied then
    raise exception 'The new order lists the same update more than once.'
      using errcode = 'PT422';
  end if;

  select count(*) into v_owned
  from public.construction_updates
  where id = any (p_update_ids)
    and property_id = p_property_id;

  if v_owned <> v_supplied then
    raise exception 'Those updates do not all belong to this property.'
      using errcode = 'PT422';
  end if;

  if v_total <> v_supplied then
    raise exception 'The list changed while you were editing it. Reload and try again.'
      using errcode = 'PT409';
  end if;

  update public.construction_updates as target
  set sort_order = ordered.position - 1
  from unnest(p_update_ids) with ordinality as ordered(id, position)
  where target.id = ordered.id;

  get diagnostics v_updated = row_count;

  if v_updated <> v_supplied then
    raise exception 'The list changed while you were editing it. Reload and try again.'
      using errcode = 'PT409';
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), 'reordered', 'construction_update', p_property_id,
    jsonb_build_object('count', v_supplied)
  );
end;
$$;

comment on function public.reorder_construction_updates(uuid, uuid[]) is
  'Rewrites sort_order across one property''s construction updates from a complete permutation of them, under the group advisory lock.';

revoke all on function public.reorder_construction_updates(uuid, uuid[]) from public;
grant execute on function public.reorder_construction_updates(uuid, uuid[]) to authenticated;

create or replace function public.reorder_property_features(
  p_property_id uuid,
  p_category text,
  p_feature_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_supplied integer := coalesce(array_length(p_feature_ids, 1), 0);
  v_distinct integer;
  v_owned integer;
  v_total integer;
  v_updated integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.lock_group('feature', p_property_id, p_category);

  select count(*) into v_total
  from public.property_features
  where property_id = p_property_id
    and category = p_category;

  if v_supplied = 0 and v_total = 0 then
    return;
  end if;

  select count(distinct value) into v_distinct
  from unnest(p_feature_ids) as value;

  if v_distinct <> v_supplied then
    raise exception 'The new order lists the same feature more than once.'
      using errcode = 'PT422';
  end if;

  select count(*) into v_owned
  from public.property_features
  where id = any (p_feature_ids)
    and property_id = p_property_id
    and category = p_category;

  if v_owned <> v_supplied then
    raise exception 'Those features do not all belong to this property group.'
      using errcode = 'PT422';
  end if;

  if v_total <> v_supplied then
    raise exception 'The list changed while you were editing it. Reload and try again.'
      using errcode = 'PT409';
  end if;

  update public.property_features as target
  set sort_order = ordered.position - 1
  from unnest(p_feature_ids) with ordinality as ordered(id, position)
  where target.id = ordered.id;

  get diagnostics v_updated = row_count;

  if v_updated <> v_supplied then
    raise exception 'The list changed while you were editing it. Reload and try again.'
      using errcode = 'PT409';
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), 'reordered', 'property_feature', p_property_id,
    jsonb_build_object('category', p_category, 'count', v_supplied)
  );
end;
$$;

comment on function public.reorder_property_features(uuid, text, uuid[]) is
  'Rewrites sort_order across one feature category from a complete permutation of it, under the group advisory lock.';

revoke all on function public.reorder_property_features(uuid, text, uuid[]) from public;
grant execute on function public.reorder_property_features(uuid, text, uuid[]) to authenticated;
