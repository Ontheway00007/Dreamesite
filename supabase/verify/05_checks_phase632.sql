-- Verification harness — Phase 6.3.2 checks
--
-- Asserts what migration 0012 claims. Run after the stubs, all migrations, and
-- 01–03. Single-session only; the group-lock concurrency guarantees need two
-- live connections and live in `04_concurrency.sh`.

\set ON_ERROR_STOP on

-- 02 left one active super administrator, id ...0003.
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';

-- ======================================================================
-- 0. Fixtures
-- ======================================================================

insert into public.properties (
  id, slug, name, summary, status, suburb, state,
  bedrooms, bathrooms, car_spaces, land_size_sqm
) values
  ('44444444-4444-4444-8444-444444444444', 'delta', 'Delta', 'D.',
   'under-construction', 'Mickleham', 'VIC', 4, 2, 2, 420)
on conflict do nothing;

-- ======================================================================
-- 1. Location tables are writable only through functions
-- ======================================================================
--
-- The administrator is the one role that used to hold these grants, so the
-- checks run as `authenticated` with an administrator's JWT — the exact identity
-- the admin dashboard uses. `postgres` would bypass everything and prove
-- nothing.

do $$
begin
  set local role authenticated;

  begin
    insert into public.property_location_settings (property_id, location_visibility)
    values ('44444444-4444-4444-8444-444444444444', 'hidden');
    reset role;
    raise exception 'CHECK FAILED: an admin inserted location settings directly';
  exception when insufficient_privilege then
    reset role;
    raise notice 'PASS  direct insert into property_location_settings is denied';
  end;
end $$;

do $$
begin
  set local role authenticated;

  begin
    update public.property_location_settings
    set location_visibility = 'exact'
    where property_id = '33333333-3333-4333-8333-333333333333';
    reset role;
    raise exception 'CHECK FAILED: an admin updated location settings directly';
  exception when insufficient_privilege then
    reset role;
    raise notice 'PASS  direct update of property_location_settings is denied';
  end;
end $$;

do $$
begin
  set local role authenticated;

  begin
    delete from public.property_private_locations
    where property_id = '33333333-3333-4333-8333-333333333333';
    reset role;
    raise exception 'CHECK FAILED: an admin deleted a private location directly';
  exception when insufficient_privilege then
    reset role;
    raise notice 'PASS  direct delete from property_private_locations is denied';
  end;
end $$;

do $$
begin
  set local role authenticated;

  begin
    update public.property_public_locations
    set public_latitude = 0, public_longitude = 0
    where property_id = '33333333-3333-4333-8333-333333333333';
    reset role;
    raise exception 'CHECK FAILED: an admin rewrote a public projection directly';
  exception when insufficient_privilege then
    reset role;
    raise notice 'PASS  direct update of property_public_locations is denied';
  end;
end $$;

-- Reading must still work: the admin location tab depends on it.
do $$
declare
  v_count integer;
begin
  set local role authenticated;

  select count(*) into v_count from public.property_location_settings;
  select count(*) into v_count from public.property_private_locations;
  select count(*) into v_count from public.property_public_locations;

  reset role;
  raise notice 'PASS  administrators can still read all three location tables';
exception when others then
  reset role;
  raise exception 'CHECK FAILED: admin read of the location tables broke (%)', sqlerrm;
end $$;

-- And the grants themselves must be gone, not merely shadowed by a policy.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'public.property_private_locations',
    'public.property_location_settings',
    'public.property_public_locations'
  ]
  loop
    if has_table_privilege('authenticated', v_table, 'insert')
       or has_table_privilege('authenticated', v_table, 'update')
       or has_table_privilege('authenticated', v_table, 'delete')
    then
      raise exception 'CHECK FAILED: authenticated still holds a write grant on %', v_table;
    end if;

    if not has_table_privilege('authenticated', v_table, 'select') then
      raise exception 'CHECK FAILED: authenticated lost SELECT on %', v_table;
    end if;
  end loop;

  -- Anonymous must reach neither private table at all.
  if has_table_privilege('anon', 'public.property_private_locations', 'select')
     or has_table_privilege('anon', 'public.property_location_settings', 'select')
  then
    raise exception 'CHECK FAILED: anon can read a private location table';
  end if;

  -- The public projection stays anon-readable; RLS restricts it to published
  -- properties.
  if not has_table_privilege('anon', 'public.property_public_locations', 'select') then
    raise exception 'CHECK FAILED: anon lost SELECT on the public projection';
  end if;

  if has_table_privilege('anon', 'public.property_public_locations', 'insert')
     or has_table_privilege('anon', 'public.property_public_locations', 'update')
     or has_table_privilege('anon', 'public.property_public_locations', 'delete')
  then
    raise exception 'CHECK FAILED: anon can write the public projection';
  end if;

  raise notice 'PASS  location grants are select-only for admins and read-only for anon';
