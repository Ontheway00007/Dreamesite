-- Phase 6.2 — Media management
--
-- Completes the media system and closes three defects found in review:
--
--   1. The Storage write policies from 0007 checked only the bucket and
--      `is_admin()`. Any administrator could therefore write to any path in
--      the bucket — overwriting another property's hero, or creating objects
--      with arbitrary names outside the documented layout. The path itself
--      was never validated.
--   2. Nothing stopped a property having several rows with
--      `image_type = 'hero'`, so "the hero image" was whichever row the
--      mapper happened to encounter first.
--   3. `image_type` used the non-ASCII value 'façade', which has to be
--      URL-encoded in PostgREST filters and cannot reliably be typed.
--
-- It also adds the metadata columns the media manager needs, and the two
-- transactional functions that hero selection and reordering require.

-- ======================================================================
-- 1. Media metadata
-- ======================================================================
--
-- Recorded at upload time so the admin UI can show file details without
-- fetching the object, and so a future resizing pipeline has dimensions to
-- work from. All nullable: rows created before this migration, and
-- externally hosted media, legitimately have none of it.

alter table public.property_images
  add column if not exists original_filename text,
  add column if not exists mime_type text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists file_size_bytes bigint;

comment on column public.property_images.original_filename is
  'The name the administrator uploaded, kept for recognition only. Never used as the storage key.';
comment on column public.property_images.width is
  'Pixel dimensions when known. Lets the admin UI warn about undersized hero photography.';

alter table public.property_images
  add constraint property_images_dimensions_positive check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  add constraint property_images_size_positive check (
    file_size_bytes is null or file_size_bytes > 0
  );

alter table public.property_resources
  add column if not exists caption text,
  add column if not exists original_filename text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint;

alter table public.property_resources
  add constraint property_resources_size_positive check (
    file_size_bytes is null or file_size_bytes > 0
  );

-- A resource is either hosted by us or hosted elsewhere, never described as
-- both. `resource_target_present` already requires at least one; this
-- forbids both at once, which would make "where does this file live?"
-- ambiguous for every reader.
alter table public.property_resources
  add constraint property_resources_single_source check (
    not (url is not null and storage_path is not null)
  );

-- The same rule for images.
alter table public.property_images
  add constraint property_images_single_source check (
    not (storage_path is not null and external_url is not null)
  );

-- ======================================================================
-- 2. Normalise the 'façade' category to ASCII
-- ======================================================================
--
-- Done as a data migration followed by a tightened constraint rather than by
-- editing 0001, which has already been applied. Existing rows are rewritten
-- first so the narrower constraint validates cleanly.

update public.property_images
set image_type = 'facade'
where image_type = 'façade';

alter table public.property_images
  drop constraint if exists property_images_image_type_check;

alter table public.property_images
  add constraint property_images_image_type_check check (
    image_type in ('hero', 'gallery', 'facade', 'construction', 'floor_plan', 'drone')
  );

-- ======================================================================
-- 3. One hero per property
-- ======================================================================
--
-- Hero selection is Option A from the brief: the hero is the row whose
-- `image_type` is 'hero'. There is deliberately no competing `is_hero`
-- boolean — two mechanisms would eventually disagree.
--
-- Any pre-existing duplicates are demoted to gallery before the index is
-- created, keeping the oldest row as the hero. Without this the index
-- creation would fail on a database that already had two.

with ranked as (
  select
    id,
    row_number() over (
      partition by property_id
      order by created_at, id
    ) as position
  from public.property_images
  where image_type = 'hero'
)
update public.property_images
set image_type = 'gallery'
where id in (select id from ranked where position > 1);

create unique index if not exists property_images_one_hero_per_property
  on public.property_images (property_id)
  where image_type = 'hero';

comment on index public.property_images_one_hero_per_property is
  'At most one hero row per property. Whether it is visible is decided by is_published.';

-- Supports the detail page reading published media in display order.
create index if not exists property_images_published_order_idx
  on public.property_images (property_id, image_type, sort_order)
  where is_published;

