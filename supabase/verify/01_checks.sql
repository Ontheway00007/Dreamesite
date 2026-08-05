-- Verification harness — behavioural checks
--
-- Asserts the things migration 0009 claims. Every check raises an exception on
-- failure, so a clean run means every assertion held.
--
-- Run after 00_supabase_stubs.sql and migrations 0001–0009.

\set ON_ERROR_STOP on

-- ======================================================================
-- Fixtures
-- ======================================================================

create extension if not exists "pgcrypto";

-- An administrator, and a second user who is not one.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@example.com'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'nobody@example.com')
on conflict do nothing;

insert into public.admin_users (user_id, email, role, is_active) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@example.com', 'super_admin', true)
on conflict do nothing;

-- Two properties, so cross-property access can be attempted.
insert into public.properties (
  id, slug, name, summary, status, suburb, state,
  bedrooms, bathrooms, car_spaces, land_size_sqm
) values
  ('11111111-1111-4111-8111-111111111111', 'alpha', 'Alpha', 'A.', 'move-in-ready', 'Mickleham', 'VIC', 3, 2, 1, 300),
  ('22222222-2222-4222-8222-222222222222', 'beta',  'Beta',  'B.', 'move-in-ready', 'Craigieburn', 'VIC', 3, 2, 1, 300)
on conflict do nothing;

-- Act as the administrator for the rest of the run.
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

-- ======================================================================
-- 1. Authorization helpers
-- ======================================================================

do $$
begin
  if not public.is_admin() then
    raise exception 'CHECK FAILED: is_admin() false for a seeded active admin';
  end if;

  if not public.is_super_admin() then
    raise exception 'CHECK FAILED: is_super_admin() false for a super_admin';
  end if;

  raise notice 'PASS  is_admin / is_super_admin recognise the administrator';
end $$;

-- A non-admin user must not be recognised.
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';

do $$
begin
  if public.is_admin() then
    raise exception 'CHECK FAILED: is_admin() true for a user with no admin_users row';
  end if;

  raise notice 'PASS  a signed-in non-admin is not an administrator';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

-- EXECUTE must not be held via PUBLIC. Migration 0006 revoked from `anon`
-- alone, which was a no-op; 0008 revoked from PUBLIC.
do $$
begin
  if has_function_privilege('public', 'public.is_admin()', 'execute') then
    raise exception 'CHECK FAILED: PUBLIC still holds EXECUTE on is_admin()';
  end if;

  if not has_function_privilege('authenticated', 'public.is_admin()', 'execute') then
    raise exception 'CHECK FAILED: authenticated lacks EXECUTE on is_admin()';
  end if;

  if has_function_privilege('anon', 'public.is_admin()', 'execute') then
    raise exception 'CHECK FAILED: anon holds EXECUTE on is_admin()';
  end if;

  raise notice 'PASS  is_admin() EXECUTE is granted to authenticated only';
end $$;

-- ======================================================================
-- 2. admin_users RLS is not recursive
-- ======================================================================
--
-- The Phase 6 policies queried admin_users from inside admin_users' own
-- policy, which PostgreSQL aborts with 42P17. This reads the table as a
-- non-superuser with RLS enforced, which is what triggered it.

do $$
declare
  v_count integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

  select count(*) into v_count from public.admin_users;

  reset role;

  if v_count < 1 then
    raise exception 'CHECK FAILED: admin could not read the admin roster';
  end if;

  raise notice 'PASS  admin_users is readable under RLS without policy recursion';
exception
  when sqlstate '42P17' then
    reset role;
    raise exception 'CHECK FAILED: infinite recursion in admin_users policy (42P17)';
end $$;

-- ======================================================================
-- 3. Storage path validation
-- ======================================================================