end $$;

-- The RPCs still work, which is the other half of the requirement.
do $$
declare
  v_visibility text;
begin
  perform public.save_property_location(
    '44444444-4444-4444-8444-444444444444',
    null,
    -37.55, 144.91, '4', 'Example Street', '3064',
    'suburb', null, 'automatic', null, null, 'Mickleham',
    false, false, true, true, false,
    -37.55, 144.91, 'Mickleham VIC', 'automatic',
    'Mickleham', 'Suburb only', false);

  select location_visibility into v_visibility
  from public.property_public_locations
  where property_id = '44444444-4444-4444-8444-444444444444';

  if v_visibility <> 'suburb' then
    raise exception 'CHECK FAILED: the save RPC did not write the projection';
  end if;

  raise notice 'PASS  save_property_location still writes all three tables';
end $$;

-- ======================================================================
-- 2. Version checking
-- ======================================================================

do $$
declare
  v_stale timestamptz := '2020-01-01T00:00:00Z';
begin
  begin
    perform public.save_property_location(
      '44444444-4444-4444-8444-444444444444',
      v_stale,
      -37.55, 144.91, '4', 'Example Street', '3064',
      'exact', null, 'automatic', null, null, null,
      true, true, true, true, true,
      -37.55, 144.91, '4 Example Street, Mickleham VIC', 'automatic',
      'Mickleham', 'Exact', true);
    raise exception 'CHECK FAILED: a stale property version was accepted';
  exception when sqlstate 'PT409' then
    raise notice 'PASS  save_property_location refuses a stale property version';
  end;

  -- And nothing was written: the visibility is still what section 1 set.
  if (select location_visibility from public.property_public_locations
      where property_id = '44444444-4444-4444-8444-444444444444') <> 'suburb' then
    raise exception 'CHECK FAILED: a refused save still wrote the projection';
  end if;

  raise notice 'PASS  a refused save leaves the projection untouched';
end $$;

-- Passing the current version succeeds.
do $$
declare
  v_now timestamptz;
begin
  select updated_at into v_now from public.properties
  where id = '44444444-4444-4444-8444-444444444444';

  perform public.save_property_location(
    '44444444-4444-4444-8444-444444444444',
    v_now,
    -37.55, 144.91, '4', 'Example Street', '3064',
    'approximate', 500, 'automatic', null, null, null,
    false, false, true, true, false,
    -37.55, 144.91, 'Mickleham VIC', 'automatic',
    'Mickleham', 'Approximate', false);

  raise notice 'PASS  save_property_location accepts the current property version';
end $$;

-- ======================================================================
-- 3. Staleness flagging
-- ======================================================================

do $$
declare
  v_stale timestamptz;
begin
  if (select stale_since from public.property_public_locations
      where property_id = '44444444-4444-4444-8444-444444444444') is not null then
    raise exception 'CHECK FAILED: a freshly saved projection is already stale';
  end if;

  -- The projection embeds the suburb, so changing it invalidates the projection.
  update public.properties set suburb = 'Craigieburn'
  where id = '44444444-4444-4444-8444-444444444444';

  select stale_since into v_stale from public.property_public_locations
  where property_id = '44444444-4444-4444-8444-444444444444';

  if v_stale is null then
    raise exception 'CHECK FAILED: changing the suburb did not flag the projection stale';
  end if;

  raise notice 'PASS  changing the suburb flags the projection stale';
end $$;

-- A field the projection does not read must not flag it.
do $$
begin
  update public.property_public_locations set stale_since = null
  where property_id = '44444444-4444-4444-8444-444444444444';

  update public.properties set bedrooms = 5
  where id = '44444444-4444-4444-8444-444444444444';

  if (select stale_since from public.property_public_locations
      where property_id = '44444444-4444-4444-8444-444444444444') is not null then
    raise exception 'CHECK FAILED: an unrelated property change flagged the projection stale';
  end if;

  raise notice 'PASS  an unrelated property change does not flag the projection';
end $$;