create index if not exists property_resources_published_order_idx
  on public.property_resources (property_id, resource_type, sort_order)
  where is_published;

-- ======================================================================
-- 4. Storage path validation
-- ======================================================================
--
-- The layout every stored object must follow:
--
--   properties/<property-uuid>/<category>/<uuid>.<ext>
--
-- Validating the shape is what makes the write policies meaningful. Because
-- each segment is constrained to a UUID or a fixed category word, traversal
-- sequences cannot match — '..' is not a UUID — so path escape is structurally
-- impossible rather than merely filtered.
--
-- Requiring a generated UUID as the filename also removes a class of
-- problems that come with original filenames: collisions, double extensions
-- such as `.php.jpg`, unicode look-alikes, and names that reveal something
-- about the property.
--
-- PL/pgSQL rather than SQL because the property-id cast must happen only
-- after the shape check has passed. SQL does not guarantee that `AND`
-- short-circuits, so a malformed path could otherwise raise a cast error
-- instead of returning false.

create or replace function public.is_valid_property_media_path(object_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_property_id uuid;
begin
  if object_name is null then
    return false;
  end if;

  -- Anchored, so nothing may precede or follow the expected layout.
  -- Case-insensitive on the hex and extension: we always generate lowercase,
  -- but an object created through the Supabase dashboard should not be
  -- rejected for casing alone.
  if object_name !~* (
    '^properties/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '(hero|gallery|facade|construction|floor-plans|drone|documents)/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '\.[a-z0-9]{2,5}$'
  ) then
    return false;
  end if;

  begin
    v_property_id := split_part(object_name, '/', 2)::uuid;
  exception
    when others then
      return false;
  end;

  -- The object must belong to a property that exists. SECURITY DEFINER so
  -- this answer does not depend on the caller's RLS view of `properties`;
  -- it returns only a boolean about path validity, never property data.
  return exists (
    select 1 from public.properties where id = v_property_id
  );
end;
$$;

comment on function public.is_valid_property_media_path(text) is
  'True when a storage object name follows properties/<property-uuid>/<category>/<uuid>.<ext> and names a property that exists. Used by the property-media write policies.';

revoke all on function public.is_valid_property_media_path(text) from public;
grant execute on function public.is_valid_property_media_path(text) to authenticated;

-- ======================================================================
-- 5. Replace the Storage write policies
-- ======================================================================
--
-- The originals allowed any admin to write anywhere in the bucket. These
-- additionally require the documented path layout.
--
-- Note on reads: `property-media` is a public bucket, so its objects are
-- world-readable by URL. The SELECT policies from 0004 are defence in depth
-- for a future switch to a private bucket — they do not restrict access to
-- an object whose URL is known, and nothing in this system should be
-- documented as though they do. Draft media is protected by not publishing
-- its URL, and by the row-level policies on `property_images` /
-- `property_resources` which prevent an anonymous reader from discovering it.

drop policy if exists "admins can upload property media" on storage.objects;
drop policy if exists "admins can update property media" on storage.objects;
drop policy if exists "admins can delete property media" on storage.objects;

create policy "admins upload valid property media paths"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'property-media'
    and public.is_admin()
    and public.is_valid_property_media_path(name)
  );

-- Both USING and WITH CHECK: the first decides which objects may be
-- targeted, the second which paths the result may occupy. Without the
-- second, an admin could move a valid object to an invalid name.
create policy "admins update valid property media paths"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'property-media'
    and public.is_admin()
    and public.is_valid_property_media_path(name)
  )
  with check (
    bucket_id = 'property-media'
    and public.is_admin()
    and public.is_valid_property_media_path(name)
  );

create policy "admins delete valid property media paths"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'property-media'
    and public.is_admin()
    and public.is_valid_property_media_path(name)
  );

