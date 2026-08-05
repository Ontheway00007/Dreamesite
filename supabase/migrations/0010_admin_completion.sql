-- Phase 6.3 — Admin completion
--
-- Two kinds of change:
--
--   Corrections to Phase 6.2
--     * The hero-selection RPC accepted a draft image, an image with no alt
--       text, and a floor plan. Selecting any of them produced a hero that
--       either never rendered or rendered a line drawing on every card.
--
--   Corrections to Phase 6.1
--     * Publishing read the blockers and then updated the row in two separate
--       statements, so a property could become publishable-then-unpublishable
--       between the two. Now one locked transaction.
--     * Nothing stopped the last active super administrator being demoted,
--       deactivated or deleted, which would lock everyone out permanently.
--
--   New surface for this phase
--     * SEO overrides per property
--     * Typed site settings, with a public projection
--     * Internal notes on enquiries
--     * Reorder functions for construction updates and features

-- ======================================================================
-- 1. Hero selection — publication guard
-- ======================================================================
--
-- Replaces the 0009 version. The rule, stated once:
--
--   **An image must already be published, and already have alt text, before
--   it can become the hero.**
--
-- The alternative — publishing it automatically on selection — was rejected.
-- "Set as main image" would then silently make a photograph public, which is a
-- different and larger decision than choosing which of the already-public
-- images represents the property. Publishing should be deliberate.
--
-- Floor plans are refused because the hero appears on cards and social
-- previews, where a line drawing among photographs reads as a fault.
--
-- No legacy repair is performed. A hero that predates this migration and is
-- now draft, or has no alt text, keeps its designation: it is already
-- invisible publicly, because `mapPropertyRow` filters unpublished media, so
-- demoting it would discard the administrator's intent without changing what
-- a visitor sees. The admin interface surfaces that state instead.

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

  -- Ownership. An image id from another property is the obvious IDOR attempt
  -- here, and this is what refuses it.
  select * into v_image
  from public.property_images
  where id = p_image_id
    and property_id = p_property_id;

  if not found then
    raise exception 'That image does not belong to this property.'
      using errcode = 'check_violation';
  end if;

  -- A diagram makes a poor card image.
  if v_image.image_type = 'floor_plan' then
    raise exception 'A floor plan cannot be the main image. Choose a photograph.'
      using errcode = 'check_violation';
  end if;

  -- The source must resolve. `image_source_present` already guarantees one of
  -- the two columns is set, so this is defence against a row that predates it.
  if v_image.storage_path is null and v_image.external_url is null then
    raise exception 'That image has no file or link attached.'
      using errcode = 'check_violation';
  end if;

  -- Published first. The message names the fix, because "not published" on its
  -- own does not tell the administrator what to do.
  if not v_image.is_published then
    raise exception 'Publish this image before making it the main image.'
      using errcode = 'check_violation';
  end if;

  -- Described first. A hero with no alt text is missing entirely for anyone
  -- using a screen reader, on every card as well as the property page.
  if coalesce(btrim(v_image.alt_text), '') = '' then
    raise exception 'Describe this image before making it the main image.'
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
  'Promotes one published, described photograph to hero and demotes the previous hero, in a single transaction. Refuses drafts, undescribed images, floor plans and images belonging to another property.';

revoke all on function public.set_property_hero_image(uuid, uuid) from public;
grant execute on function public.set_property_hero_image(uuid, uuid) to authenticated;

