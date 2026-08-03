-- Phase 5 seed data
--
-- DEMONSTRATION CONTENT ONLY — replace everything before public launch.
--
-- Rules baked into this file:
--   * Suburb references cover the three confirmed build areas only.
--   * No real street addresses or house numbers are seeded.
--   * No public testimonials are invented.
--   * The spread of statuses and privacy modes is deliberate: it proves that
--     the pipeline, not status, decides what is published.
--
-- Run it with:  psql <db-url> -f supabase/seed.sql
-- Or after local reset:  supabase db reset  (the CLI loads this file)

begin;

-- ----------------------------------------------------------------------
-- Suburb references
-- ----------------------------------------------------------------------
insert into public.suburb_references (suburb, state, latitude, longitude, is_active)
values
  ('Mickleham',   'VIC', -37.5167, 144.8833, true),
  ('Craigieburn', 'VIC', -37.6000, 144.9400, true),
  ('Donnybrook',  'VIC', -37.5000, 144.9500, true);

-- ----------------------------------------------------------------------
-- Properties
-- ----------------------------------------------------------------------
insert into public.properties (
  id, slug, name, summary, status, suburb, state,
  bedrooms, bathrooms, car_spaces, land_size_sqm, house_size_sqm,
  price_display, completion_label, is_featured, is_published,
  display_priority, display_is_home, description_blocks, description_source,
  current_stage_id
) values
  (
    '00000000-0000-4000-8000-000000000001',
    'single-storey-concept',
    'Single storey concept',
    'Single level, north-facing living, courtyard to the rear boundary.',
    'move-in-ready', 'Mickleham', 'VIC',
    4, 2, 2, 448, 212,
    'Price on application', null, true, true,
    10, true, null, null, null
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'two-storey-concept',
    'Two storey concept',
    'Two storey, upper level retreat, double garage under the main roofline.',
    'under-construction', 'Craigieburn', 'VIC',
    4, 3, 2, 512, 268,
    'Price on application', 'Completion window to be confirmed', true, true,
    20, true, null, null, 'construction'
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'townhouse-concept',
    'Townhouse concept',
    'Compact footprint, shared party wall, private upper terrace.',
    'completed', 'Donnybrook', 'VIC',
    3, 2, 1, 262, 168,
    null, null, true, true,
    30, true, null, null, null
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    'wide-frontage-concept',
    'Wide frontage concept',
    'Single level across a wide lot, separate living and dining, double garage.',
    'move-in-ready', 'Mickleham', 'VIC',
    4, 2, 2, 512, 231,
    'Price on application', null, false, true,
    40, false, null, null, null
  ),
  (
    '00000000-0000-4000-8000-000000000005',
    'courtyard-concept',
    'Courtyard concept',
    'Three bedrooms wrapped around a sheltered courtyard, single garage.',
    'move-in-ready', 'Craigieburn', 'VIC',
    3, 2, 1, 336, 164,
    'Price on application', null, false, true,
    50, false, null, null, null
  ),
  (
    '00000000-0000-4000-8000-000000000006',
    'corner-block-concept',
    'Corner block concept',
    'Two storey on a corner lot, dual street presentation, upper level living.',
    'under-construction', 'Donnybrook', 'VIC',
    5, 3, 2, 604, 302,
    'Price on application', 'Completion window to be confirmed', false, true,
    60, false, null, null, 'documentation'
  ),
  (
    '00000000-0000-4000-8000-000000000007',
    'dual-living-concept',
    'Dual living concept',
    'Two storey with a ground floor guest suite and separate second living area.',
    'under-construction', 'Craigieburn', 'VIC',
    5, 3, 2, 578, 288,
    null, 'Completion window to be confirmed', false, true,
    70, false, null, null, 'handover'
  ),
  (
    '00000000-0000-4000-8000-000000000008',
    'rear-terrace-concept',
    'Rear terrace concept',
    'Townhouse plan with a north-facing rear terrace and study nook.',
    'sold', 'Mickleham', 'VIC',
    3, 2, 1, 248, 158,
    null, null, false, true,
    80, false, null, null, null
  ),
  (
    '00000000-0000-4000-8000-000000000009',
    'compact-single-storey-concept',
    'Compact single storey concept',
    'Three bedrooms on a compact lot, open plan living, single garage.',
    'sold', 'Donnybrook', 'VIC',
    3, 2, 1, 294, 152,
    null, null, false, true,
    90, false, null, null, null
  ),
  (
    '00000000-0000-4000-8000-000000000010',
    'garden-outlook-concept',
    'Garden outlook concept',
    'Single level with living opening to a landscaped garden, double garage.',
    'completed', 'Craigieburn', 'VIC',
    4, 2, 2, 465, 224,
    null, null, false, true,
    100, false, null, null, null
  );

-- ----------------------------------------------------------------------
-- Private locations (never published)
-- ----------------------------------------------------------------------
insert into public.property_private_locations
  (property_id, private_latitude, private_longitude, house_number, street, postcode)
values
  ('00000000-0000-4000-8000-000000000001', -37.5312, 144.8861, null, null, '3064'),
  ('00000000-0000-4000-8000-000000000002', -37.5974, 144.9412, null, null, '3064'),
  ('00000000-0000-4000-8000-000000000003', -37.5071, 144.9536, null, null, '3064'),
  ('00000000-0000-4000-8000-000000000004', -37.5389, 144.8924, null, null, '3064'),
  ('00000000-0000-4000-8000-000000000005', -37.6042, 144.9331, null, null, '3064'),
  ('00000000-0000-4000-8000-000000000006', -37.5008, 144.9601, null, null, '3064'),
  ('00000000-0000-4000-8000-000000000007', -37.5906, 144.9487, null, null, '3064'),
  ('00000000-0000-4000-8000-000000000008', -37.5265, 144.8802, null, null, '3064'),
  ('00000000-0000-4000-8000-000000000009', -37.5124, 144.9498, null, null, '3064'),
  ('00000000-0000-4000-8000-000000000010', -37.6088, 144.9452, null, null, '3064');