-- ======================================================================
-- 6. Hero selection
-- ======================================================================
--
-- Promoting a new hero and demoting the old one must happen together: a
-- failure between the two would leave the property with two heroes (which
-- the unique index refuses) or none (which loses the card image).
--
-- SECURITY INVOKER, so RLS still applies and this grants no privilege the
-- caller lacks. The admin check exists to fail with a readable message
-- rather than an opaque policy violation.

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
  v_exists boolean;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Ownership check. Passing an image id from another property is the
  -- obvious IDOR attempt here, and this is what refuses it.
  select exists (
    select 1
    from public.property_images
    where id = p_image_id
      and property_id = p_property_id
  ) into v_exists;

  if not v_exists then
    raise exception 'That image does not belong to this property.'
      using errcode = 'check_violation';
  end if;

  -- Demote before promoting: the unique index is checked per statement, so
  -- promoting first would collide with the existing hero.
  update public.property_images
  set image_type = 'gallery'
  where property_id = p_property_id
    and image_type = 'hero'
    and id <> p_image_id;

  update public.property_images
  set image_type = 'hero'
  where id = p_image_id;

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
  'Promotes one image to hero and demotes the previous hero to gallery, in a single transaction.';

revoke all on function public.set_property_hero_image(uuid, uuid) from public;
grant execute on function public.set_property_hero_image(uuid, uuid) to authenticated;

-- ======================================================================
-- 7. Reordering
-- ======================================================================
--
-- Reordering rewrites `sort_order` across several rows. Applied one row at a
-- time, an interruption leaves a partial order — two items claiming the same
-- position, or a gap. Both functions below rewrite the whole group in one
-- statement.
--
-- `with ordinality` is what makes the array's order authoritative; a plain
-- `unnest` makes no ordering promise.

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
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_supplied = 0 then
    return;
  end if;

  select count(distinct value) into v_distinct
  from unnest(p_image_ids) as value;

  if v_distinct <> v_supplied then
    raise exception 'The new order lists the same image more than once.'
      using errcode = 'check_violation';
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
      using errcode = 'check_violation';
  end if;

  update public.property_images as target
  set sort_order = ordered.position - 1
  from unnest(p_image_ids) with ordinality as ordered(id, position)
  where target.id = ordered.id;
end;
$$;

comment on function public.reorder_property_images(uuid, text, uuid[]) is
  'Rewrites sort_order for one image group from the supplied order. Rejects ids belonging to another property or category.';

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
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_supplied = 0 then
    return;
  end if;

  select count(distinct value) into v_distinct
  from unnest(p_resource_ids) as value;

  if v_distinct <> v_supplied then
    raise exception 'The new order lists the same item more than once.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_owned
  from public.property_resources
  where id = any (p_resource_ids)
    and property_id = p_property_id
    and resource_type = p_resource_type;

  if v_owned <> v_supplied then
    raise exception 'Those items do not all belong to this property group.'
      using errcode = 'check_violation';
  end if;

  update public.property_resources as target
  set sort_order = ordered.position - 1
  from unnest(p_resource_ids) with ordinality as ordered(id, position)
  where target.id = ordered.id;
end;
$$;

comment on function public.reorder_property_resources(uuid, text, uuid[]) is
  'Rewrites sort_order for one resource group from the supplied order. Rejects ids belonging to another property or type.';

revoke all on function public.reorder_property_resources(uuid, text, uuid[]) from public;
grant execute on function public.reorder_property_resources(uuid, text, uuid[]) to authenticated;

-- ======================================================================
-- 8. Audit actions for media
-- ======================================================================
--
-- The 0006 constraint allowed six verbs, none of which describe a media
-- event. Widening it keeps every existing value legal, so no row can fail
-- the new constraint. The append-only triggers from 0008 are unaffected:
-- they block DML, and this is DDL.

alter table public.audit_log
  drop constraint if exists audit_log_action_check;

alter table public.audit_log
  add constraint audit_log_action_check check (
    action in (
      -- Existing
      'created', 'updated', 'published', 'unpublished', 'deleted', 'archived',
      -- Media
      'uploaded', 'replaced', 'reordered', 'hero_set', 'link_added'
    )
  );

comment on table public.audit_log is
  'Append-only audit trail covering property and media actions. UPDATE, DELETE and TRUNCATE are revoked and additionally refused by trigger.';