do $$
declare
  v_valid text[] := array[
    'properties/11111111-1111-4111-8111-111111111111/hero/abcdef01-2345-6789-abcd-ef0123456789.jpg',
    'properties/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef0123456789.png',
    'properties/11111111-1111-4111-8111-111111111111/facade/abcdef01-2345-6789-abcd-ef0123456789.webp',
    'properties/11111111-1111-4111-8111-111111111111/construction/abcdef01-2345-6789-abcd-ef0123456789.jpg',
    'properties/11111111-1111-4111-8111-111111111111/floor-plans/abcdef01-2345-6789-abcd-ef0123456789.png',
    'properties/11111111-1111-4111-8111-111111111111/drone/abcdef01-2345-6789-abcd-ef0123456789.jpg',
    'properties/11111111-1111-4111-8111-111111111111/documents/abcdef01-2345-6789-abcd-ef0123456789.pdf'
  ];
  v_invalid text[] := array[
    -- traversal
    'properties/../../etc/passwd',
    'properties/11111111-1111-4111-8111-111111111111/../22222222-2222-4222-8222-222222222222/gallery/abcdef01-2345-6789-abcd-ef0123456789.jpg',
    'properties/11111111-1111-4111-8111-111111111111/gallery/../../../abcdef01-2345-6789-abcd-ef0123456789.jpg',
    '/properties/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef0123456789.jpg',
    -- category outside the allowed set
    'properties/11111111-1111-4111-8111-111111111111/secrets/abcdef01-2345-6789-abcd-ef0123456789.jpg',
    'properties/11111111-1111-4111-8111-111111111111/façade/abcdef01-2345-6789-abcd-ef0123456789.jpg',
    -- original filename rather than a generated uuid
    'properties/11111111-1111-4111-8111-111111111111/gallery/kitchen.jpg',
    'properties/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef0123456789.php.jpg',
    -- wrong shape
    'properties/11111111-1111-4111-8111-111111111111/abcdef01-2345-6789-abcd-ef0123456789.jpg',
    'properties/11111111-1111-4111-8111-111111111111/gallery/sub/abcdef01-2345-6789-abcd-ef0123456789.jpg',
    'uploads/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef0123456789.jpg',
    '',
    -- a property that does not exist
    'properties/99999999-9999-4999-8999-999999999999/gallery/abcdef01-2345-6789-abcd-ef0123456789.jpg'
  ];
  v_path text;
begin
  foreach v_path in array v_valid loop
    if not public.is_valid_property_media_path(v_path) then
      raise exception 'CHECK FAILED: valid path refused: %', v_path;
    end if;
  end loop;

  foreach v_path in array v_invalid loop
    if public.is_valid_property_media_path(v_path) then
      raise exception 'CHECK FAILED: invalid path accepted: %', v_path;
    end if;
  end loop;

  if public.is_valid_property_media_path(null) then
    raise exception 'CHECK FAILED: null path accepted';
  end if;

  raise notice 'PASS  is_valid_property_media_path accepts % layouts and refuses % attempts',
    array_length(v_valid, 1), array_length(v_invalid, 1);
end $$;

-- ======================================================================
-- 4. One hero per property
-- ======================================================================

