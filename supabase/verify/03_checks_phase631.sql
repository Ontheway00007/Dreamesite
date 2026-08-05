-- Verification harness — Phase 6.3.1 checks
--
-- Asserts what migration 0011 claims. Run after 00_supabase_stubs.sql, all
-- migrations, 01_checks.sql and 02_checks_phase63.sql — the administrator and
-- the two properties are seeded there.
--
-- Single-session assertions only. The two genuinely concurrent guarantees —
-- publish versus location mutation, and two simultaneous super-administrator
-- removals — need two live connections and live in `04_concurrency.sh`.
--
-- Every check raises on failure, so with ON_ERROR_STOP=1 a clean run means
-- every assertion held.

\set ON_ERROR_STOP on

-- 02_checks left the roster with a single active super administrator whose id
-- is ...0003. Act as that one.
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';

-- ======================================================================
-- 0. Fixtures
-- ======================================================================

-- A third property, owned by this file, so reorder-completeness assertions do
-- not depend on how earlier files left the first two.
insert into public.properties (
  id, slug, name, summary, status, suburb, state,
  bedrooms, bathrooms, car_spaces, land_size_sqm
) values
  ('33333333-3333-4333-8333-333333333333', 'gamma', 'Gamma', 'G.',
   'under-construction', 'Donnybrook', 'VIC', 4, 2, 2, 400)
on conflict do nothing;

-- ======================================================================
-- 1. Advisory lock keys
-- ======================================================================

do $$
declare
  v_a bigint;
  v_b bigint;
begin
  v_a := public.property_lock_key('33333333-3333-4333-8333-333333333333');
  v_b := public.property_lock_key('33333333-3333-4333-8333-333333333333');

  if v_a <> v_b then
    raise exception 'CHECK FAILED: the lock key is not deterministic';
  end if;

  if v_a = public.property_lock_key('11111111-1111-4111-8111-111111111111') then
    raise exception 'CHECK FAILED: two properties share a lock key';
  end if;

  raise notice 'PASS  property lock keys are deterministic and distinct per property';
end $$;

-- Taking a lock twice in one transaction must not self-deadlock — advisory
-- locks are re-entrant for their holder — and the property and roster locks
-- must occupy different keys, or a roster change and a publish would block each
-- other for no reason.
--
-- All of it in one block on purpose: these locks are transaction-scoped, so a
-- second `do` block would be inspecting locks that had already been released.
do $$
declare
  v_keys integer;
begin
  perform public.lock_property('33333333-3333-4333-8333-333333333333');
  perform public.lock_property('33333333-3333-4333-8333-333333333333');
  perform public.lock_admin_roster();
  perform public.lock_property('11111111-1111-4111-8111-111111111111');

  -- A bigint advisory key is stored split across classid and objid, so the
  -- pair is what identifies it.
  select count(distinct (classid, objid)) into v_keys
  from pg_locks
  where locktype = 'advisory'
    and pid = pg_backend_pid();

  if v_keys <> 3 then
    raise exception
      'CHECK FAILED: expected 3 distinct advisory keys (two properties and the roster), found %',
      v_keys;
  end if;

  raise notice 'PASS  locks are re-entrant, and the two properties and the roster hold distinct keys';
end $$;

-- Anonymous callers must not be able to take locks at all.
do $$
begin
  if has_function_privilege('anon', 'public.lock_property(uuid)', 'execute') then
    raise exception 'CHECK FAILED: anon can take a property lock';
  end if;

  if has_function_privilege('anon', 'public.lock_admin_roster()', 'execute') then
    raise exception 'CHECK FAILED: anon can take the roster lock';
  end if;

  if not has_function_privilege('authenticated', 'public.lock_property(uuid)', 'execute') then
    raise exception 'CHECK FAILED: authenticated cannot take a property lock';
  end if;

  raise notice 'PASS  lock helpers are executable by authenticated only';
end $$;

-- ======================================================================
-- 2. Authored errors carry authored codes
-- ======================================================================
--
-- The application decides whether a message is safe to display by looking at
-- the SQLSTATE, so the SQLSTATE is the contract. These assertions fail if a
-- future edit moves a message back onto a generic PostgreSQL code.

insert into public.property_images
  (id, property_id, image_type, storage_path, alt_text, is_published, sort_order)