-- ======================================================================
-- 2. property_publish_blockers — correcting an operator resolution bug
-- ======================================================================
--
-- The 0008 version appended with `v_blockers := v_blockers || 'some text'`.
--
-- That looks like `array || element`, and it is not. A bare string literal is
-- untyped, so PostgreSQL resolves the `||` operator to `anyarray || anyarray`
-- and tries to read the literal as an array literal. Every call that actually
-- hit a blocker failed with:
--
--   ERROR: malformed array literal: "Choose the location privacy settings..."
--
-- The function therefore worked only for a property that was already ready —
-- exactly the case where its answer does not matter. Any incomplete property
-- raised instead of returning a checklist, and because `publish_property_if_ready`
-- calls it, publishing an incomplete property errored rather than explaining
-- itself.
--
-- `array_append` is unambiguous: it takes an array and one element, so there is
-- no second candidate for the resolver to choose. An explicit `::text` cast on
-- every literal would also work, but leaves the same trap in place for whoever
-- adds the next blocker.
--
-- Found by running the verification harness against a real PostgreSQL for the
-- first time. It parses, applies, and is granted correctly — none of which
-- exercises the branch that was broken.

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
    v_blockers := array_append(v_blockers, 'Add a name.');
  end if;

  if coalesce(btrim(v_property.summary), '') = '' then
    v_blockers := array_append(v_blockers, 'Add a summary.');
  end if;

  if coalesce(btrim(v_property.slug), '') = '' then
    v_blockers := array_append(v_blockers, 'Add a URL slug.');
  end if;

  if coalesce(btrim(v_property.suburb), '') = '' then
    v_blockers := array_append(v_blockers, 'Add a suburb.');
  end if;

  if coalesce(btrim(v_property.state), '') = '' then
    v_blockers := array_append(v_blockers, 'Add a state.');
  end if;

  if not exists (
    select 1 from public.property_location_settings
    where property_id = p_property_id
  ) then
    v_blockers := array_append(
      v_blockers,
      'Choose the location privacy settings on the Location tab.'
    );
  end if;

  -- Without a projection row the public map and property page have no
  -- location to read at all, not even a "hidden" one.
  if not exists (
    select 1 from public.property_public_locations
    where property_id = p_property_id
  ) then
    v_blockers := array_append(
      v_blockers,
      'Save the Location tab so the public location is generated.'
    );
  end if;

  return v_blockers;
end;
$$;

comment on function public.property_publish_blockers(uuid) is
  'Returns the human-readable reasons a property cannot be published yet. Empty array means it is ready.';

revoke all on function public.property_publish_blockers(uuid) from public;
grant execute on function public.property_publish_blockers(uuid) to authenticated;

-- ======================================================================
-- 3. Atomic property publishing
-- ======================================================================
--
-- Phase 6.1 read `property_publish_blockers()` from the application, then
-- issued an UPDATE if the list came back empty. Between those two statements
-- another session could delete the location settings, and the property would
-- publish anyway with nothing for the map to read.
--
-- Combining them into one function closes that window: `FOR UPDATE` holds the
-- property row for the rest of the transaction, so readiness cannot change
-- between being checked and being acted on.
--
-- Returns the blockers rather than raising, so the caller can distinguish
-- "not ready yet" — an ordinary, expected answer worth showing as a checklist
-- — from a genuine failure.

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

  -- Lock first, check second. The lock is the whole point of this function.
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
  'Publishes a property only if it has no outstanding blockers, checking and updating under one row lock. Returns the blockers when it refuses; an empty array means it published.';

revoke all on function public.publish_property_if_ready(uuid) from public;
grant execute on function public.publish_property_if_ready(uuid) to authenticated;

-- ======================================================================
-- 4. The last super administrator cannot be removed
-- ======================================================================
--
-- `prevent_self_admin_removal` (0008) stops an administrator locking
-- themselves out. It does not stop two super administrators locking each other
-- out in sequence, or a super administrator demoting the only other one and
-- then being deleted by a different route.
--
-- This guard counts what would remain. It fires on the row losing its status,
-- so it catches deletion, deactivation and demotion with one check.

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

  select count(*) into v_remaining
  from public.admin_users
  where role = 'super_admin'
    and is_active
    and id <> old.id;

  if v_remaining = 0 then
    raise exception
      'There must be at least one active super administrator. Promote another administrator first.'
      using errcode = 'check_violation';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

comment on function public.prevent_last_super_admin_removal() is
  'Refuses any change that would leave the installation with no active super administrator.';

create trigger prevent_last_super_admin_removal
  before update or delete on public.admin_users
  for each row execute function public.prevent_last_super_admin_removal();

revoke all on function public.prevent_last_super_admin_removal() from public;

