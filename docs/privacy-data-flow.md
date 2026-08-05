# Privacy data flow — Dreame

The point of this page is to be able to answer one question without hand-waving:
**how does a private address never reach the browser?**

## The flow

1. **Stored data** (`property_private_locations`,
   `property_location_settings`) is read only by server-side code with the
   service key. No browser-reachable part of the app ever queries these two
   tables — the repository uses `property_public_locations` instead.
2. **Transformation** is exactly the algorithm in
   `src/lib/properties/privacy.ts`. It runs locally today against committed
   fixtures, and it is reused server-side to regenerate the projection when
   settings change.
3. **Projection** — the deterministic public result — is written into
   `property_public_locations`. That row is what every public read sees.
4. **Public repository** (`src/lib/properties/supabase-repository.ts`) selects
   from `properties` joined to `property_public_locations` only, so the
   returned `PublicPropertyLocation` can contain nothing more.
5. **UI** consumes `Property` — still the type consumers like cards, map and
   detail pages already use. No component ever saw a private column.

Because step 3 happens only server-side, the browser *cannot* infer more than
the projection contains, even with DevTools. The anon-key RLS policies make
that guarantee at the database layer.

## Why it holds in the code today

- `toPublicProperty` in `src/lib/properties/privacy.ts` enumerates the fields
  a public property may carry. New private fields added to
  `PropertyRecord` are invisible until they are explicitly published.
- `supabase-repository.ts` never touches `property_private_locations`,
  `property_location_settings` or `enquiries`.
- The joined query selects `property_public_locations(*)` — never a
  private-side table.
- `lib/properties/privacy-validation.ts` already warns about contradictory
  settings (e.g. hidden marker + public street address); those warnings are
  shared with the Phase 6 admin dashboard.

The tests prove specific guarantees the schema alone cannot:

- `repository.test.ts` asserts that a JSON serialisation of every public
  property contains no `privateLatitude`, `privateLongitude`, `privacy` or
  raw `address` keys.
- `repository.test.ts` asserts hidden properties yield no coordinates, and
  suburb-only properties equal the reference point (never the stored
  coordinate).
- `repository.test.ts` asserts demonstration data covers all four visibility
  modes, so the differences above are actually being exercised.
- `privacy.test.ts` (31 cases) locks the privacy rules themselves.

## Regenerating the projection

The public locations are deliberately computed, not stored by hand.

The regeneration routine lives in two modules:

- `src/lib/properties/projection.ts` — the pure mapping logic that transforms
  private location + settings into a `PublicPropertyLocation` and the database
  row shape. No I/O, no network, testable in isolation.
- `src/lib/properties/generate-public-locations.ts` — the server-only service
  (marked with `import "server-only"`) that orchestrates the workflow:

1. Reads `property_private_locations`, `property_location_settings` and the
   property's suburb/state **as the signed-in administrator**, under RLS. No
   service-role key is involved; the application does not hold one.
2. Calls `buildPublicLocation` from `projection.ts` — the same pipeline
   `toPublicProperty` uses locally, so the algorithm is never duplicated.
3. Writes the result through `save_regenerated_public_location`, which takes the
   property advisory lock and refuses with `PT409` unless the property, the
   private location and the settings all still match the versions step 1 read.
   A regeneration therefore cannot restore a coordinate that a newer privacy
   decision has superseded.

It never runs in the browser, never sees the anon key, and never appears in
the client bundle. When the Phase 6 admin actions land, the save handler calls
`generatePublicLocationForProperty(id)` so the public read path stays the
final, computed row instead of recalculating per request.