values
  ('dddd0001-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
   'gallery', 'properties/33333333-3333-4333-8333-333333333333/gallery/abcdef01-2345-6789-abcd-ef01234567a1.jpg',
   'A draft image', false, 0),
  ('dddd0002-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333',
   'gallery', 'properties/33333333-3333-4333-8333-333333333333/gallery/abcdef01-2345-6789-abcd-ef01234567a2.jpg',
   'Published and described', true, 1),
  ('dddd0003-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333',
   'gallery', 'properties/33333333-3333-4333-8333-333333333333/gallery/abcdef01-2345-6789-abcd-ef01234567a3.jpg',
   'Also published', true, 2)
on conflict do nothing;

do $$
declare
  v_state text;
begin
  begin
    perform public.set_property_hero_image(
      '33333333-3333-4333-8333-333333333333',
      'dddd0001-0000-4000-8000-000000000001');
    raise exception 'CHECK FAILED: a draft image was made hero';
  exception when others then
    v_state := sqlstate;
  end;

  if v_state <> 'PT422' then
    raise exception
      'CHECK FAILED: hero refusal raised % instead of PT422', v_state;
  end if;

  raise notice 'PASS  hero refusals raise PT422, not a generic constraint code';
end $$;

-- ======================================================================
-- 3. Reorder must be given the complete group
-- ======================================================================
--
-- Property 3 has exactly three gallery images. Each case below sends a list
-- that is wrong in one specific way.

-- The complete list is accepted, and leaves contiguous zero-based positions.
do $$
declare
  v_orders integer[];
begin
  perform public.reorder_property_images(
    '33333333-3333-4333-8333-333333333333', 'gallery',
    array['dddd0003-0000-4000-8000-000000000003',
          'dddd0001-0000-4000-8000-000000000001',
          'dddd0002-0000-4000-8000-000000000002']::uuid[]);

  select array_agg(sort_order order by sort_order) into v_orders
  from public.property_images
  where property_id = '33333333-3333-4333-8333-333333333333'
    and image_type = 'gallery';

  if v_orders <> array[0, 1, 2] then
    raise exception
      'CHECK FAILED: positions are not contiguous from zero, got %', v_orders;
  end if;

  -- And the order is the one supplied, not merely a contiguous one.
  if (
    select id from public.property_images
    where property_id = '33333333-3333-4333-8333-333333333333'
      and image_type = 'gallery'
    order by sort_order limit 1
  ) <> 'dddd0003-0000-4000-8000-000000000003' then
    raise exception 'CHECK FAILED: reorder did not apply the supplied order';
  end if;

  raise notice 'PASS  a complete image reorder yields contiguous zero-based positions';
end $$;

-- One existing id omitted. This is the case that used to corrupt the order.
do $$
declare
  v_state text;
begin
  begin
    perform public.reorder_property_images(
      '33333333-3333-4333-8333-333333333333', 'gallery',
      array['dddd0002-0000-4000-8000-000000000002',
            'dddd0001-0000-4000-8000-000000000001']::uuid[]);
    raise exception 'CHECK FAILED: a partial image reorder was accepted';
  exception when others then
    v_state := sqlstate;
  end;

  if v_state <> 'PT409' then
    raise exception 'CHECK FAILED: partial reorder raised % instead of PT409', v_state;
  end if;

  raise notice 'PASS  an image reorder omitting a row is refused as stale';
end $$;

-- An empty list for a non-empty group is a stale request, not a no-op.
do $$
begin
  begin
    perform public.reorder_property_images(
      '33333333-3333-4333-8333-333333333333', 'gallery',
      array[]::uuid[]);
    raise exception 'CHECK FAILED: an empty image reorder was accepted';
  exception when sqlstate 'PT409' then
    raise notice 'PASS  an empty image reorder against a populated group is refused';
  end;
end $$;

-- An empty list for a genuinely empty group does nothing, quietly.
do $$
begin
  perform public.reorder_property_images(
    '33333333-3333-4333-8333-333333333333', 'floor_plan',
    array[]::uuid[]);

  raise notice 'PASS  an empty reorder of an empty group is a no-op';
end $$;

-- A foreign id, with the count deliberately correct, so only ownership can
-- catch it.
do $$
begin
  begin
    perform public.reorder_property_images(
      '33333333-3333-4333-8333-333333333333', 'gallery',
      array['dddd0001-0000-4000-8000-000000000001',
            'dddd0002-0000-4000-8000-000000000002',
            'bbbb0001-0000-4000-8000-000000000001']::uuid[]);
    raise exception 'CHECK FAILED: a foreign id was accepted in a reorder';
  exception when sqlstate 'PT422' then
    raise notice 'PASS  an image reorder including a foreign id is refused';
  end;
