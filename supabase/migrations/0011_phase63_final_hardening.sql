-- ======================================================================
-- 0011  Phase 6.3.1 — concurrency, reorder completeness and error codes
-- ======================================================================
--
-- Additive. Nothing earlier is edited: every change here is either a new
-- function or a `create or replace` of an existing one, so the migration can be
-- applied to a database already carrying 0001–0010.
--
-- Three defects and one architectural gap are addressed.
--
-- 1. **Publishing read stale readiness.** `publish_property_if_ready` (0010)
--    locked the `properties` row, but readiness also depends on
--    `property_location_settings` and `property_public_locations`. Those rows
--    were unlocked, so another transaction could remove a required location
--    between the check and the update.
--
-- 2. **The last-super-admin guard had a write-skew hole.** It counted the
--    remaining active super administrators without serialising, so two
--    concurrent transactions could each demote a different account, each
--    having seen the other still active, and both commit — leaving nobody.
--
-- 3. **Reorder accepted partial lists.** All four reorder functions checked
--    that every supplied id belonged to the group, but not that every row in
--    the group was supplied. A stale list left the omitted rows on their old
--    `sort_order`, producing duplicate positions.
--
-- 4. **Authored errors were indistinguishable from database errors.** Rules
--    such as "publish this image first" were raised as `check_violation`, the
--    same SQLSTATE PostgreSQL uses for a genuine CHECK failure. The
--    application could only tell them apart by matching message text. Section 1
--    introduces dedicated codes.


-- ======================================================================
-- 1. Error codes for authored messages
-- ======================================================================
--
-- Two SQLSTATE values are reserved for messages written in this schema for an
-- administrator to read:
--
--   PT422  A rule refused the operation. The message says which rule and what
--          to do about it. Nothing is wrong with the system.
--   PT409  The data changed underneath the request. The message asks for a
--          reload.
--
-- Why these particular codes, in two parts:
--
-- *The `PT` prefix* is how PostgREST is asked to return a specific HTTP status:
-- a SQLSTATE of the form `PTxyz` sets the response status to `xyz`. So these
-- surface as 422 and 409 rather than 500. If a PostgREST version does not
-- honour that, the request falls back to 500 — which is what any unrecognised
-- code produces, so this is never worse than the alternative. Note this is
-- PostgREST behaviour and is not exercised by the SQL harness, which calls the
-- functions directly.
--
-- *The fact that they are ours* is the part the application depends on.
-- PostgreSQL raises nothing in class `PT`, so `code = 'PT422'` is proof the
-- message was written here. `lib/admin/errors.ts` displays those messages
-- verbatim and refuses to display anything else. That replaces matching on
-- message text, which broke silently whenever a message was reworded.
--
-- Codes deliberately *not* changed:
--
-- - `42501 insufficient_privilege` for authorization refusals. It already maps
--   to a good message and PostgREST turns it into a 403.
-- - `P0002 no_data_found` for a missing row, which PostgREST turns into a 404.
-- - The `audit_log` append-only trigger keeps `raise_exception`. An
--   administrator seeing "audit_log is append-only" would learn nothing they
--   could act on; that error means the application has a bug, so it should
--   reach the generic message and the server log, not the screen.


-- ======================================================================
-- 2. Advisory lock helpers
-- ======================================================================
--
-- Publish readiness spans three tables. Row locks alone cannot cover it: you
-- cannot `SELECT ... FOR UPDATE` a row that does not exist yet, and "there is
-- no location settings row" is precisely one of the states being guarded. A
-- lock on the *property* rather than on any row is what is needed, which is
-- what an advisory lock provides.
--
-- ## The key
--
-- Derived from the UUID with `md5`, namespaced by a class string, and taken as
-- the first 64 bits. Two properties collide only on an md5 prefix collision,
-- which is not a correctness problem in any case — a collision costs two
-- unrelated properties some unnecessary waiting, never a wrong result.
--
-- `md5` is used rather than `hashtextextended` because it is documented and
-- stable. The value only has to be consistent within one running cluster, but a
-- documented function is easier to reason about than an internal one.
--
-- The class prefix is what keeps a property lock from colliding with the
-- administrator roster lock. They are different key spaces by construction, not
-- by luck.
--
-- ## Ordering, and why there is no deadlock
--
-- The rule this schema follows: **acquire the advisory lock before any row
-- lock, and never hold two advisory locks at once.**
--
-- No transaction needs both a property lock and the roster lock, so those two
-- can never form a cycle. Within the property lock, `publish_property_if_ready`
-- takes the advisory lock and then the `properties` row lock, in that order.
-- The only other writer of that row is an ordinary property update, which takes
-- the row lock and never asks for the advisory lock — so it cannot be the
-- second half of a cycle.