-- Saving the location again clears it.
do $$
declare
  v_now timestamptz;
begin
  update public.properties set suburb = 'Donnybrook'
  where id = '44444444-4444-4444-8444-444444444444';

  select updated_at into v_now from public.properties
  where id = '44444444-4444-4444-8444-444444444444';

  perform public.save_property_location(
    '44444444-4444-4444-8444-444444444444',
    v_now,
    -37.55, 144.91, '4', 'Example Street', '3064',
    'suburb', null, 'automatic', null, null, 'Donnybrook',
    false, false, true, true, false,
    -37.55, 144.91, 'Donnybrook VIC', 'automatic',
    'Donnybrook', 'Suburb only', false);

  if (select stale_since from public.property_public_locations
      where property_id = '44444444-4444-4444-8444-444444444444') is not null then
    raise exception 'CHECK FAILED: saving the location did not clear staleness';
  end if;

  raise notice 'PASS  saving the location clears the stale flag';
end $$;

-- ======================================================================
-- 4. Regeneration cannot restore superseded data
-- ======================================================================

do $$
declare
  v_p timestamptz;
  v_priv timestamptz;
  v_set timestamptz;
begin
  select updated_at into v_p from public.properties
  where id = '44444444-4444-4444-8444-444444444444';
  select updated_at into v_priv from public.property_private_locations
  where property_id = '44444444-4444-4444-8444-444444444444';
  select updated_at into v_set from public.property_location_settings
  where property_id = '44444444-4444-4444-8444-444444444444';

  -- Current versions: accepted.
  perform public.save_regenerated_public_location(
    '44444444-4444-4444-8444-444444444444',
    v_p, v_priv, v_set,
    'suburb', -37.55, 144.91, 'Donnybrook VIC', 'automatic',
    'Donnybrook', 'Suburb only', false);

  raise notice 'PASS  regeneration accepts matching versions';

  -- Now the privacy decision changes to hidden, which is the dangerous case:
  -- the old generator would happily restore the coordinate afterwards.
  perform public.save_property_location(
    '44444444-4444-4444-8444-444444444444',
    null,
    -37.55, 144.91, '4', 'Example Street', '3064',
    'hidden', null, 'automatic', null, null, null,
    false, false, false, false, false,
    null, null, null, 'automatic', null, 'Hidden', false);

  -- The regeneration job, still holding the versions it read before that save.
  begin
    perform public.save_regenerated_public_location(
      '44444444-4444-4444-8444-444444444444',
      v_p, v_priv, v_set,
      'suburb', -37.55, 144.91, 'Donnybrook VIC', 'automatic',
      'Donnybrook', 'Suburb only', false);
    raise exception 'CHECK FAILED: a stale regeneration restored a public coordinate';
  exception when sqlstate 'PT409' then
    raise notice 'PASS  regeneration refuses versions superseded by a privacy change';
  end;

  -- And the hidden decision still stands.
  if (select public_latitude from public.property_public_locations
      where property_id = '44444444-4444-4444-8444-444444444444') is not null then
    raise exception 'CHECK FAILED: a hidden property has a public coordinate';
  end if;

  raise notice 'PASS  the hidden privacy decision survived the regeneration attempt';
end $$;

-- ======================================================================
-- 5. clear_property_location checks the property exists
-- ======================================================================

do $$
declare
  v_audit_before integer;
  v_audit_after integer;
begin
  select count(*) into v_audit_before from public.audit_log
  where entity_type = 'property_location';

  begin
    perform public.clear_property_location('99999999-9999-4999-8999-999999999999');
    raise exception 'CHECK FAILED: clearing a nonexistent property succeeded';
  exception when sqlstate 'P0002' then
    null;
  end;

  select count(*) into v_audit_after from public.audit_log
  where entity_type = 'property_location';

  if v_audit_after <> v_audit_before then
    raise exception
      'CHECK FAILED: clearing a nonexistent property wrote % audit row(s)',
      v_audit_after - v_audit_before;
  end if;

  raise notice 'PASS  clearing a nonexistent property is refused and audits nothing';
end $$;

-- ======================================================================
-- 6. Hero promotion audits again
-- ======================================================================

insert into public.property_images
  (id, property_id, image_type, storage_path, alt_text, is_published, sort_order)