end $$;

-- A duplicate, again with a correct count.
do $$
begin
  begin
    perform public.reorder_property_images(
      '33333333-3333-4333-8333-333333333333', 'gallery',
      array['dddd0001-0000-4000-8000-000000000001',
            'dddd0001-0000-4000-8000-000000000001',
            'dddd0002-0000-4000-8000-000000000002']::uuid[]);
    raise exception 'CHECK FAILED: a duplicate id was accepted in a reorder';
  exception when sqlstate 'PT422' then
    raise notice 'PASS  an image reorder listing the same id twice is refused';
  end;
end $$;

-- A row inserted after the list was built. Simulated by inserting, then
-- sending the list the page would still be holding.
do $$
begin
  insert into public.property_images
    (id, property_id, image_type, storage_path, alt_text, is_published, sort_order)
  values
    ('dddd0004-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333',
     'gallery', 'properties/33333333-3333-4333-8333-333333333333/gallery/abcdef01-2345-6789-abcd-ef01234567a4.jpg',
     'Added while the page was open', true, 3);

  begin
    perform public.reorder_property_images(
      '33333333-3333-4333-8333-333333333333', 'gallery',
      array['dddd0003-0000-4000-8000-000000000003',
            'dddd0001-0000-4000-8000-000000000001',
            'dddd0002-0000-4000-8000-000000000002']::uuid[]);
    raise exception 'CHECK FAILED: a reorder ignoring a newly inserted row was accepted';
  exception when sqlstate 'PT409' then
    raise notice 'PASS  a reorder that predates an insertion is refused as stale';
  end;

  delete from public.property_images
  where id = 'dddd0004-0000-4000-8000-000000000004';
end $$;

-- A row deleted after the list was built. Ownership catches this one, because
-- the missing id can no longer be owned.
do $$
begin
  delete from public.property_images
  where id = 'dddd0003-0000-4000-8000-000000000003';

  begin
    perform public.reorder_property_images(
      '33333333-3333-4333-8333-333333333333', 'gallery',
      array['dddd0003-0000-4000-8000-000000000003',
            'dddd0001-0000-4000-8000-000000000001',
            'dddd0002-0000-4000-8000-000000000002']::uuid[]);
    raise exception 'CHECK FAILED: a reorder naming a deleted row was accepted';
  exception when sqlstate 'PT422' then
    raise notice 'PASS  a reorder naming a deleted row is refused';
  end;
end $$;

-- ----------------------------------------------------------------------
-- The same completeness rule, for the other three families
-- ----------------------------------------------------------------------

insert into public.property_resources
  (id, property_id, resource_type, url, title, is_published, sort_order)
values
  ('eeee0001-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
   'document', 'https://example.com/a.pdf', 'Brochure A', true, 0),
  ('eeee0002-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333',
   'document', 'https://example.com/b.pdf', 'Brochure B', true, 1)
on conflict do nothing;

do $$
begin
  perform public.reorder_property_resources(
    '33333333-3333-4333-8333-333333333333', 'document',
    array['eeee0002-0000-4000-8000-000000000002',
          'eeee0001-0000-4000-8000-000000000001']::uuid[]);

  begin
    perform public.reorder_property_resources(
      '33333333-3333-4333-8333-333333333333', 'document',
      array['eeee0001-0000-4000-8000-000000000001']::uuid[]);
    raise exception 'CHECK FAILED: a partial resource reorder was accepted';
  exception when sqlstate 'PT409' then
    raise notice 'PASS  resource reorder requires the complete group';
  end;
end $$;

insert into public.construction_updates
  (id, property_id, stage, title, status, is_published, sort_order)
values
  ('f0000001-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
   'planning', 'Plans approved', 'complete', true, 0),
  ('f0000002-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333',
   'slab', 'Slab poured', 'complete', true, 1),
  ('f0000003-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333',
   'frame', 'Frame up', 'in-progress', true, 2)
on conflict do nothing;

do $$
declare
  v_orders integer[];