create or replace function public.property_lock_key(p_property_id uuid)
returns bigint
language sql
immutable
security invoker
set search_path = ''
as $$
  select ('x' || pg_catalog.substr(
    pg_catalog.md5('dreame.property:' || p_property_id::text), 1, 16
  ))::bit(64)::bigint;
$$;

comment on function public.property_lock_key(uuid) is
  'Deterministic advisory-lock key for one property. Namespaced so it cannot collide with the administrator roster lock.';

revoke all on function public.property_lock_key(uuid) from public;
grant execute on function public.property_lock_key(uuid) to authenticated;

/*
  Acquires the property-scoped lock for the rest of the transaction.

  Every write that can change whether a property is publishable calls this
  first. It is transaction-scoped, so it is released on commit or rollback with
  no possibility of a leaked lock.

  Deliberately not SECURITY DEFINER. Taking an advisory lock needs no privilege,
  so there is nothing to elevate, and the callers are already admin-gated.
*/
create or replace function public.lock_property(p_property_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(public.property_lock_key(p_property_id));
$$;

comment on function public.lock_property(uuid) is
  'Takes the transaction-scoped advisory lock for one property. Required by every write affecting publish readiness. Always acquired before any row lock.';

revoke all on function public.lock_property(uuid) from public;
grant execute on function public.lock_property(uuid) to authenticated;

/*
  The administrator roster lock.

  One fixed key, because the invariant it protects is global: "at least one
  active super administrator exists" is a property of the whole table, not of
  any row. A per-row lock cannot protect it — the two transactions in the race
  touch *different* rows, which is why row locking never detected the conflict.

  This is the one intentionally global lock in the schema. It is held only for
  the duration of a roster change, which is a rare administrative action.
*/
create or replace function public.lock_admin_roster()
returns void
language sql
security invoker
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    ('x' || pg_catalog.substr(pg_catalog.md5('dreame.admin_roster'), 1, 16))::bit(64)::bigint
  );
$$;

comment on function public.lock_admin_roster() is
  'Takes the single transaction-scoped advisory lock guarding the active super administrator count. Intentionally global: the invariant is table-wide.';

revoke all on function public.lock_admin_roster() from public;
grant execute on function public.lock_admin_roster() to authenticated;


-- ======================================================================
-- 3. Publishing, fully serialised
-- ======================================================================
--
-- Order inside the transaction, and the reason for it:
--
--   1. Admin check      — cheapest refusal first, and no lock is taken for a
--                         caller who was never allowed to proceed.
--   2. Advisory lock    — before any row lock, per the ordering rule above.
--   3. Existence + row  — `FOR UPDATE` on the properties row covers the
--      lock              blockers that read from the row itself (name, summary,
--                        slug, suburb, state), which an ordinary property
--                        update could otherwise blank mid-flight.
--   4. Recalculate      — after both locks. This is the point of the change:
--                         the readiness that is checked is the readiness that
--                         is acted on.
--   5. Refuse, or       — blockers are returned as data, not raised. "Not ready
--      update + audit     yet" is an ordinary answer worth rendering as a
--                         checklist, and raising would flatten it into an
--                         error.

