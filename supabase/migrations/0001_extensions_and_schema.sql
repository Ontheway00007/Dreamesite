-- Phase 5 — Database schema
-- Standard Supabase CLI migration layout. Apply with:
--   supabase migration up
-- or, against the SQL editor / psql, run the files in this directory in name
-- order. Never edit an applied migration; add a new one instead.

-- Required for gen_random_uuid(). Available by default on Supabase, but
-- creating it explicitly keeps the migration self-contained.
create extension if not exists "pgcrypto";

-- ======================================================================
-- 1. properties — public-safe core catalogue record
-- ======================================================================
create table public.properties (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null,
  name              text not null,
  summary           text not null,
  description_blocks jsonb,
  description_source text,
  status            text not null check (
    status in ('move-in-ready', 'under-construction', 'completed', 'sold')
  ),
  suburb            text not null,
  state             text not null default 'VIC',
  bedrooms          smallint not null check (bedrooms >= 0),
  bathrooms         smallint not null check (bathrooms >= 0),
  car_spaces        smallint not null check (car_spaces >= 0),
  land_size_sqm     integer not null check (land_size_sqm >= 0),
  house_size_sqm    integer check (house_size_sqm is null or house_size_sqm >= 0),
  price_display     text,
  completion_label  text,
  is_featured       boolean not null default false,
  is_published      boolean not null default false,
  display_priority  integer not null default 0,
  display_is_home   boolean not null default false,
  display_opening_note text,
  current_stage_id  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.properties is
  'Public-safe property catalogue. No private location, address or privacy data lives here.';
comment on column public.properties.description_blocks is
  'Stable-keyed content blocks: [{id, text}, ...]. The Phase 4.1 PropertyParagraph shape.';
comment on column public.properties.description_source is
  'written | ai-assisted. AI-drafted copy must be disclosed on the page.';
comment on column public.properties.current_stage_id is
  'Matches an id in content/process.ts; derived display, not a stored timeline.';

create unique index properties_slug_key on public.properties (lower(slug));
alter table public.properties
  add constraint properties_slug_format
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

create index properties_published_idx on public.properties (is_published)
  where is_published;
create index properties_status_idx on public.properties (status);
create index properties_suburb_idx on public.properties (suburb);
create index properties_featured_idx on public.properties (is_featured)
  where is_featured and is_published;

-- ======================================================================
-- 2. property_private_locations — never publicly readable
-- ======================================================================
create table public.property_private_locations (
  property_id       uuid primary key references public.properties (id)
                      on delete cascade,
  private_latitude  double precision not null
                      check (private_latitude between -90 and 90),
  private_longitude double precision not null
                      check (private_longitude between -180 and 180),
  house_number      text,
  street            text,
  postcode          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.property_private_locations is
  'Private stored position and raw address parts. RLS: no anon read, no authenticated read in this phase. Server-side only.';

-- ======================================================================
-- 3. property_location_settings — admin-controlled privacy configuration
-- ======================================================================
create table public.property_location_settings (
  property_id           uuid primary key references public.properties (id)
                          on delete cascade,
  location_visibility   text not null
                          check (location_visibility in
                            ('exact', 'approximate', 'suburb', 'hidden')),
  privacy_radius_meters integer
                          check (privacy_radius_meters is null or
                                 privacy_radius_meters in
                                   (100, 250, 500, 1000, 2000, 5000)),
  public_marker_mode    text not null default 'automatic'
                          check (public_marker_mode in ('automatic', 'manual')),
  manual_public_latitude  double precision
                            check (manual_public_latitude is null or
                                   manual_public_latitude between -90 and 90),
  manual_public_longitude double precision
                            check (manual_public_longitude is null or
                                   manual_public_longitude between -180 and 180),
  suburb_reference      text,
  show_house_number     boolean not null default false,
  show_street           boolean not null default false,
  show_suburb           boolean not null default true,
  show_postcode         boolean not null default true,
  allow_directions      boolean,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint manual_marker_pair check (
    (manual_public_latitude is null) = (manual_public_longitude is null)
  )
);

comment on column public.property_location_settings.allow_directions is
  'NULL means unset — the default for the chosen visibility applies. A boolean overrides it per property.';
comment on column public.property_location_settings.privacy_radius_meters is
  'Only meaningful when location_visibility = approximate. Kept nullable so other modes cannot accidentally record one.';

-- ======================================================================
-- 4. property_public_locations — generated public-safe projection
-- ======================================================================
create table public.property_public_locations (
  property_id           uuid primary key references public.properties (id)
                          on delete cascade,
  location_visibility   text not null
                          check (location_visibility in
                            ('exact', 'approximate', 'suburb', 'hidden')),
  public_latitude       double precision
                          check (public_latitude is null or
                                 public_latitude between -90 and 90),
  public_longitude      double precision
                          check (public_longitude is null or
                                 public_longitude between -180 and 180),
  public_address        text,
  marker_mode           text not null
                          check (marker_mode in ('automatic', 'manual')),
  location_label        text,
  accuracy_note         text,
  allow_directions      boolean not null default false,
  generated_at          timestamptz not null default now(),
  constraint public_coordinate_pair check (
    (public_latitude is null) = (public_longitude is null)
  ),
  constraint directions_require_coordinate check (
    not allow_directions or public_latitude is not null
  )
);

comment on table public.property_public_locations is
  'Generated public projection from the privacy pipeline. The ONLY location source public code may read. Regenerated server-side whenever settings change.';
comment on column public.property_public_locations.allow_directions is
  'Directions are only offered when a public coordinate exists and the property configuration allows it.';

-- ======================================================================
-- 5. suburb_references — public suburb-level markers
-- ======================================================================
create table public.suburb_references (
  id          uuid primary key default gen_random_uuid(),
  suburb      text not null,
  state       text not null default 'VIC',
  latitude    double precision not null check (latitude between -90 and 90),
  longitude   double precision not null check (longitude between -180 and 180),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint suburb_references_unique unique (lower(suburb), state)
);

comment on table public.suburb_references is
  'Public-safe locality centres used for suburb-only markers. Never derived from a property.';

-- ======================================================================
-- 6. property_images
-- ======================================================================
create table public.property_images (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id)
                  on delete cascade,
  image_type    text not null check (image_type in
                  ('hero', 'gallery', 'façade', 'construction',
                   'floor_plan', 'drone')),
  storage_path  text,
  external_url  text,
  alt_text      text,
  caption       text,
  sort_order    integer not null default 0 check (sort_order >= 0),
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint image_source_present check (
    storage_path is not null or external_url is not null
  )
);

comment on table public.property_images is
  'Photography and floor-plan stills. Virtual tours and drone links belong in property_resources.';

create index property_images_property_idx
  on public.property_images (property_id, sort_order);

-- ======================================================================
-- 7. property_features
-- ======================================================================
create table public.property_features (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id)
                  on delete cascade,
  category      text not null,
  label         text not null,
  value         text,
  sort_order    integer not null default 0 check (sort_order >= 0),
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index property_features_property_idx
  on public.property_features (property_id, sort_order);

-- ======================================================================
-- 8. construction_updates
-- ======================================================================
create table public.construction_updates (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties (id)
                   on delete cascade,
  stage          text not null,
  title          text not null,
  description    text,
  status         text not null default 'planned' check (status in
                   ('planned', 'in-progress', 'complete')),
  progress_value smallint check (progress_value is null or
                   progress_value between 0 and 100),
  occurred_at    timestamptz,
  sort_order     integer not null default 0 check (sort_order >= 0),
  is_published   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.construction_updates is
  'Future per-property build diary. The public progress timeline stays derived from current_stage_id + shared process content; these are editorial entries.';

create index construction_updates_property_idx
  on public.construction_updates (property_id, sort_order);

-- ======================================================================
-- 9. property_resources
-- ======================================================================
create table public.property_resources (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id)
                  on delete cascade,
  resource_type text not null check (resource_type in
                  ('virtual-tour', 'video', 'drone-footage',
                   'floor-plan', 'brochure', 'document')),
  title         text not null,
  url           text,
  storage_path  text,
  sort_order    integer not null default 0 check (sort_order >= 0),
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint resource_target_present check (
    url is not null or storage_path is not null
  )
);

create index property_resources_property_idx
  on public.property_resources (property_id, sort_order);

-- ======================================================================
-- 10. property_testimonials
-- ======================================================================
create table public.property_testimonials (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties (id)
                    on delete cascade,
  quote           text not null,
  attribution     text not null,
  attribution_role text,
  sort_order      integer not null default 0 check (sort_order >= 0),
  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.property_testimonials is
  'Customer quotes. Never seed fictional ones.';

create index property_testimonials_property_idx
  on public.property_testimonials (property_id, sort_order);

-- ======================================================================
-- 11. enquiries
-- ======================================================================
create table public.enquiries (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid references public.properties (id) on delete set null,
  name              text not null check (length(btrim(name)) > 0),
  email             text not null check (
                      email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone             text,
  message           text not null check (length(btrim(message)) > 0),
  source            text not null default 'website',
  consent_to_contact boolean not null default false,
  status            text not null default 'new' check (status in
                      ('new', 'read', 'replied', 'archived')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.enquiries is
  'Sales enquiries. Anonymous insert only; reads and status changes are Phase 6 admin territory.';

create index enquiries_property_idx on public.enquiries (property_id);
create index enquiries_status_created_idx
  on public.enquiries (status, created_at desc);

-- ======================================================================
-- updated_at trigger helper + attachments
-- ======================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Keeps updated_at honest for editors. Added to every editable table.';

create trigger set_updated_at before update on public.properties
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.property_private_locations
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.property_location_settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.suburb_references
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.property_images
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.property_features
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.construction_updates
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.property_resources
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.property_testimonials
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.enquiries
  for each row execute function public.set_updated_at();