begin
  perform public.reorder_construction_updates(
    '33333333-3333-4333-8333-333333333333',
    array['f0000003-0000-4000-8000-000000000003',
          'f0000001-0000-4000-8000-000000000001',
          'f0000002-0000-4000-8000-000000000002']::uuid[]);

  select array_agg(sort_order order by sort_order) into v_orders
  from public.construction_updates
  where property_id = '33333333-3333-4333-8333-333333333333';

  if v_orders <> array[0, 1, 2] then
    raise exception 'CHECK FAILED: construction positions are not contiguous, got %', v_orders;
  end if;

  begin
    perform public.reorder_construction_updates(
      '33333333-3333-4333-8333-333333333333',
      array['f0000001-0000-4000-8000-000000000001',
            'f0000002-0000-4000-8000-000000000002']::uuid[]);
    raise exception 'CHECK FAILED: a partial construction reorder was accepted';
  exception when sqlstate 'PT409' then
    raise notice 'PASS  construction reorder requires the complete list';
  end;
end $$;

insert into public.property_features
  (id, property_id, category, label, is_published, sort_order)
values
  ('f1000001-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
   'energy', 'Double glazing', true, 0),
  ('f1000002-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333',
   'energy', 'Solar ready', true, 1),
  ('f1000003-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333',
   'material', 'Brick veneer', true, 0)
on conflict do nothing;

do $$
declare
  v_orders integer[];
begin
  perform public.reorder_property_features(
    '33333333-3333-4333-8333-333333333333', 'energy',
    array['f1000002-0000-4000-8000-000000000002',
          'f1000001-0000-4000-8000-000000000001']::uuid[]);

  select array_agg(sort_order order by sort_order) into v_orders
  from public.property_features
  where property_id = '33333333-3333-4333-8333-333333333333'
    and category = 'energy';

  if v_orders <> array[0, 1] then
    raise exception 'CHECK FAILED: feature positions are not contiguous, got %', v_orders;
  end if;

  -- The category is the group, so a complete list for the *property* is still a
  -- partial list for the category — and vice versa.
  begin
    perform public.reorder_property_features(
      '33333333-3333-4333-8333-333333333333', 'energy',
      array['f1000001-0000-4000-8000-000000000001']::uuid[]);
    raise exception 'CHECK FAILED: a partial feature reorder was accepted';
  exception when sqlstate 'PT409' then
    raise notice 'PASS  feature reorder requires the complete category';
  end;

  begin
    perform public.reorder_property_features(
      '33333333-3333-4333-8333-333333333333', 'energy',
      array['f1000001-0000-4000-8000-000000000001',
            'f1000002-0000-4000-8000-000000000002',
            'f1000003-0000-4000-8000-000000000003']::uuid[]);
    raise exception 'CHECK FAILED: a cross-category feature reorder was accepted';
  exception when sqlstate 'PT422' then
    raise notice 'PASS  feature reorder refuses an id from another category';
  end;
end $$;

-- ======================================================================
-- 4. Clearing a location unpublishes and removes every row
-- ======================================================================

do $$
declare
  v_blockers text[];
  v_published boolean;
  v_settings integer;
  v_projection integer;
begin
  -- Give property 3 a complete location so it can be published.
  perform public.save_property_location(
    '33333333-3333-4333-8333-333333333333',
    null,  -- version check skipped: this fixture derives from data it just wrote
    -37.53, 144.90, '10', 'Example Street', '3064',
    'approximate', 500, 'automatic', null, null, null,
    false, false, true, true, false,
    -37.53, 144.90, 'Donnybrook VIC', 'automatic',
    'Donnybrook', 'Approximate location', false);

  v_blockers := public.publish_property_if_ready('33333333-3333-4333-8333-333333333333');

  if coalesce(array_length(v_blockers, 1), 0) <> 0 then
    raise exception
      'CHECK FAILED: a complete property reported blockers: %', v_blockers;
  end if;

  perform public.clear_property_location('33333333-3333-4333-8333-333333333333');

  select is_published into v_published
  from public.properties where id = '33333333-3333-4333-8333-333333333333';

  select count(*) into v_settings
  from public.property_location_settings
  where property_id = '33333333-3333-4333-8333-333333333333';

  select count(*) into v_projection
  from public.property_public_locations
  where property_id = '33333333-3333-4333-8333-333333333333';

  if v_published then
    raise exception 'CHECK FAILED: clearing the location left the property published';
  end if;

  if v_settings <> 0 or v_projection <> 0 then
    raise exception 'CHECK FAILED: location rows survived the clear';
  end if;

  raise notice 'PASS  clearing a location removes every row and unpublishes the property';
