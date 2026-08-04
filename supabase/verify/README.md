# Migration verification harness

SQL that asserts what migrations `0001`–`0009` claim: constraints hold, the
helper functions behave, the storage path validator refuses traversal, hero
selection is unique and atomic, reordering rejects foreign ids, and `audit_log`
is genuinely append-only.

> **Status: written, not executed.**
>
> This harness has not been run. The environment it was authored in has no
> Supabase CLI, no `psql`, and its tooling refuses to start containers, so
> nothing here has been confirmed against a running PostgreSQL. Treat every
> assertion as unverified until you have run it yourself.

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

**Not** covered:

- Supabase's own RLS enforcement as reached through PostgREST.
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

docker rm -f pgverify
```

Against any PostgreSQL 15+ you already have:

```bash
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f supabase/verify/00_supabase_stubs.sql
for f in supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$f"
done
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f supabase/verify/01_checks.sql
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
