-- Verification harness — Phase 6.3 checks
--
-- Asserts what migration 0010 claims. Run after 00_supabase_stubs.sql, all
-- migrations, and 01_checks.sql (which seeds the administrator and the two
-- properties used here).
--
-- Every check raises on failure, so with ON_ERROR_STOP=1 a clean run means
-- every assertion held.

\set ON_ERROR_STOP on

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

-- ======================================================================
-- 1. Hero publication guard
-- ======================================================================

-- A draft, an undescribed image, and a floor plan — each a candidate that must
-- be refused for a different reason.
insert into public.property_images
  (id, property_id, image_type, storage_path, alt_text, is_published, sort_order)
values
  ('cccc0001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'gallery', 'properties/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef0123456791.jpg',
   'A draft image', false, 10),
  ('cccc0002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'gallery', 'properties/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef0123456792.jpg',
   null, true, 11),
  ('cccc0003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'floor_plan', 'properties/11111111-1111-4111-8111-111111111111/floor-plans/abcdef01-2345-6789-abcd-ef0123456793.png',
   'Ground floor plan', true, 0),
  ('cccc0004-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'gallery', 'properties/11111111-1111-4111-8111-111111111111/gallery/abcdef01-2345-6789-abcd-ef0123456794.jpg',
   'Street view of the completed home', true, 12);

do $$
begin
  -- Draft
  begin
    perform public.set_property_hero_image(
      '11111111-1111-4111-8111-111111111111',
      'cccc0001-0000-4000-8000-000000000001');
    raise exception 'CHECK FAILED: a draft image was made hero';
  exception when check_violation then
    raise notice 'PASS  hero selection refuses a draft image';
  end;

  -- No alt text
  begin
    perform public.set_property_hero_image(
      '11111111-1111-4111-8111-111111111111',
      'cccc0002-0000-4000-8000-000000000002');
    raise exception 'CHECK FAILED: an undescribed image was made hero';
  exception when check_violation then
    raise notice 'PASS  hero selection refuses an image with no alt text';
  end;

  -- Floor plan
  begin
    perform public.set_property_hero_image(
      '11111111-1111-4111-8111-111111111111',
      'cccc0003-0000-4000-8000-000000000003');
    raise exception 'CHECK FAILED: a floor plan was made hero';
  exception when check_violation then
    raise notice 'PASS  hero selection refuses a floor plan';
  end;

  -- Another property's image
  begin
    perform public.set_property_hero_image(
      '11111111-1111-4111-8111-111111111111',
      'bbbb0001-0000-4000-8000-000000000001');
    raise exception 'CHECK FAILED: another property''s image was made hero';
  exception when check_violation then
    raise notice 'PASS  hero selection refuses an image from another property';
  end;
end $$;

-- The valid candidate must be accepted, and must be the only hero afterwards.
do $$
declare
  v_hero_count integer;
  v_hero uuid;
begin
  perform public.set_property_hero_image(
    '11111111-1111-4111-8111-111111111111',
    'cccc0004-0000-4000-8000-000000000004');

  -- There is no min(uuid) in PostgreSQL, so the id is aggregated as text and
  -- cast back. With one row expected either way, this is exact.
  select count(*), min(id::text)::uuid into v_hero_count, v_hero
  from public.property_images
  where property_id = '11111111-1111-4111-8111-111111111111'
    and image_type = 'hero';

  if v_hero_count <> 1 then
    raise exception 'CHECK FAILED: % hero rows after promotion, expected 1', v_hero_count;
  end if;

  if v_hero <> 'cccc0004-0000-4000-8000-000000000004' then
    raise exception 'CHECK FAILED: the wrong row is hero';
  end if;

  raise notice 'PASS  a published, described photograph becomes the sole hero';
end $$;

-- Unpublishing the hero is allowed, and leaves the designation in place. The
-- public mapper filters it out, so the property falls back to the drawing.
do $$
declare
  v_type text;
begin
  update public.property_images
  set is_published = false
  where id = 'cccc0004-0000-4000-8000-000000000004';

  select image_type into v_type
  from public.property_images
  where id = 'cccc0004-0000-4000-8000-000000000004';

  if v_type <> 'hero' then
    raise exception 'CHECK FAILED: unpublishing the hero changed its designation to %', v_type;
  end if;

  raise notice 'PASS  unpublishing the hero keeps its designation (admin surfaces the state)';

  -- Restore for later checks.
  update public.property_images
  set is_published = true
  where id = 'cccc0004-0000-4000-8000-000000000004';