create or replace function public.publish_property_if_ready(p_property_id uuid)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_blockers text[];
  v_slug text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Held until commit. Every writer of the location tables takes the same lock,
  -- so none of them can interleave with the check below.
  perform public.lock_property(p_property_id);

  select slug into v_slug
  from public.properties
  where id = p_property_id
  for update;

  if not found then
    return array['That property no longer exists.'];
  end if;

  v_blockers := public.property_publish_blockers(p_property_id);

  if coalesce(array_length(v_blockers, 1), 0) > 0 then
    -- Nothing is written. The property stays a draft.
    return v_blockers;
  end if;

  update public.properties
  set is_published = true
  where id = p_property_id;

  -- Inside the same transaction, so the trail cannot record a publication
  -- that was rolled back.
  insert into public.audit_log (user_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    'published',
    'property',
    p_property_id,
    jsonb_build_object('slug', v_slug)
  );

  return array[]::text[];
end;
$$;

comment on function public.publish_property_if_ready(uuid) is
  'Publishes a property only if it has no outstanding blockers. Holds the property advisory lock and the properties row lock for the whole check, so readiness cannot change underneath it. Returns the blockers when it refuses; an empty array means it published.';

revoke all on function public.publish_property_if_ready(uuid) from public;
grant execute on function public.publish_property_if_ready(uuid) to authenticated;


-- ======================================================================
-- 4. Location saving takes the same lock
-- ======================================================================
--
-- Identical to the 0008 version except for the two lines that acquire the lock
-- and the error code on the two authored messages. The whole point is that
-- publishing and location saving contend on the same key: without this half of
-- the change, section 3 locks nothing anybody else respects.

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

  -- Before touching either location table, and before the existence check, so
  -- a concurrent publish waits rather than reading a half-written state.
  perform public.lock_property(p_property_id);

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
  'Writes the stored position, the privacy settings, the derived public projection and the audit entry in one transaction, under the property advisory lock so publishing cannot interleave. The projection is supplied by the caller — the privacy algorithm lives in TypeScript and is never duplicated here.';

revoke all on function public.save_property_location from public;
grant execute on function public.save_property_location to authenticated;

/*
  Clearing a property's location.

  There was no such function before, and that was the gap: the only *documented*
  writer of the location tables took the lock, but anything else — a future
  admin action, a data-correction script, a manual DELETE — did not, so the lock
  was only as good as everyone remembering to take it.

  This gives that operation a front door that takes the lock, so "clear the
  location" and "publish" contend properly. It is the removal counterpart to
  `save_property_location` and follows the same shape.
*/
create or replace function public.clear_property_location(p_property_id uuid)
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

  perform public.lock_property(p_property_id);

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
  'Removes a property''s stored position, privacy settings and public projection under the property advisory lock, and unpublishes the property because it can no longer satisfy the publish gate.';

revoke all on function public.clear_property_location(uuid) from public;
grant execute on function public.clear_property_location(uuid) to authenticated;


-- ======================================================================
-- 5. The last super administrator, without the race
-- ======================================================================
--
-- The 0010 guard counted correctly and still permitted the state it forbade.
--
-- Two super administrators, A and B. Transaction 1 demotes A; the trigger
-- counts the remaining active super administrators and finds B, so it allows
-- it. Transaction 2 demotes B; its count finds A, because transaction 1 has
-- not committed. Both commit. Nobody is left. Neither transaction did anything
-- wrong on its own — the two are only wrong together, which is the definition
-- of write skew, and row locking cannot see it because the transactions touch
-- different rows.
--
-- The fix is to serialise on the invariant rather than on any row:
-- `lock_admin_roster()` before counting. The second transaction then waits for
-- the first to commit, and its count — taken after the lock is granted — sees
-- the committed demotion and refuses.
--
-- That the count is fresh is the load-bearing detail. In READ COMMITTED a
-- volatile function takes a new snapshot for each statement it executes, so the
-- `select count(*)` after the lock is granted observes the other transaction's
-- committed change. `02_concurrency.sh` verifies this against a real server
-- with two live sessions, because it is too subtle to accept on reasoning
-- alone.

create or replace function public.prevent_last_super_admin_removal()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_remaining integer;
begin
  -- Only relevant when the row currently *is* an active super administrator.
  if old.role <> 'super_admin' or not old.is_active then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  -- An update that leaves it an active super administrator loses nothing.
  if tg_op = 'UPDATE' and new.role = 'super_admin' and new.is_active then
    return new;
  end if;

  -- Serialise before counting. Taken only on the path that can actually
  -- decrement the count, so ordinary administrator edits never contend.
  perform public.lock_admin_roster();

  select count(*) into v_remaining
  from public.admin_users
  where role = 'super_admin'
    and is_active
    and id <> old.id;

  if v_remaining = 0 then
    raise exception
      'There must be at least one active super administrator. Promote another administrator first.'
      using errcode = 'PT422';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