-- ======================================================================
-- 5. Reordering construction updates and features
-- ======================================================================
--
-- Same shape as the media reorder functions in 0009: rewrite the whole group
-- in one statement, and refuse anything that does not belong to it.
--
-- Construction updates form a single ordered list per property, so there is no
-- grouping column. Features are grouped by category, so a reorder must not be
-- able to move an item between categories.

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
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_supplied = 0 then
    return;
  end if;

  select count(distinct value) into v_distinct
  from unnest(p_update_ids) as value;

  if v_distinct <> v_supplied then
    raise exception 'The new order lists the same update more than once.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_owned
  from public.construction_updates
  where id = any (p_update_ids)
    and property_id = p_property_id;

  if v_owned <> v_supplied then
    raise exception 'Those updates do not all belong to this property.'
      using errcode = 'check_violation';
  end if;

  update public.construction_updates as target
  set sort_order = ordered.position - 1
  from unnest(p_update_ids) with ordinality as ordered(id, position)
  where target.id = ordered.id;
end;
$$;

comment on function public.reorder_construction_updates(uuid, uuid[]) is
  'Rewrites sort_order across one property''s construction updates from the supplied order.';

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
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_supplied = 0 then
    return;
  end if;

  select count(distinct value) into v_distinct
  from unnest(p_feature_ids) as value;

  if v_distinct <> v_supplied then
    raise exception 'The new order lists the same feature more than once.'
      using errcode = 'check_violation';
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
      using errcode = 'check_violation';
  end if;

  update public.property_features as target
  set sort_order = ordered.position - 1
  from unnest(p_feature_ids) with ordinality as ordered(id, position)
  where target.id = ordered.id;
end;
$$;

comment on function public.reorder_property_features(uuid, text, uuid[]) is
  'Rewrites sort_order across one feature category from the supplied order.';

revoke all on function public.reorder_property_features(uuid, text, uuid[]) from public;
grant execute on function public.reorder_property_features(uuid, text, uuid[]) to authenticated;

-- ======================================================================
-- 6. Construction updates — constrain the stage vocabulary
-- ======================================================================
--
-- `stage` was free text, so two updates could describe the same stage under
-- different names and the public timeline would show both. The vocabulary is
-- fixed here and mirrored in `lib/admin/validation/construction.ts`.
--
-- Deliberately a CHECK rather than an enum: adding a stage later is then a
-- migration that widens a constraint, not one that alters a type.

alter table public.construction_updates
  add constraint construction_updates_stage_check check (
    stage in (
      'planning', 'site-preparation', 'slab', 'frame',
      'lock-up', 'fixing', 'final-inspection', 'completion'
    )
  );

alter table public.construction_updates
  add constraint construction_updates_title_length check (
    length(btrim(title)) between 1 and 160
  ),
  add constraint construction_updates_description_length check (
    description is null or length(description) <= 2000
  );

-- One update per stage per property. Two "Frame" entries on one home is a
-- data-entry mistake, not a use case.
create unique index if not exists construction_updates_one_per_stage
  on public.construction_updates (property_id, stage);

-- ======================================================================
-- 7. Property features — constrain the category vocabulary
-- ======================================================================

alter table public.property_features
  add constraint property_features_category_check check (
    category in (
      'highlight', 'inclusion', 'specification',
      'material', 'energy', 'design'
    )
  );

alter table public.property_features
  add constraint property_features_label_length check (
    length(btrim(label)) between 1 and 120
  ),
  add constraint property_features_value_length check (
    value is null or length(value) <= 200
  );

-- Grouped reads go category-first.
create index if not exists property_features_category_order_idx
  on public.property_features (property_id, category, sort_order);

-- ======================================================================
-- 8. Per-property SEO overrides
-- ======================================================================
--
-- Columns on `properties` rather than a separate table: it is a strict 1:1
-- relationship that every property page read already needs, so a join would
-- add a round trip for no separation benefit. Prefixed `seo_` so the intent of
-- each is unambiguous beside the content fields.
--
-- All nullable. Null means "fall back", which is what makes the three-level
-- chain in `lib/seo/metadata.ts` work: override, then property content, then
-- site default.

alter table public.properties
  add column if not exists seo_meta_title text,
  add column if not exists seo_meta_description text,
  add column if not exists seo_og_image_id uuid
    references public.property_images (id) on delete set null,
  add column if not exists seo_canonical_url text,
  add column if not exists seo_noindex boolean not null default false;