end $$;

-- Deleting the hero must leave the property with none, not with a broken
-- reference.
do $$
declare
  v_count integer;
begin
  delete from public.property_images
  where id = 'cccc0004-0000-4000-8000-000000000004';

  select count(*) into v_count
  from public.property_images
  where property_id = '11111111-1111-4111-8111-111111111111'
    and image_type = 'hero';

  if v_count <> 0 then
    raise exception 'CHECK FAILED: % hero rows remain after deletion', v_count;
  end if;

  raise notice 'PASS  deleting the hero leaves the property with no hero';
end $$;

-- ======================================================================
-- 2. Atomic publishing
-- ======================================================================

-- Alpha has no location settings and no projection, so it must stay a draft.
do $$
declare
  v_blockers text[];
  v_published boolean;
begin
  v_blockers := public.publish_property_if_ready('11111111-1111-4111-8111-111111111111');

  if coalesce(array_length(v_blockers, 1), 0) = 0 then
    raise exception 'CHECK FAILED: an incomplete property reported no blockers';
  end if;

  select is_published into v_published
  from public.properties
  where id = '11111111-1111-4111-8111-111111111111';

  if v_published then
    raise exception 'CHECK FAILED: an incomplete property was published';
  end if;

  raise notice 'PASS  publish_property_if_ready refuses an incomplete property and writes nothing';
end $$;

-- Give Beta everything it needs, then publish it.
insert into public.property_location_settings
  (property_id, location_visibility, public_marker_mode, show_suburb, show_postcode)
values ('22222222-2222-4222-8222-222222222222', 'suburb', 'automatic', true, true)
on conflict (property_id) do nothing;

insert into public.property_public_locations
  (property_id, location_visibility, marker_mode, allow_directions)
values ('22222222-2222-4222-8222-222222222222', 'suburb', 'automatic', false)
on conflict (property_id) do nothing;

do $$
declare
  v_blockers text[];
  v_published boolean;
  v_audit integer;
begin
  v_blockers := public.publish_property_if_ready('22222222-2222-4222-8222-222222222222');

  if coalesce(array_length(v_blockers, 1), 0) <> 0 then
    raise exception 'CHECK FAILED: a complete property reported blockers: %', v_blockers;
  end if;

  select is_published into v_published
  from public.properties
  where id = '22222222-2222-4222-8222-222222222222';

  if not v_published then
    raise exception 'CHECK FAILED: a ready property was not published';
  end if;

  -- The audit entry is written inside the same transaction as the update.
  select count(*) into v_audit
  from public.audit_log
  where action = 'published'
    and entity_type = 'property'
    and entity_id = '22222222-2222-4222-8222-222222222222';

  if v_audit < 1 then
    raise exception 'CHECK FAILED: publishing recorded no audit entry';
  end if;

  raise notice 'PASS  publish_property_if_ready publishes a ready property and audits it atomically';
end $$;

-- A property that no longer exists.
do $$
declare
  v_blockers text[];
begin
  v_blockers := public.publish_property_if_ready('99999999-9999-4999-8999-999999999999');

  if coalesce(array_length(v_blockers, 1), 0) <> 1 then
    raise exception 'CHECK FAILED: a missing property did not report exactly one blocker';
  end if;

  raise notice 'PASS  publish_property_if_ready handles a missing property';
end $$;

-- A non-admin must not be able to publish.
do $$
begin
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';

  begin
    perform public.publish_property_if_ready('22222222-2222-4222-8222-222222222222');
    raise exception 'CHECK FAILED: a non-admin published a property';
  exception when insufficient_privilege then
    raise notice 'PASS  publish_property_if_ready refuses a non-administrator';
  end;
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

-- ======================================================================
-- 3. The last super administrator
-- ======================================================================
--
-- Only one active super administrator exists at this point (seeded by
-- 01_checks.sql), so every removal route must be refused.

do $$
begin
  begin
    update public.admin_users
    set is_active = false
    where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
    raise exception 'CHECK FAILED: the last super admin was deactivated';
  exception when check_violation then
    raise notice 'PASS  the last active super administrator cannot be deactivated';
  end;

  begin
    update public.admin_users
    set role = 'admin'
    where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
    raise exception 'CHECK FAILED: the last super admin was demoted';
  exception when check_violation then
    raise notice 'PASS  the last active super administrator cannot be demoted';
  end;

  begin
    delete from public.admin_users
    where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
    raise exception 'CHECK FAILED: the last super admin was deleted';
  exception when check_violation then
    raise notice 'PASS  the last active super administrator cannot be deleted';
  end;