comment on function public.prevent_last_super_admin_removal() is
  'Refuses any change that would leave the installation with no active super administrator. Serialises on the roster advisory lock so two concurrent removals cannot both succeed.';

-- The 0010 trigger already points at this function, and `create or replace`
-- above rebound it. Recreated defensively so this migration also applies to a
-- database where 0010's trigger creation was rolled back.
drop trigger if exists prevent_last_super_admin_removal on public.admin_users;

create trigger prevent_last_super_admin_removal
  before update or delete on public.admin_users
  for each row execute function public.prevent_last_super_admin_removal();

revoke all on function public.prevent_last_super_admin_removal() from public;

/*
  The self-lockout guard, unchanged except for its error code.

  Retained exactly as 0008 wrote it: it answers a different question from the
  guard above — "are you removing your own access" rather than "is anyone left"
  — and both are needed. A sole super administrator demoting themselves trips
  this one; the last-super-admin guard catches the case where somebody else does
  it.
*/
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
        using errcode = 'PT422';
    end if;

    if tg_op = 'UPDATE'
       and (new.is_active is distinct from old.is_active
            or new.role is distinct from old.role) then
      raise exception 'You cannot change your own administrator role or status.'
        using errcode = 'PT422';
    end if;
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

comment on function public.prevent_self_admin_removal() is
  'Stops an administrator demoting or deleting themselves, which could lock everyone out of the installation.';

revoke all on function public.prevent_self_admin_removal() from public;

-- Makes the roster count an index scan rather than a sequential one. Small
-- table, so this is about the guard's cost under the lock, not about the query.
create index if not exists admin_users_active_super_idx
  on public.admin_users (role)
  where is_active;


-- ======================================================================
-- 6. Hero selection — authored error codes
-- ======================================================================
--
-- Logic identical to 0010. Only the SQLSTATEs change, so the application can
-- tell these six refusals apart from a genuine constraint violation and show
-- the administrator the sentence written for them.

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
end;
$$;

comment on function public.set_property_hero_image(uuid, uuid) is
  'Promotes one published, described photograph to hero and demotes the previous hero, in a single transaction. Refuses drafts, undescribed images, floor plans and images belonging to another property.';

revoke all on function public.set_property_hero_image(uuid, uuid) from public;
grant execute on function public.set_property_hero_image(uuid, uuid) to authenticated;


-- ======================================================================
-- 7. Reordering must be given the whole group
-- ======================================================================
--
-- What the four functions checked, and what they missed.
--
-- Checked: no duplicate ids, and every supplied id belongs to this property and
-- this group. Both are ownership questions, and both were right.
--
-- Missed: whether the supplied list *is* the group. `set sort_order = position`
-- only touches rows named in the list, so a list of three sent for a group of
-- four left the fourth row on its old position — frequently a position now held
-- by another row. The result is two rows claiming index 2 and an order that
-- depends on whatever the read happens to do with the tie.
--
-- This is not a hypothetical. Two administrators with the page open, one adding
-- an image and the other dragging, produces exactly that list.
--
-- The new check is a count: the number of rows currently in the group must
-- equal the number supplied. Combined with the existing ownership and duplicate
-- checks, that is enough to prove the list is a permutation of the group —
-- every id belongs to it, none repeats, and there are exactly as many as the
-- group holds, so nothing is missing.
--
-- It also detects the two concurrent cases for free. A row inserted since the
-- page loaded makes the group larger than the list; a row deleted makes an id
-- unownable. Both now say so instead of quietly corrupting the order.
--
-- The empty-list early return is gone. Sending nothing for a group of four is a
-- stale request, not a no-op, and only the count check can tell the difference
-- between that and a genuinely empty group.
--
-- No lock is taken. A concurrent pair of reorders both write the whole group,
-- so the second simply wins; there is no interleaving that produces a state
-- neither asked for. Detection is what was missing, not serialisation.

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
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

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

  -- Every id must belong to this property *and* this category. That single
  -- check covers both cross-property IDOR and dragging an item between
  -- groups, which would silently change its category.
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
end;
$$;