values
  ('a0000001-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444',
   'gallery', 'properties/44444444-4444-4444-8444-444444444444/gallery/abcdef01-2345-6789-abcd-ef01234567b1.jpg',
   'Published and described', true, 0),
  ('a0000002-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444',
   'gallery', 'properties/44444444-4444-4444-8444-444444444444/gallery/abcdef01-2345-6789-abcd-ef01234567b2.jpg',
   'A draft image', false, 1)
on conflict do nothing;

do $$
declare
  v_before integer;
  v_after integer;
begin
  select count(*) into v_before from public.audit_log where action = 'hero_set';

  perform public.set_property_hero_image(
    '44444444-4444-4444-8444-444444444444',
    'a0000001-0000-4000-8000-000000000001');

  select count(*) into v_after from public.audit_log where action = 'hero_set';

  if v_after <> v_before + 1 then
    raise exception
      'CHECK FAILED: a successful hero promotion wrote % audit rows, expected 1',
      v_after - v_before;
  end if;

  -- And it describes the right image and property.
  if not exists (
    select 1 from public.audit_log
    where action = 'hero_set'
      and entity_type = 'property_image'
      and entity_id = 'a0000001-0000-4000-8000-000000000001'
      and metadata ->> 'property_id' = '44444444-4444-4444-8444-444444444444'
  ) then
    raise exception 'CHECK FAILED: the hero audit row does not identify the image and property';
  end if;

  raise notice 'PASS  a successful hero promotion writes exactly one audit row';
end $$;

do $$
declare
  v_before integer;
  v_after integer;
begin
  select count(*) into v_before from public.audit_log where action = 'hero_set';

  -- A draft image: refused, so nothing may be recorded.
  begin
    perform public.set_property_hero_image(
      '44444444-4444-4444-8444-444444444444',
      'a0000002-0000-4000-8000-000000000002');
    raise exception 'CHECK FAILED: a draft image was promoted';
  exception when sqlstate 'PT422' then
    null;
  end;

  -- An image from another property: also refused.
  begin
    perform public.set_property_hero_image(
      '44444444-4444-4444-8444-444444444444',
      'bbbb0001-0000-4000-8000-000000000001');
    raise exception 'CHECK FAILED: a foreign image was promoted';
  exception when sqlstate 'PT422' then
    null;
  end;

  select count(*) into v_after from public.audit_log where action = 'hero_set';

  if v_after <> v_before then
    raise exception
      'CHECK FAILED: refused hero promotions wrote % audit row(s)', v_after - v_before;
  end if;

  raise notice 'PASS  refused hero promotions write no audit row';
end $$;

-- A rolled-back promotion takes its audit entry with it, because both are in the
-- same transaction.
do $$
declare
  v_before integer;
begin
  select count(*) into v_before from public.audit_log where action = 'hero_set';

  begin
    -- Promote, then force a failure inside the same block.
    perform public.set_property_hero_image(
      '44444444-4444-4444-8444-444444444444',
      'a0000001-0000-4000-8000-000000000001');
    raise exception 'deliberate rollback';
  exception when others then
    null;
  end;

  if (select count(*) from public.audit_log where action = 'hero_set') <> v_before then
    raise exception 'CHECK FAILED: a rolled-back promotion left an audit row behind';
  end if;

  raise notice 'PASS  a rolled-back promotion leaves no audit row';
end $$;

-- ======================================================================
-- 7. Reordering audits, and colliding positions are resolved
-- ======================================================================

do $$
declare
  v_before integer;
begin
  select count(*) into v_before from public.audit_log
  where action = 'reordered' and entity_type = 'property_image';

  -- Property 4's gallery currently holds one image; the hero was promoted out.
  perform public.reorder_property_images(
    '44444444-4444-4444-8444-444444444444', 'gallery',
    array['a0000002-0000-4000-8000-000000000002']::uuid[]);

  if (select count(*) from public.audit_log
      where action = 'reordered' and entity_type = 'property_image') <> v_before + 1 then
    raise exception 'CHECK FAILED: reordering did not write an audit row';
  end if;

  raise notice 'PASS  reordering writes an audit row';
end $$;

-- Two rows inserted with the same position: the second is moved to the end
-- rather than stored as a duplicate.
do $$
declare
  v_orders integer[];