end $$;

-- With a second active super administrator present, the first may be removed.
insert into auth.users (id, email)
values ('aaaaaaaa-0000-4000-8000-000000000003', 'second@example.com')
on conflict do nothing;

insert into public.admin_users (user_id, email, role, is_active)
values ('aaaaaaaa-0000-4000-8000-000000000003', 'second@example.com', 'super_admin', true)
on conflict do nothing;

do $$
begin
  -- Acting as the second super admin, so the self-lockout guard from 0008 is
  -- not what refuses this.
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';

  update public.admin_users
  set role = 'admin'
  where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';

  raise notice 'PASS  a super administrator can be demoted while another remains';

  -- Restore.
  update public.admin_users
  set role = 'super_admin'
  where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

-- The self-lockout guard from 0008 must still hold.
do $$
begin
  begin
    update public.admin_users
    set is_active = false
    where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
    raise exception 'CHECK FAILED: an admin deactivated themselves';
  exception when check_violation then
    raise notice 'PASS  the self-lockout guard still refuses self-deactivation';
  end;
end $$;

-- ======================================================================
-- 4. Construction updates
-- ======================================================================

do $$
begin
  begin
    insert into public.construction_updates (property_id, stage, title)
    values ('11111111-1111-4111-8111-111111111111', 'demolition', 'Not a stage');
    raise exception 'CHECK FAILED: an unknown stage was accepted';
  exception when check_violation then
    raise notice 'PASS  construction stage vocabulary is enforced';
  end;

  begin
    insert into public.construction_updates (property_id, stage, title, progress_value)
    values ('11111111-1111-4111-8111-111111111111', 'slab', 'Over range', 101);
    raise exception 'CHECK FAILED: a progress value above 100 was accepted';
  exception when check_violation then
    raise notice 'PASS  progress_value is bounded at 100';
  end;

  begin
    insert into public.construction_updates (property_id, stage, title)
    values ('11111111-1111-4111-8111-111111111111', 'slab', '   ');
    raise exception 'CHECK FAILED: a blank title was accepted';
  exception when check_violation then
    raise notice 'PASS  construction title cannot be blank';
  end;
end $$;

insert into public.construction_updates
  (id, property_id, stage, title, status, progress_value, sort_order, is_published)