comment on column public.properties.seo_og_image_id is
  'Image used for social previews. ON DELETE SET NULL so deleting the image clears the override rather than leaving a dangling reference.';
comment on column public.properties.seo_canonical_url is
  'Only for a genuine duplicate-content case. Normally null, and the canonical is derived from the slug.';
comment on column public.properties.seo_noindex is
  'Asks search engines not to index this property. For records that must exist but should not be found.';

alter table public.properties
  add constraint properties_seo_title_length check (
    seo_meta_title is null or length(btrim(seo_meta_title)) between 1 and 70
  ),
  add constraint properties_seo_description_length check (
    seo_meta_description is null
    or length(btrim(seo_meta_description)) between 1 and 200
  ),
  add constraint properties_seo_canonical_https check (
    seo_canonical_url is null or seo_canonical_url ~ '^https://[^\s]+$'
  );

-- ======================================================================
-- 9. Site settings
-- ======================================================================
--
-- A typed single-row table, not a key/value store.
--
-- Key/value would accept any key with any value, which means no validation, no
-- type safety, and nothing preventing someone storing an API secret in a table
-- the public site reads. Named columns make the set of settings a schema
-- decision: there is simply no column an API key could go in.
--
-- The `id boolean primary key check (id)` idiom allows exactly one row — `true`
-- is the only value that satisfies both the check and uniqueness.