begin
  -- Three separate statements, because that is what three concurrent creates
  -- look like. A single multi-row INSERT could not detect its own siblings:
  -- rows added by the current command are not visible to a query inside a
  -- BEFORE trigger firing for that same command.
  insert into public.property_features (id, property_id, category, label, sort_order)
  values ('b0000001-0000-4000-8000-000000000001',
          '44444444-4444-4444-8444-444444444444', 'energy', 'First', 0);

  insert into public.property_features (id, property_id, category, label, sort_order)
  values ('b0000002-0000-4000-8000-000000000002',
          '44444444-4444-4444-8444-444444444444', 'energy', 'Second, same position', 0);

  insert into public.property_features (id, property_id, category, label, sort_order)
  values ('b0000003-0000-4000-8000-000000000003',
          '44444444-4444-4444-8444-444444444444', 'energy', 'Third, same position again', 0);

  select array_agg(distinct sort_order order by sort_order) into v_orders
  from public.property_features
  where property_id = '44444444-4444-4444-8444-444444444444'
    and category = 'energy';

  if array_length(v_orders, 1) <> 3 then
    raise exception
      'CHECK FAILED: colliding positions were stored as duplicates, got %', v_orders;
  end if;

  raise notice 'PASS  a colliding sort_order is moved to the end of the group';
end $$;

-- ======================================================================
-- 8. Lock helpers refuse non-administrators
-- ======================================================================

do $$
begin
  -- ...0002 is a signed-in user who is not an administrator (seeded by 01).
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';

  begin
    perform public.lock_property('44444444-4444-4444-8444-444444444444');
    raise exception 'CHECK FAILED: a non-admin took a property lock';
  exception when insufficient_privilege then
    raise notice 'PASS  lock_property refuses a non-administrator';
  end;

  begin
    perform public.lock_group('property-image', '44444444-4444-4444-8444-444444444444', 'gallery');
    raise exception 'CHECK FAILED: a non-admin took a group lock';
  exception when insufficient_privilege then
    raise notice 'PASS  lock_group refuses a non-administrator';
  end;

  begin
    perform public.lock_admin_roster();
    raise exception 'CHECK FAILED: a non-admin took the roster lock';
  exception when insufficient_privilege then
    raise notice 'PASS  lock_admin_roster refuses a non-administrator';
  end;
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';

do $$
begin
  if has_function_privilege('anon', 'public.lock_property(uuid)', 'execute')
     or has_function_privilege('anon', 'public.lock_group(text, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.lock_admin_roster()', 'execute')
  then
    raise exception 'CHECK FAILED: anon can execute a lock helper';
  end if;

  -- The unguarded internal helper must be reachable by nobody.
  if has_function_privilege('anon', 'public.lock_group_internal(text, uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.lock_group_internal(text, uuid, text)', 'execute')
  then
    raise exception 'CHECK FAILED: lock_group_internal is executable outside SECURITY DEFINER code';
  end if;

  raise notice 'PASS  lock helpers are admin-only and the internal one is granted to nobody';
end $$;

-- ======================================================================
-- 9. Every function 0012 defines pins its search_path
-- ======================================================================

do $$
declare
  v_unpinned text;
begin
  select string_agg(p.proname, ', ') into v_unpinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'group_lock_key', 'lock_group', 'lock_group_internal',
      'lock_property', 'lock_admin_roster',
      'save_property_location', 'clear_property_location',
      'save_regenerated_public_location', 'flag_stale_public_location',
      'serialise_group_mutation', 'set_property_hero_image',
      'reorder_property_images', 'reorder_property_resources',
      'reorder_construction_updates', 'reorder_property_features'
    )
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as config
      where config like 'search_path=%'
    );

  if v_unpinned is not null then
    raise exception 'CHECK FAILED: these functions do not pin search_path: %', v_unpinned;
  end if;

  raise notice 'PASS  every function 0012 defines pins its search_path';
end $$;

-- Every SECURITY DEFINER function added here must check is_admin(), or it is a
-- privilege-escalation route. Checked by reading the source, which is crude but
-- catches the mistake this migration could most easily introduce.
do $$
declare
  v_missing text;
begin
  select string_agg(p.proname, ', ') into v_missing
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.proname in (
      'save_property_location', 'clear_property_location',
      'save_regenerated_public_location'
    )
    and p.prosrc not like '%is_admin()%';

  if v_missing is not null then
    raise exception
      'CHECK FAILED: these SECURITY DEFINER functions do not check is_admin(): %',
      v_missing;
  end if;

  raise notice 'PASS  every SECURITY DEFINER location function checks is_admin()';
end $$;

do $$
begin
  raise notice '';
  raise notice 'All Phase 6.3.2 checks passed.';
end $$;