values
  ('dddd0001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'planning', 'Plans approved', 'complete', 100, 0, true),
  ('dddd0002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'slab', 'Slab poured', 'complete', 100, 1, true),
  ('dddd0003-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   'frame', 'Frame up', 'in-progress', 50, 0, true);

-- One update per stage per property.
do $$
begin
  begin
    insert into public.construction_updates (property_id, stage, title)
    values ('11111111-1111-4111-8111-111111111111', 'slab', 'Second slab entry');
    raise exception 'CHECK FAILED: two updates for the same stage were accepted';
  exception when unique_violation then
    raise notice 'PASS  one construction update per stage per property';
  end;
end $$;

do $$
declare
  v_first uuid;
begin
  perform public.reorder_construction_updates(
    '11111111-1111-4111-8111-111111111111',
    array['dddd0002-0000-4000-8000-000000000002',
          'dddd0001-0000-4000-8000-000000000001']::uuid[]);

  select id into v_first
  from public.construction_updates
  where property_id = '11111111-1111-4111-8111-111111111111'
  order by sort_order
  limit 1;

  if v_first <> 'dddd0002-0000-4000-8000-000000000002' then
    raise exception 'CHECK FAILED: construction reorder did not apply';
  end if;

  raise notice 'PASS  reorder_construction_updates applies the supplied order';
end $$;

do $$
begin
  begin
    perform public.reorder_construction_updates(
      '11111111-1111-4111-8111-111111111111',
      array['dddd0001-0000-4000-8000-000000000001',
            'dddd0003-0000-4000-8000-000000000003']::uuid[]);
    raise exception 'CHECK FAILED: construction reorder accepted another property''s update';
  exception when check_violation then
    raise notice 'PASS  construction reorder refuses an update from another property';
  end;

  begin
    perform public.reorder_construction_updates(
      '11111111-1111-4111-8111-111111111111',
      array['dddd0001-0000-4000-8000-000000000001',
            'dddd0001-0000-4000-8000-000000000001']::uuid[]);
    raise exception 'CHECK FAILED: construction reorder accepted a duplicate';
  exception when check_violation then
    raise notice 'PASS  construction reorder refuses a duplicate';
  end;
end $$;

-- ======================================================================
-- 5. Property features
-- ======================================================================

do $$
begin
  begin
    insert into public.property_features (property_id, category, label)
    values ('11111111-1111-4111-8111-111111111111', 'marketing', 'Not a category');
    raise exception 'CHECK FAILED: an unknown feature category was accepted';
  exception when check_violation then
    raise notice 'PASS  feature category vocabulary is enforced';
  end;
end $$;

insert into public.property_features
  (id, property_id, category, label, value, sort_order, is_published)
values
  ('eeee0001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'energy', 'Energy rating', '7 stars', 0, true),
  ('eeee0002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'energy', 'Solar', '6.6 kW system', 1, true),
  ('eeee0003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'inclusion', 'Kitchen', '40 mm stone benchtops', 0, true);

do $$
declare
  v_first uuid;
begin
  perform public.reorder_property_features(
    '11111111-1111-4111-8111-111111111111',
    'energy',
    array['eeee0002-0000-4000-8000-000000000002',
          'eeee0001-0000-4000-8000-000000000001']::uuid[]);

  select id into v_first
  from public.property_features
  where property_id = '11111111-1111-4111-8111-111111111111'
    and category = 'energy'
  order by sort_order
  limit 1;

  if v_first <> 'eeee0002-0000-4000-8000-000000000002' then
    raise exception 'CHECK FAILED: feature reorder did not apply';
  end if;

  raise notice 'PASS  reorder_property_features applies the supplied order';
end $$;

do $$
begin
  -- An id from a different category must be refused: moving it would silently
  -- change which group it appears under.
  begin
    perform public.reorder_property_features(
      '11111111-1111-4111-8111-111111111111',
      'energy',
      array['eeee0001-0000-4000-8000-000000000001',
            'eeee0003-0000-4000-8000-000000000003']::uuid[]);
    raise exception 'CHECK FAILED: feature reorder accepted an id from another category';
  exception when check_violation then
    raise notice 'PASS  feature reorder refuses an id from another category';
  end;
end $$;

-- ======================================================================
-- 6. SEO overrides
-- ======================================================================

do $$
begin
  begin
    update public.properties
    set seo_meta_title = repeat('x', 71)
    where id = '11111111-1111-4111-8111-111111111111';
    raise exception 'CHECK FAILED: an over-long meta title was accepted';
  exception when check_violation then
    raise notice 'PASS  seo_meta_title length is bounded';
  end;

  begin
    update public.properties
    set seo_canonical_url = 'http://example.com/insecure'
    where id = '11111111-1111-4111-8111-111111111111';
    raise exception 'CHECK FAILED: a non-https canonical was accepted';
  exception when check_violation then
    raise notice 'PASS  seo_canonical_url must be https';
  end;
end $$;

-- Deleting the chosen OG image must clear the override, not dangle.
do $$
declare
  v_og uuid;
begin
  update public.properties
  set seo_og_image_id = 'cccc0001-0000-4000-8000-000000000001'
  where id = '11111111-1111-4111-8111-111111111111';

  delete from public.property_images
  where id = 'cccc0001-0000-4000-8000-000000000001';

  select seo_og_image_id into v_og
  from public.properties
  where id = '11111111-1111-4111-8111-111111111111';

  if v_og is not null then
    raise exception 'CHECK FAILED: seo_og_image_id still references a deleted image';
  end if;

  raise notice 'PASS  deleting the OG image clears the override';
end $$;

-- ======================================================================
-- 7. Site settings
-- ======================================================================

insert into public.site_settings (id, company_name, company_email, enquiry_recipient_email)
values (true, 'Dreame Homes', 'hello@example.com', 'sales@example.com');

do $$
begin
  begin
    insert into public.site_settings (id, company_name) values (true, 'Duplicate');
    raise exception 'CHECK FAILED: a second settings row was accepted';
  exception when unique_violation then
    raise notice 'PASS  site_settings holds exactly one row';
  end;

  begin
    update public.site_settings set company_email = 'not-an-email';
    raise exception 'CHECK FAILED: an invalid company email was accepted';
  exception when check_violation then
    raise notice 'PASS  site_settings validates the company email';
  end;

  begin
    update public.site_settings set social_facebook = 'http://facebook.com/x';
    raise exception 'CHECK FAILED: a non-https social link was accepted';
  exception when check_violation then
    raise notice 'PASS  site_settings social links must be https';
  end;

  begin
    update public.site_settings
    set default_meta_title = repeat('x', 71);
    raise exception 'CHECK FAILED: an over-long default title was accepted';
  exception when check_violation then
    raise notice 'PASS  site_settings bounds the default meta title';
  end;
end $$;

-- The public view must not expose the enquiry routing address.
do $$
declare
  v_has_column integer;
begin
  select count(*) into v_has_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'site_settings_public'
    and column_name = 'enquiry_recipient_email';

  if v_has_column <> 0 then
    raise exception 'CHECK FAILED: site_settings_public exposes enquiry_recipient_email';
  end if;

  raise notice 'PASS  site_settings_public omits the enquiry routing address';
end $$;

-- anon may read the view and must not reach the table.
do $$
begin
  if not has_table_privilege('anon', 'public.site_settings_public', 'select') then
    raise exception 'CHECK FAILED: anon cannot read site_settings_public';
  end if;

  if has_table_privilege('anon', 'public.site_settings', 'select') then
    raise exception 'CHECK FAILED: anon can read the site_settings table directly';
  end if;

  raise notice 'PASS  anon reads only the public settings view';
end $$;

-- ======================================================================
-- 8. Enquiries
-- ======================================================================

insert into public.enquiries (id, property_id, name, email, message, status)
values ('ffff0001-0000-4000-8000-000000000001',
        '22222222-2222-4222-8222-222222222222',
        'Test Person', 'test@example.com', 'Interested in this home.', 'new');

do $$
begin
  begin
    update public.enquiries
    set admin_notes = repeat('x', 4001)
    where id = 'ffff0001-0000-4000-8000-000000000001';
    raise exception 'CHECK FAILED: an over-long admin note was accepted';
  exception when check_violation then
    raise notice 'PASS  enquiry admin_notes length is bounded';
  end;
end $$;

-- A submitter must not be able to write staff-facing notes. The table-level
-- INSERT grant covers every column, so the policy is what stops this.
do $$
begin
  set local role anon;

  begin
    insert into public.enquiries
      (property_id, name, email, message, admin_notes)
    values ('22222222-2222-4222-8222-222222222222',
            'Spammer', 'spam@example.com',
            'Interested in this home.',
            'Vetted by the sales team — call back urgently.');
    reset role;
    raise exception 'CHECK FAILED: anon inserted an enquiry carrying admin_notes';
  exception when insufficient_privilege then
    reset role;
    raise notice 'PASS  anon cannot supply admin_notes on insert';
  end;
end $$;

-- The same insert without notes must still succeed, or the fix above has
-- broken the public form.
do $$
begin
  set local role anon;

  insert into public.enquiries (property_id, name, email, message)
  values ('22222222-2222-4222-8222-222222222222',
          'Genuine Visitor', 'visitor@example.com',
          'Is this home still available?');

  reset role;
  raise notice 'PASS  anon may still submit an ordinary enquiry';
exception when others then
  reset role;
  raise exception 'CHECK FAILED: anon can no longer submit an enquiry (%)', sqlerrm;
end $$;

-- Anonymous visitors must be able to insert and nothing else.
do $$
begin
  if not has_table_privilege('anon', 'public.enquiries', 'insert') then
    raise exception 'CHECK FAILED: anon cannot insert an enquiry';
  end if;

  if has_table_privilege('anon', 'public.enquiries', 'select') then
    raise exception 'CHECK FAILED: anon can read enquiries';
  end if;

  if has_table_privilege('anon', 'public.enquiries', 'update') then
    raise exception 'CHECK FAILED: anon can update enquiries';
  end if;

  if has_table_privilege('anon', 'public.enquiries', 'delete') then
    raise exception 'CHECK FAILED: anon can delete enquiries';
  end if;

  raise notice 'PASS  anon may insert an enquiry and nothing else';
end $$;

-- No delete policy exists for administrators either: enquiries are archived,
-- not destroyed.
do $$
declare
  v_delete_policies integer;
begin
  select count(*) into v_delete_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'enquiries'
    and cmd = 'DELETE';

  if v_delete_policies <> 0 then
    raise exception 'CHECK FAILED: % DELETE policy exists on enquiries', v_delete_policies;
  end if;

  raise notice 'PASS  no DELETE policy on enquiries — archive rather than destroy';
end $$;

-- ======================================================================
do $$
begin
  raise notice '';
  raise notice 'All Phase 6.3 checks passed.';
end $$;