comment on function public.reorder_property_images(uuid, text, uuid[]) is
  'Rewrites sort_order for one image group from the supplied order, which must be a complete permutation of the group. Rejects foreign ids, duplicates, and lists that no longer match the group.';

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
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

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
end;
$$;

comment on function public.reorder_property_resources(uuid, text, uuid[]) is
  'Rewrites sort_order for one resource group from the supplied order, which must be a complete permutation of the group.';

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
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Construction updates form one list per property, so the property is the
  -- group and there is no second grouping column.
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
end;
$$;

comment on function public.reorder_construction_updates(uuid, uuid[]) is
  'Rewrites sort_order across one property''s construction updates from the supplied order, which must be a complete permutation of them.';

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
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

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

  -- Property *and* category. One check covers cross-property tampering and
  -- dragging an item into a different group, which would change its meaning.
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
end;
$$;

comment on function public.reorder_property_features(uuid, text, uuid[]) is
  'Rewrites sort_order across one feature category from the supplied order, which must be a complete permutation of the category.';

revoke all on function public.reorder_property_features(uuid, text, uuid[]) from public;
grant execute on function public.reorder_property_features(uuid, text, uuid[]) to authenticated;


-- ======================================================================
-- 8. Counting properties blocked from publishing
-- ======================================================================
--
-- The dashboard previously reported "properties with no location settings",
-- derived by subtracting one table's count from another's. That is a real
-- number, but it is not the number of properties that cannot be published: it
-- misses a blank summary, a missing projection row, and anything else the
-- publish gate checks.
--
-- Rather than restate the readiness rules in SQL here — a second definition
-- that would drift from the first — this calls `property_publish_blockers`, the
-- one that publishing itself uses. The count and the gate cannot disagree
-- because they are the same function.
--
-- The cost is one function call per draft property. Drafts are the properties
-- somebody is actively working on, so this stays small; a published property is
-- skipped entirely. That is the trade being made: an exact answer that shares
-- its definition with the gate, at the price of a function call per draft.
--
-- STABLE and SECURITY INVOKER, so RLS applies. A caller who cannot see a
-- property does not count it.

create or replace function public.count_publish_blocked_properties()
returns integer
language sql
security invoker
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.properties p
  where not p.is_published
    and coalesce(array_length(public.property_publish_blockers(p.id), 1), 0) > 0;
$$;

comment on function public.count_publish_blocked_properties() is
  'How many draft properties currently have at least one publish blocker, using the same function the publish gate uses so the two cannot disagree.';

revoke all on function public.count_publish_blocked_properties() from public;
grant execute on function public.count_publish_blocked_properties() to authenticated;


-- ======================================================================
-- 9. Supporting index
-- ======================================================================
--
-- The dashboard counts properties by status, and the listing filters by it.
-- `properties_status_idx` from 0001 covers status alone; this pairs it with
-- publication, which every one of those counts also constrains.

create index if not exists properties_status_published_idx
  on public.properties (status, is_published);



-- ======================================================================
-- 10. Correcting a comment that overstated what exists
-- ======================================================================
--
-- 0010 described `enquiry_recipient_email` as "where enquiry notifications
-- should go. Read by server-side code only". The second half was aspirational:
-- no code reads it, because no notification delivery exists. Enquiries are
-- stored and read in the admin dashboard.
--
-- The column is kept rather than dropped — the address is a real business
-- decision worth recording, and dropping it would lose whatever an
-- administrator has already entered — but the comment, the admin field and the
-- README now all say it is reserved. A setting that appears operational while
-- doing nothing is worse than no setting.

comment on column public.site_settings.enquiry_recipient_email is
  'RESERVED. Intended recipient for enquiry notification emails. No delivery mechanism exists yet: nothing reads this column, and enquiries are read in the admin dashboard only. Deliberately excluded from site_settings_public.';
