# Database Schema — Dreame

Generated from `supabase/migrations/0001…0005`. Apply the files in order;
reverting is not supported (drop and re-create in development).

Naming: `snake_case` tables in the `public` schema. Every `updated_at` is kept
honest by the shared `set_updated_at()` trigger.

---

## Tables

### `properties` — public-safe core catalogue record

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `slug` | text | lowercase/kebab; unique index on `lower(slug)` |
| `name` | text | |
| `summary` | text | plain-text lead-in |
| `description_blocks` | jsonb | `[{id, text}, ...]` |
| `description_source` | text | `written` or `ai-assisted`, null if no description |
| `status` | text | `move-in-ready / under-construction / completed / sold` |
| `suburb` | text | |
| `state` | text | defaults to `VIC` |
| `bedrooms` / `bathrooms` / `car_spaces` | smallint | non-negative |
| `land_size_sqm` | integer | non-negative |
| `house_size_sqm` | integer | null allowed |
| `price_display` | text | holds whatever the business has confirmed; `null` when not |
| `completion_label` | text | friendly completion timing |
| `is_featured` | boolean | homepage flag |
| `is_published` | boolean | master switch — draft rows never leave this table |
| `display_priority` | integer | lower first |
| `display_is_home` | boolean | display-home flag |
| `display_opening_note` | text | e.g. "Open Saturdays 11–2" |
| `current_stage_id` | text | id from `content/process.ts`; derived timeline on render |
| `created_at`, `updated_at` | timestamptz | |

Indexes: slug (unique), published, status, suburb, featured.

No private coordinates, no raw address parts, no privacy settings. This is the
only property table anonymous users may touch.

### `property_private_locations` — the stored truth

`property_id` PK/FK. `private_latitude/longitude` (range-checked), optional
`house_number`, `street`, `postcode`. One row per property.

RLS: enabled, no anon or authenticated policies in Phase 5. Reads and writes
are service-role only until Phase 6 admin policies exist.

### `property_location_settings` — admin-controlled privacy config

`property_id` PK/FK. `location_visibility` (`exact | approximate | suburb |
hidden`), optional `privacy_radius_meters` (one of `100, 250, 500, 1000, 2000,
5000`), `public_marker_mode` (`automatic | manual`), paired `manual_public_*`
coordinates (must be set together), `suburb_reference`,
`show_{house_number,street,suburb,postcode}`, and nullable `allow_directions`.
`NULL` on `allow_directions` means "use the default for the visibility."

RLS: enabled, no policies in Phase 5. Admin Phase 6 reads/writes here.

CHECK constraints (added in `0005`) forbid three combinations outright —
approximate without a radius, manual mode without a manually placed position,
and a `hidden` row that still holds a public coordinate or directions. The
generator cannot write them even with a bug.

### `property_public_locations` — the generated public projection

`property_id` PK/FK. `location_visibility`, published coordinate,
`public_address` (already fully formatted, `null` when nothing may be shown),
`marker_mode` (needed to rebuild `PublicMarkerMode`), `location_label`,
`accuracy_note`, and `allow_directions`.

Guaranteed by:
- CHECK that lat/long come as a pair,
- CHECK that `allow_directions` cannot be true when no coordinate exists,
- RLS policy `exists (published parent property)`.

This is the *only* location table public readers hit. A hidden property has
`location_visibility = 'hidden'` and `public_latitude/longitude = NULL`.

### `suburb_references`

`id`, `suburb`, `state`, `latitude/longitude`, `is_active`. Unique on
`(lower(suburb), state)`. Seeded with Mickleham / Craigieburn / Donnybrook
only.

RLS: `select ... using (is_active)` for anon and authenticated.

### `property_images`

Per-row `image_type` (`hero | gallery | façade | construction | floor_plan |
drone`), `storage_path` or `external_url` (at least one required, enforced by
CHECK), `alt_text`, `caption`, `sort_order`, `is_published`. Cascades on
property delete.

The Phase 3/4 UI (`galleryVisuals`) maps `photo + floorplan` onto stills and
`drone-video / virtual-tour` onto resources through `media.ts`, which is why
this schema doesn't grow a separate table per kind.

### `property_features`

Free `category / label / value` rows with `sort_order`, `is_published`,
`on delete cascade`. **Deferred from the public read path in this phase:** the
detail specs table already renders fixed columns, and no consumer surfaced
yet for them. The rows stay in the schema so a future "inclusions" section on
a property page can be a data change, not a migration.

### `construction_updates`

`stage`, `title`, `description`, `status` (`planned | in-progress |
complete`), `progress_value` (0–100), `occurred_at`, `sort_order`,
`is_published`. **Deferred from the public read path in this phase.** The
homepage's `processStages` content models the shared build process, and
`current_stage_id` on `properties` drives the per-home timeline; these
editorial entries are the future build-diary an admin will write per home.
Because nothing outside an admin context will read them initially, they stay
behind the same `is_published` + parent-published gating as every other
public child row.

### `property_resources`

`resource_type` (`virtual-tour | video | drone-footage | floor-plan |
brochure | document`), `title`, `url` or `storage_path` (one required),
`sort_order`, `is_published`. Empty rows simply don't render — the page
already has that guard.

### `property_testimonials`

`quote`, `attribution` (the agreed credit), optional `attribution_role` (e.g.
"Owner"), `sort_order`, `is_published`. The seed file deliberately ships zero
rows — invented testimonials are an integrity issue, not a content gap.

### `enquiries`

`id`, nullable `property_id` (an enquiry need not be tied to a home),
`name`/`email`/`phone`/`message` with not-empty checks and an email format
check, `source`, `consent_to_contact`, `status` (`new | read | replied |
archived`, defaults to `new`). No public reads, updates or deletes — insert
only.

Length constraints (from `0005`): `name` ≤ 120, `email` ≤ 254 (RFC 5321),
`message` ≤ 4000, `source` ≤ 50, `phone` format `^[0-9+() \-]{6,25}$`.

## Relationships

```
properties 1—1 property_private_locations
properties 1—1 property_location_settings
properties 1—1 property_public_locations      (generated projection)
properties 1—* property_images
properties 1—* property_features
properties 1—* construction_updates
properties 1—* property_resources
properties 1—* property_testimonials
properties 0/1—* enquiries                    (set null on delete)
suburb_references (standalone; referenced by property_location_settings.suburb_reference)
```

## RLS summary

Anonymous policies exist only on the public catalogue. Every child policy
verifies `is_published` on the row *and* on its parent. `enquiries` is
insert-only. Both private tables and admin-config surfaces have zero
`anon`/`authenticated` policies — everything fails closed until Phase 6.

## Grants

The brief highlights that RLS alone is not sufficient; `0003_grants.sql`
explicitly revokes default permissive grants and restates the minimal set
(`select` on catalogue tables, `insert` on `enquiries`, nothing else).
