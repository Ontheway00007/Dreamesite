# Migration verification harness

SQL that asserts what migrations `0001`–`0011` claim: constraints hold, the
helper functions behave, the storage path validator refuses traversal, hero
selection is unique and atomic, reordering rejects foreign ids, and `audit_log`
is genuinely append-only.

Two check files, run in order:

| File | Covers |
| --- | --- |
| `01_checks.sql` | Migrations `0001`–`0009` |
| `02_checks_phase63.sql` | Migration `0010` |
| `03_checks_phase631.sql` | Migration `0011`, single-session |
| `04_concurrency.sh` | Migration `0011`, two live sessions |

`run-local.sh` runs the first three. `04_concurrency.sh` is separate because it
builds its own cluster and drives two connections through FIFOs; the shared
cluster setup lives in `_cluster.sh` so the two cannot apply different
migrations.

> **Status: executed, and passing.**
>
> Both check files have been run against PostgreSQL 15.18 — every migration
> applied in order from empty, and every assertion passed. `run-local.sh` is the
> script that does it.
>
> Running it for the first time found two defects that reading the SQL had not:
>
> 1. **Migration `0001` did not parse.** `constraint suburb_references_unique
>    unique (lower(suburb), state)` is invalid — PostgreSQL accepts only bare
>    column names in a `UNIQUE` table constraint, not expressions. Nothing after
>    `0001` had ever applied. Now a unique index, which enforces the same rule.
> 2. **`property_publish_blockers()` failed on any incomplete property.**
>    `v_blockers || 'some text'` resolves to `anyarray || anyarray`, because a
>    bare literal is untyped, so PostgreSQL tried to parse the message as an
>    array literal. The function only worked for properties that were already
>    ready — the case where its answer does not matter. Corrected forward in
>    `0010` using `array_append`.
>
> Both are the kind of bug that only execution finds. Neither is visible in
> review, and both had survived two phases of it.
>
> **Concurrency is verified too, as of Phase 6.3.1.** `04_concurrency.sh` drives
> two live sessions and passes. It checks the outcome *and* that the second
> session genuinely blocked on the advisory lock — a concurrency test that passes
> because the loser failed for an unrelated reason is worse than none.

## Running it

```bash
sudo sh supabase/verify/run-local.sh      # every single-session suite
sudo sh supabase/verify/04_concurrency.sh # two-session concurrency
```

It creates a throwaway cluster in `/var/lib/pgverify`, applies the stubs and
every migration in order, runs both check files, then stops the server. It never
touches an existing cluster and listens on no TCP port.

It needs a PostgreSQL 15 server binary, `psql`, and `pgcrypto`. On Amazon Linux
2023:

```bash
dnf install -y postgresql15-server postgresql15 postgresql15-contrib
```

`pgcrypto` is in the `-contrib` package and the migrations require it for
`gen_random_uuid()`; without it `0001` stops at its first statement.

## Why this exists separately from `supabase db reset`

`supabase db reset` is the right tool when the CLI is available, and you should
prefer it — it applies the migrations exactly as production will and brings the
real `auth` and `storage` schemas with it.

This harness covers the case where the CLI is not available. Migrations
`0001`–`0009` reference `auth.users`, `auth.uid()`, `storage.buckets`,
`storage.objects` and the `anon` / `authenticated` / `service_role` roles, none
of which exist in stock PostgreSQL. `00_supabase_stubs.sql` reproduces just
enough of that surface for the migrations to apply, so the SQL can be checked
against a real database engine rather than only read.

## What it does and does not prove

Covered:

- Every migration parses and applies in order, from empty.
- `is_admin()` / `is_super_admin()` recognise the right users, and `EXECUTE` is
  held by `authenticated` only — not via `PUBLIC`.
- Reading `admin_users` under RLS does not recurse (`42P17`), which is the
  Phase 6 defect migration `0008` fixed.
- `is_valid_property_media_path()` accepts the seven documented layouts and
  refuses traversal, unknown categories, original filenames, double
  extensions, wrong shapes, and paths naming a property that does not exist.
- At most one `hero` row per property; an image cannot claim both a storage
  path and an external URL.
- `set_property_hero_image()` promotes and demotes in one transaction, and
  refuses an image belonging to another property.
- `reorder_property_images()` applies the given order and refuses foreign ids,
  cross-category ids, duplicates, and non-administrators.
- `audit_log` refuses `UPDATE` and `DELETE`, and accepts the media action
  names added in `0009`.
- `property_publish_blockers()` reports incomplete properties and missing ones.
- The three hardened storage policies exist and the path-blind ones are gone.

Added by `02_checks_phase63.sql` for migration `0010`:

- `set_property_hero_image()` refuses an unpublished image, one with no alt
  text, a floor plan, an image belonging to another property, and one with
  neither a storage path nor an external URL.