create table public.site_settings (
  id boolean primary key default true,

  -- Business identity
  company_name            text,
  company_phone           text,
  company_email           text,
  company_address_display text,

  -- Site-wide SEO defaults
  default_meta_title       text,
  default_meta_description text,
  default_og_image_url     text,

  -- Social profiles
  social_facebook  text,
  social_instagram text,
  social_linkedin  text,

  -- Where enquiry notifications should go. Read by server-side code only —
  -- see the public view below, which omits it.
  enquiry_recipient_email text,

  -- Shown site-wide when set. Null means no notice.
  maintenance_notice text,

  updated_at timestamptz not null default now(),

  constraint site_settings_singleton check (id),

  constraint site_settings_company_email_format check (
    company_email is null or company_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  constraint site_settings_enquiry_email_format check (
    enquiry_recipient_email is null
    or enquiry_recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  constraint site_settings_social_https check (
    (social_facebook is null or social_facebook ~ '^https://[^\s]+$')
    and (social_instagram is null or social_instagram ~ '^https://[^\s]+$')
    and (social_linkedin is null or social_linkedin ~ '^https://[^\s]+$')
  ),
  constraint site_settings_og_image_https check (
    default_og_image_url is null or default_og_image_url ~ '^https://[^\s]+$'
  ),
  constraint site_settings_title_length check (
    default_meta_title is null or length(btrim(default_meta_title)) between 1 and 70
  ),
  constraint site_settings_description_length check (
    default_meta_description is null
    or length(btrim(default_meta_description)) between 1 and 200
  ),
  constraint site_settings_notice_length check (
    maintenance_notice is null or length(maintenance_notice) <= 500
  )
);

/*
  Deliberately absent: a default map centre and zoom.

  The explorer fits its viewport to the properties it is showing, which is
  strictly better than a stored centre — a stored centre goes stale the moment
  the business builds in a new suburb, and nothing would tell anyone. A setting
  with no reader is worse than no setting, so the columns are not here.
*/

comment on table public.site_settings is
  'Single row of typed site configuration. Administrator-only; the public site reads site_settings_public, which omits operational fields. Never store secrets here — there is deliberately no column for one.';

create trigger set_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

-- Administrators only. The public site does not read this table.
create policy "admins read site settings"
  on public.site_settings for select
  to authenticated
  using (public.is_admin());

create policy "admins insert site settings"
  on public.site_settings for insert
  to authenticated
  with check (public.is_admin());

create policy "admins update site settings"
  on public.site_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update on public.site_settings to authenticated;

/*
  Public projection.

  RLS is row-level, so granting the public site access to the table would
  expose every column of the single row, including `enquiry_recipient_email` —
  an internal routing address that would attract spam once published.

  A view solves it at column granularity. It is created with the default
  `security_invoker = false`, so it reads the base table with the view owner's
  privileges and is not blocked by the admin-only policy. That is the intended
  behaviour: the view *is* the public contract, and it can only ever expose the
  columns named here.
*/
create view public.site_settings_public as
select
  company_name,
  company_phone,
  company_email,
  company_address_display,
  default_meta_title,
  default_meta_description,
  default_og_image_url,
  social_facebook,
  social_instagram,
  social_linkedin,
  maintenance_notice
from public.site_settings;

comment on view public.site_settings_public is
  'Public-safe subset of site_settings. Deliberately omits enquiry_recipient_email. Adding a column here publishes it — treat this list as the decision about what is public.';

grant select on public.site_settings_public to anon, authenticated;

-- ======================================================================
-- 10. Enquiry internal notes
-- ======================================================================
--
-- Notes are staff-facing and never leave the admin interface: `enquiries` has
-- no anon SELECT policy, so there is no read path to the public site.

alter table public.enquiries
  add column if not exists admin_notes text;

alter table public.enquiries
  add constraint enquiries_admin_notes_length check (
    admin_notes is null or length(admin_notes) <= 4000
  );

comment on column public.enquiries.admin_notes is
  'Internal notes for staff. Never published; enquiries has no anonymous read policy.';

-- ----------------------------------------------------------------------
-- Closing the write path this column opens
-- ----------------------------------------------------------------------
--
-- `enquiries` has an anonymous INSERT policy, and migration 0003 grants INSERT
-- at table level. A table-level grant covers every column, including ones added
-- later, so as written a member of the public could submit an enquiry with
-- `admin_notes` already populated — text that staff would read as if a colleague
-- had written it.
--
-- A column-level REVOKE would not help: while the table-level INSERT grant
-- exists, per-column privileges are not consulted. Revoking the table grant and
-- granting each column individually would silently break the form every time a
-- column is added.
--
-- So the constraint goes in the policy, which is evaluated on every anonymous
-- insert and lists the columns a submitter may decide. Both policies from
-- migration 0002 are replaced; the published-property and status rules are
-- carried over unchanged.

drop policy if exists "anyone may create an enquiry" on public.enquiries;

create policy "anyone may create an enquiry"
  on public.enquiries for insert
  to anon
  with check (
    status = 'new'
    -- Notes are written by staff through the admin interface, never by the
    -- sender.
    and admin_notes is null
    and (
      property_id is null
      or exists (
        select 1 from public.properties p
        where p.id = enquiries.property_id
          and p.is_published
      )
    )
  );

drop policy if exists "signed-in users may create an enquiry" on public.enquiries;

create policy "signed-in users may create an enquiry"
  on public.enquiries for insert
  to authenticated
  with check (
    status = 'new'
    and admin_notes is null
    and (
      property_id is null
      or exists (
        select 1 from public.properties p
        where p.id = enquiries.property_id
          and p.is_published
      )
    )
  );

-- Supports the admin list's default ordering and its property filter.
create index if not exists enquiries_created_idx
  on public.enquiries (created_at desc);

-- ======================================================================
-- 11. Audit actions
-- ======================================================================
--
-- No new action names are needed. Construction, features, enquiries, SEO and
-- settings all map onto the existing verbs — created, updated, deleted,
-- reordered, published, unpublished, archived — and `entity_type` records
-- which thing was acted on. Adding `construction_created`,
-- `feature_created` and so on would encode the entity twice and make
-- "everything created today" harder to query.
--
-- The constraint is therefore unchanged. This note exists so the decision is
-- visible rather than looking like an oversight.

-- ======================================================================
-- 12. Supporting indexes
-- ======================================================================

-- Published child reads on the public property page.
create index if not exists construction_updates_published_order_idx
  on public.construction_updates (property_id, sort_order)
  where is_published;

create index if not exists property_features_published_order_idx
  on public.property_features (property_id, category, sort_order)
  where is_published;

-- The dashboard counts drafts, and there is no index for `is_published =
-- false` — the 0001 index is partial on true.
create index if not exists properties_draft_idx
  on public.properties (updated_at desc)
  where not is_published;