insert into public.property_images (id, property_id, image_type, storage_path, alt_text, sort_order, is_published)
values
  ('aaaa0001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'hero',    'properties/11111111-1111-4111-8111-111111111111/hero/abcdef01-2345-6789-abcd-ef0123456781.jpg', 'Hero one', 0, true),
  ('aaaa0002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'gallery', 'properties/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef0123456782.jpg', 'Gallery one', 0, true),
  ('aaaa0003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'gallery', 'properties/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef0123456783.jpg', 'Gallery two', 1, true),
  ('bbbb0001-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'gallery', 'properties/22222222-2222-4222-8222-222222222222/gallery/abcdef01-2345-6789-abcd-ef0123456784.jpg', 'Other property', 0, true);

do $$
begin
  begin
    insert into public.property_images (property_id, image_type, storage_path, alt_text)
    values ('11111111-1111-4111-8111-111111111111', 'hero',
            'properties/11111111-1111-4111-8111-111111111111/hero/abcdef01-2345-6789-abcd-ef012345678f.jpg',
            'Second hero');
    raise exception 'CHECK FAILED: a second hero row was accepted';
  exception
    when unique_violation then
      raise notice 'PASS  a second hero per property is refused by the unique index';
  end;
end $$;

-- Both source columns at once must be refused.
do $$
begin
  begin
    insert into public.property_images (property_id, image_type, storage_path, external_url, alt_text)
    values ('11111111-1111-4111-8111-111111111111', 'gallery',
            'properties/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef012345678e.jpg',
            'https://example.com/a.jpg', 'Both sources');
    raise exception 'CHECK FAILED: a row with both a storage path and an external URL was accepted';
  exception
    when check_violation then
      raise notice 'PASS  an image cannot claim both a storage path and an external URL';
  end;
end $$;

-- ======================================================================
-- 5. set_property_hero_image
-- ======================================================================

do $$
declare
  v_hero_count integer;
  v_new_hero uuid;
  v_old_type text;
begin
  perform public.set_property_hero_image(
    '11111111-1111-4111-8111-111111111111',
    'aaaa0002-0000-4000-8000-000000000002'
  );

  select count(*) into v_hero_count
  from public.property_images
  where property_id = '11111111-1111-4111-8111-111111111111'
    and image_type = 'hero';

  if v_hero_count <> 1 then
    raise exception 'CHECK FAILED: % hero rows after promotion, expected 1', v_hero_count;
  end if;

  select id into v_new_hero
  from public.property_images
  where property_id = '11111111-1111-4111-8111-111111111111'
    and image_type = 'hero';

  if v_new_hero <> 'aaaa0002-0000-4000-8000-000000000002' then
    raise exception 'CHECK FAILED: wrong row is hero after promotion';
  end if;

  select image_type into v_old_type
  from public.property_images
  where id = 'aaaa0001-0000-4000-8000-000000000001';

  if v_old_type <> 'gallery' then
    raise exception 'CHECK FAILED: previous hero was demoted to %, expected gallery', v_old_type;
  end if;

  raise notice 'PASS  set_property_hero_image promotes and demotes atomically';
end $$;

-- An image from another property must be refused (IDOR).
do $$
begin
  begin
    perform public.set_property_hero_image(
      '11111111-1111-4111-8111-111111111111',
      'bbbb0001-0000-4000-8000-000000000001'
    );
    raise exception 'CHECK FAILED: an image from another property was made hero';
  exception
    when sqlstate 'PT422' then
      raise notice 'PASS  set_property_hero_image refuses an image from another property';
  end;
end $$;

-- ======================================================================
-- 6. reorder_property_images
-- ======================================================================

-- Reset a known two-item gallery group.
update public.property_images set image_type = 'gallery', sort_order = 0
  where id = 'aaaa0001-0000-4000-8000-000000000001';
update public.property_images set image_type = 'gallery', sort_order = 1
  where id = 'aaaa0003-0000-4000-8000-000000000003';
update public.property_images set image_type = 'hero', sort_order = 0
  where id = 'aaaa0002-0000-4000-8000-000000000002';

do $$
declare
  v_first uuid;
begin
  perform public.reorder_property_images(
    '11111111-1111-4111-8111-111111111111',
    'gallery',
    array['aaaa0003-0000-4000-8000-000000000003',
          'aaaa0001-0000-4000-8000-000000000001']::uuid[]
  );

  select id into v_first
  from public.property_images
  where property_id = '11111111-1111-4111-8111-111111111111'
    and image_type = 'gallery'
  order by sort_order
  limit 1;

  if v_first <> 'aaaa0003-0000-4000-8000-000000000003' then
    raise exception 'CHECK FAILED: reorder did not apply the supplied order';
  end if;

  raise notice 'PASS  reorder_property_images applies the supplied order';
end $$;

-- An id from another property must be refused (IDOR).
do $$
begin
  begin
    perform public.reorder_property_images(
      '11111111-1111-4111-8111-111111111111',
      'gallery',
      array['aaaa0001-0000-4000-8000-000000000001',
            'bbbb0001-0000-4000-8000-000000000001']::uuid[]
    );
    raise exception 'CHECK FAILED: reorder accepted an id from another property';
  exception
    when sqlstate 'PT422' then
      raise notice 'PASS  reorder refuses an id from another property';
  end;
end $$;

-- An id from a different category must be refused.
do $$
begin
  begin
    perform public.reorder_property_images(
      '11111111-1111-4111-8111-111111111111',
      'gallery',
      array['aaaa0001-0000-4000-8000-000000000001',
            'aaaa0002-0000-4000-8000-000000000002']::uuid[]
    );
    raise exception 'CHECK FAILED: reorder accepted an id from another category';
  exception
    when sqlstate 'PT422' then
      raise notice 'PASS  reorder refuses an id from another category';
  end;
end $$;

-- A duplicate must be refused.
do $$
begin
  begin
    perform public.reorder_property_images(
      '11111111-1111-4111-8111-111111111111',
      'gallery',
      array['aaaa0001-0000-4000-8000-000000000001',
            'aaaa0001-0000-4000-8000-000000000001']::uuid[]
    );
    raise exception 'CHECK FAILED: reorder accepted a duplicate id';
  exception
    when sqlstate 'PT422' then
      raise notice 'PASS  reorder refuses a duplicate id';
  end;
end $$;

-- A non-admin must not be able to reorder.
do $$
begin
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';

  begin
    perform public.reorder_property_images(
      '11111111-1111-4111-8111-111111111111',
      'gallery',
      array['aaaa0001-0000-4000-8000-000000000001']::uuid[]
    );
    raise exception 'CHECK FAILED: a non-admin reordered media';
  exception
    when insufficient_privilege then
      raise notice 'PASS  reorder refuses a non-administrator';
  end;
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

-- ======================================================================
-- 7. audit_log is append-only
-- ======================================================================

insert into public.audit_log (user_id, action, entity_type, entity_id)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'uploaded', 'property_image',
        'aaaa0001-0000-4000-8000-000000000001');

do $$
begin
  begin
    update public.audit_log set action = 'created' where entity_type = 'property_image';
    raise exception 'CHECK FAILED: audit_log accepted an UPDATE';
  exception
    when insufficient_privilege then
      raise notice 'PASS  audit_log refuses UPDATE';
  end;

  begin
    delete from public.audit_log where entity_type = 'property_image';
    raise exception 'CHECK FAILED: audit_log accepted a DELETE';
  exception
    when insufficient_privilege then
      raise notice 'PASS  audit_log refuses DELETE';
  end;
end $$;

-- The media action names widened in 0009 must be accepted.
do $$
declare
  v_action text;
begin
  foreach v_action in array array['uploaded', 'replaced', 'reordered', 'hero_set', 'link_added'] loop
    insert into public.audit_log (action, entity_type) values (v_action, 'check');
  end loop;

  raise notice 'PASS  audit_log accepts the media action names';
end $$;

-- ======================================================================
-- 8. Publish blockers
-- ======================================================================

do $$
declare
  v_blockers text[];
begin
  -- Alpha has no location settings and no projection, so both should be
  -- reported.
  v_blockers := public.property_publish_blockers('11111111-1111-4111-8111-111111111111');

  if array_length(v_blockers, 1) is null then
    raise exception 'CHECK FAILED: a property with no location reported no blockers';
  end if;

  raise notice 'PASS  property_publish_blockers reports % outstanding item(s) for an incomplete property',
    array_length(v_blockers, 1);

  -- A property that does not exist.
  v_blockers := public.property_publish_blockers('99999999-9999-4999-8999-999999999999');

  if array_length(v_blockers, 1) <> 1 then
    raise exception 'CHECK FAILED: a missing property did not report exactly one blocker';
  end if;

  raise notice 'PASS  property_publish_blockers handles a missing property';
end $$;

-- ======================================================================
-- 9. Media metadata constraints
-- ======================================================================

do $$
begin
  begin
    insert into public.property_images (property_id, image_type, storage_path, width)
    values ('11111111-1111-4111-8111-111111111111', 'gallery',
            'properties/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef012345678a.jpg', 0);
    raise exception 'CHECK FAILED: a zero width was accepted';
  exception
    when check_violation then
      raise notice 'PASS  image dimensions must be positive when supplied';
  end;

  begin
    insert into public.property_images (property_id, image_type, storage_path, file_size_bytes)
    values ('11111111-1111-4111-8111-111111111111', 'gallery',
            'properties/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef012345678b.jpg', -1);
    raise exception 'CHECK FAILED: a negative file size was accepted';
  exception
    when check_violation then
      raise notice 'PASS  file size must be positive when supplied';
  end;
end $$;

-- The legacy non-ASCII category must no longer be writable.
do $$
begin
  begin
    insert into public.property_images (property_id, image_type, storage_path)
    values ('11111111-1111-4111-8111-111111111111', 'façade',
            'properties/11111111-1111-4111-8111-111111111111/facade/abcdef01-2345-6789-abcd-ef012345678c.jpg');
    raise exception 'CHECK FAILED: the non-ASCII category was accepted';
  exception
    when check_violation then
      raise notice 'PASS  image_type no longer accepts the non-ASCII value';
  end;
end $$;

-- ======================================================================
-- 10. Storage write policy predicate
-- ======================================================================
--
-- The policy body is `bucket_id = 'property-media' AND is_admin() AND
-- is_valid_property_media_path(name)`. Supabase's Storage API is not present
-- here, so the predicate is evaluated directly — this checks the SQL that
-- gates writes, not the API in front of it.

do $$
declare
  v_ok boolean;
begin
  v_ok := ('property-media' = 'property-media')
    and public.is_admin()
    and public.is_valid_property_media_path(
      'properties/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef0123456789.jpg');

  if not v_ok then
    raise exception 'CHECK FAILED: the write predicate refused a legitimate upload';
  end if;

  v_ok := ('property-media' = 'property-media')
    and public.is_admin()
    and public.is_valid_property_media_path('properties/../../secrets.jpg');

  if v_ok then
    raise exception 'CHECK FAILED: the write predicate accepted a traversal path';
  end if;

  raise notice 'PASS  the storage write predicate accepts valid paths and refuses traversal';
end $$;

-- Confirm the policies are actually attached to storage.objects.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'admins upload valid property media paths',
      'admins update valid property media paths',
      'admins delete valid property media paths'
    );

  if v_count <> 3 then
    raise exception 'CHECK FAILED: expected 3 hardened storage policies, found %', v_count;
  end if;

  -- And that the superseded, path-blind versions are gone.
  select count(*) into v_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'admins can upload property media',
      'admins can update property media',
      'admins can delete property media'
    );

  if v_count <> 0 then
    raise exception 'CHECK FAILED: % path-blind storage policies remain', v_count;
  end if;

  raise notice 'PASS  the three hardened storage policies replaced the path-blind ones';
end $$;

-- ======================================================================
do $$
begin
  raise notice '';
  raise notice 'All checks passed.';
end $$;