- `publish_property_if_ready()` publishes only when there are no blockers,
  returns the blockers instead of raising when there are, writes its audit entry
  in the same transaction, and refuses a non-administrator.
- The last super administrator cannot be deleted, deactivated or demoted, by any
  of those three routes.
- `reorder_construction_updates()` and `reorder_property_features()` apply the
  given order and refuse foreign ids, duplicates, cross-category ids and
  non-administrators.
- One construction update per stage per property; the stage and feature-category
  vocabularies are enforced.
- The SEO columns bound their lengths, require `https` for a canonical URL, and
  `seo_og_image_id` becomes null when the image it names is deleted.
- `site_settings` accepts exactly one row, validates both email formats,
  requires `https` social links, and bounds the default title.
- `site_settings_public` does not expose `enquiry_recipient_email`, and `anon`
  can read the view but not the table.
- An anonymous caller may insert an enquiry but cannot supply `admin_notes`, and
  an ordinary enquiry still succeeds.
- No `DELETE` policy exists on `enquiries` for anyone.

Added by `03_checks_phase631.sql` and `04_concurrency.sh` for migration `0011`:

- Advisory lock keys are deterministic, distinct per property, distinct from the
  roster key, and re-entrant within a transaction.
- The lock helpers are executable by `authenticated` and not by `anon`.
- Authored refusals raise `PT422` / `PT409`, not a generic constraint code.
- All four reorder functions require the complete group: a missing id, an extra
  foreign id, a duplicate, an empty list against a populated group, a
  concurrent insertion and a concurrent deletion are each refused, and a valid
  reorder leaves contiguous zero-based positions.
- An empty reorder of a genuinely empty group is still a no-op.
- `clear_property_location` removes every location row and unpublishes the
  property, after which publishing refuses it.
- `count_publish_blocked_properties` agrees with `property_publish_blockers`
  exactly, and counts drafts only.
- Every function 0011 touches pins its `search_path`.
- **Two concurrent super-administrator removals**: the second blocks, then is
  refused, and the roster never reaches zero.
- **Publishing versus a location mutation**: publishing waits, then sees the
  committed change and refuses.
- **Two different properties do not contend**: one publishes while the other's
  lock is held, under a 4-second statement timeout that would fail if the locks
  were global.

**Not** covered:

- Supabase's own RLS enforcement as reached through PostgREST. The policies are
  exercised by `set local role anon` inside a transaction, which evaluates the
  same predicates — but whether PostgREST reaches them the same way on a real
  request is not tested here.
- The Storage HTTP API. Storage policies are exercised only through the SQL
  predicate that backs them, evaluated directly. Whether Supabase applies that
  predicate on an actual upload is not tested here.
- Anything about the running application.

## Running it

With Docker:

```bash
docker run -d --name pgverify \
  -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=verify \
  postgres:15-alpine

# wait for readiness
until docker exec pgverify pg_isready -U postgres -d verify; do sleep 1; done

# stubs, then every migration in order, then the checks
docker exec -i pgverify psql -v ON_ERROR_STOP=1 -U postgres -d verify \
  < supabase/verify/00_supabase_stubs.sql

for f in supabase/migrations/*.sql; do
  echo "--- $f"
  docker exec -i pgverify psql -v ON_ERROR_STOP=1 -U postgres -d verify < "$f"
done

docker exec -i pgverify psql -v ON_ERROR_STOP=1 -U postgres -d verify \
  < supabase/verify/01_checks.sql

docker exec -i pgverify psql -v ON_ERROR_STOP=1 -U postgres -d verify \
  < supabase/verify/02_checks_phase63.sql

docker rm -f pgverify
```

Against any PostgreSQL 15+ you already have:

```bash
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f supabase/verify/00_supabase_stubs.sql
for f in supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$f"
done
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f supabase/verify/01_checks.sql
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f supabase/verify/02_checks_phase63.sql
```

Use a throwaway database. The harness creates roles and inserts fixtures.

## Reading the output

Every check raises an exception on failure, so with `ON_ERROR_STOP=1` the run
stops at the first problem. Success prints a `PASS` line per check and ends
with:

```
NOTICE:  All checks passed.
```

Anything beginning `CHECK FAILED:` names the assertion that did not hold.

## With the Supabase CLI

Prefer this when you have it — it applies the migrations against the real
platform schemas:

```bash
supabase start
supabase db reset          # migrations + supabase/seed.sql
supabase gen types typescript --local > src/types/database.ts
```

Regenerating types is worth doing: `src/types/database.ts` is currently
hand-maintained, and `src/lib/admin/rpc.ts` exists only to work around the
inference that costs. Both can go once the generated types are in place.