end $$;

-- And publishing now refuses, because the location it depended on is gone.
do $$
declare
  v_blockers text[];
begin
  v_blockers := public.publish_property_if_ready('33333333-3333-4333-8333-333333333333');

  if coalesce(array_length(v_blockers, 1), 0) = 0 then
    raise exception 'CHECK FAILED: a property with no location published';
  end if;

  raise notice 'PASS  publishing refuses a property whose location was cleared';
end $$;

-- ======================================================================
-- 5. Counting blocked properties
-- ======================================================================
--
-- The count must equal a direct evaluation of the same blocker function, which
-- is the point of sharing one definition with the publish gate.

do $$
declare
  v_reported integer;
  v_expected integer;
begin
  v_reported := public.count_publish_blocked_properties();

  select count(*)::integer into v_expected
  from public.properties p
  where not p.is_published
    and coalesce(array_length(public.property_publish_blockers(p.id), 1), 0) > 0;

  if v_reported <> v_expected then
    raise exception
      'CHECK FAILED: blocked count reported % but the gate says %',
      v_reported, v_expected;
  end if;

  -- Property 3 has just had its location cleared, so it must be in the count.
  if v_reported < 1 then
    raise exception 'CHECK FAILED: a property with no location was not counted as blocked';
  end if;

  raise notice 'PASS  count_publish_blocked_properties agrees with the publish gate (% blocked)', v_reported;
end $$;

-- A published property is never counted, whatever state it is in.
do $$
declare
  v_before integer;
  v_after integer;
begin
  v_before := public.count_publish_blocked_properties();

  update public.properties
  set is_published = true
  where id = '33333333-3333-4333-8333-333333333333';

  v_after := public.count_publish_blocked_properties();

  if v_after <> v_before - 1 then
    raise exception
      'CHECK FAILED: publishing a blocked property changed the count by %',
      v_before - v_after;
  end if;

  update public.properties
  set is_published = false
  where id = '33333333-3333-4333-8333-333333333333';

  raise notice 'PASS  the blocked count considers drafts only';
end $$;

-- ======================================================================
-- 6. Privileges on the new functions
-- ======================================================================

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'public.lock_property(uuid)',
    'public.lock_admin_roster()',
    'public.property_lock_key(uuid)',
    'public.clear_property_location(uuid)',
    'public.count_publish_blocked_properties()'
  ]
  loop
    if has_function_privilege('anon', v_name, 'execute') then
      raise exception 'CHECK FAILED: anon can execute %', v_name;
    end if;

    if not has_function_privilege('authenticated', v_name, 'execute') then
      raise exception 'CHECK FAILED: authenticated cannot execute %', v_name;
    end if;
  end loop;

  raise notice 'PASS  every function added by 0011 is authenticated-only';
end $$;

-- Every function this migration defines must pin its search_path, or a caller
-- could shadow `public` and redirect the lookups inside it.
do $$
declare
  v_unpinned text;
begin
  select string_agg(p.proname, ', ') into v_unpinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'property_lock_key', 'lock_property', 'lock_admin_roster',
      'publish_property_if_ready', 'save_property_location',
      'clear_property_location', 'prevent_last_super_admin_removal',
      'prevent_self_admin_removal', 'set_property_hero_image',
      'reorder_property_images', 'reorder_property_resources',
      'reorder_construction_updates', 'reorder_property_features',
      'count_publish_blocked_properties'
    )
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as config
      where config like 'search_path=%'
    );

  if v_unpinned is not null then
    raise exception 'CHECK FAILED: these functions do not pin search_path: %', v_unpinned;
  end if;

  raise notice 'PASS  every function touched by 0011 pins its search_path';
end $$;

-- ======================================================================
-- 7. The supporting index exists
-- ======================================================================

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'properties_status_published_idx'
  ) then
    raise exception 'CHECK FAILED: properties_status_published_idx is missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'admin_users_active_super_idx'
  ) then
    raise exception 'CHECK FAILED: admin_users_active_super_idx is missing';
  end if;

  raise notice 'PASS  the supporting indexes exist';
end $$;

do $$
begin
  raise notice '';
  raise notice 'All Phase 6.3.1 checks passed.';
end $$;