-- ----------------------------------------------------------------------
-- Privacy settings
-- ----------------------------------------------------------------------
insert into public.property_location_settings (
  property_id, location_visibility, privacy_radius_meters,
  public_marker_mode, manual_public_latitude, manual_public_longitude,
  suburb_reference,
  show_house_number, show_street, show_suburb, show_postcode,
  allow_directions
) values
  ('00000000-0000-4000-8000-000000000001', 'exact',       null, 'automatic', null, null, null, false, false, true, true,  null),
  ('00000000-0000-4000-8000-000000000002', 'approximate', 500,  'automatic', null, null, null, false, false, true, true,  null),
  ('00000000-0000-4000-8000-000000000003', 'hidden',      null, 'automatic', null, null, null, false, false, true, true,  null),
  ('00000000-0000-4000-8000-000000000004', 'suburb',      null, 'automatic', null, null, null, false, false, true, true,  null),
  ('00000000-0000-4000-8000-000000000005', 'approximate', 250,  'automatic', null, null, null, false, false, true, true,  null),
  ('00000000-0000-4000-8000-000000000006', 'approximate', 1000, 'manual', -37.4995, 144.9563, null, false, false, true, true,  null),
  ('00000000-0000-4000-8000-000000000007', 'approximate', 1000, 'automatic', null, null, null, false, false, true, true,  null),
  ('00000000-0000-4000-8000-000000000008', 'exact',       null, 'automatic', null, null, null, false, false, true, true,  false),
  ('00000000-0000-4000-8000-000000000009', 'hidden',      null, 'automatic', null, null, null, false, false, true, false, null),
  ('00000000-0000-4000-8000-000000000010', 'suburb',      null, 'automatic', null, null, null, false, false, true, true,  null);

-- ----------------------------------------------------------------------
-- Generated public locations
--
-- These are the outputs of the TypeScript privacy pipeline when run over
-- the private/settings rows above. Run `npm run db:generate-public-locations`
-- to regenerate after any privacy-setting change; the algorithm stays in
-- exactly one place — src/lib/properties/generate-public-locations.ts.
-- ----------------------------------------------------------------------
insert into public.property_public_locations (
  property_id, location_visibility,
  public_latitude, public_longitude, public_address,
  marker_mode, location_label, accuracy_note, allow_directions
) values
  ('00000000-0000-4000-8000-000000000001', 'exact',
   -37.5312, 144.8861, null,
   'automatic', null, null, true),
  ('00000000-0000-4000-8000-000000000002', 'approximate',
   -37.595579, 144.942763, null,
   'automatic', 'Approximate location',
   'The map location is approximate. It has been generalised on purpose to protect the owner''s privacy.',
   false),
  ('00000000-0000-4000-8000-000000000003', 'hidden',
   null, null, null,
   'automatic', 'Location available on enquiry',
   'We share the location of this home directly with buyers who enquire.',
   false),
  ('00000000-0000-4000-8000-000000000004', 'suburb',
   -37.5167, 144.8833, null,
   'automatic', 'Suburb only',
   'The map shows the suburb rather than the home itself, to protect the owner''s privacy.',
   false),
  ('00000000-0000-4000-8000-000000000005', 'approximate',
   -37.604925, 144.934667, null,
   'automatic', 'Approximate location',
   'The map location is approximate. It has been generalised on purpose to protect the owner''s privacy.',
   false),
  ('00000000-0000-4000-8000-000000000006', 'approximate',
   -37.4995, 144.9563, null,
   'manual', 'Approximate location',
   'The map location is approximate. It has been generalised on purpose to protect the owner''s privacy.',
   false),
  ('00000000-0000-4000-8000-000000000007', 'approximate',
   -37.590856, 144.943897, null,
   'automatic', 'Approximate location',
   'The map location is approximate. It has been generalised on purpose to protect the owner''s privacy.',
   false),
  ('00000000-0000-4000-8000-000000000008', 'exact',
   -37.5265, 144.8802, null,
   'automatic', null, null, false),
  ('00000000-0000-4000-8000-000000000009', 'hidden',
   null, null, null,
   'automatic', 'Location available on enquiry',
   'We share the location of this home directly with buyers who enquire.',
   false),
  ('00000000-0000-4000-8000-000000000010', 'suburb',
   -37.6000, 144.9400, null,
   'automatic', 'Suburb only',
   'The map shows the suburb rather than the home itself, to protect the owner''s privacy.',
   false);

-- ----------------------------------------------------------------------
-- A hero image for the first home, so photography and placeholder rendering
-- are both demonstrated. Storage paths only — no binary assets committed.
-- ----------------------------------------------------------------------
insert into public.property_images
  (property_id, image_type, storage_path, alt_text, caption, sort_order, is_published)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'hero',
    'properties/00000000-0000-4000-8000-000000000001/hero/facade.jpg',
    'Single storey concept, Mickleham',
    null,
    0,
    true
  );

-- property_testimonials: no rows on purpose — invented testimonials are
-- exactly what this table must never contain at launch.

commit;
