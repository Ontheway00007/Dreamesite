#!/bin/sh
#
# Fails when `src/types/database.ts` has drifted from the schema the migrations
# produce.
#
# ## Why this is a comparison and not a regeneration
#
# `src/types/database.ts` is hand-maintained. That is a deliberate choice — the
# file predates any Supabase project and lets the mapping code be typed without
# a database — but a hand-maintained type file is only as good as the last person
# who remembered to update it. This is what remembers.
#
# It compares the *shape* the generator reports against the shape the file
# declares: every table's column names and nullability, and every function's
# name. It does not diff the files, because the generator's formatting, its
# `Insert`/`Update`/`Relationships` scaffolding and its extension functions are
# all things this repository deliberately does not carry.
#
# Requires: psql pointed at a database with every migration applied (the CI
# `database` job does this), and the Supabase CLI on PATH.
#
# Usage:  sh scripts/check-type-drift.sh
#
set -eu

REPO=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=verify}"

DB_URL="postgresql://${PGUSER}:${PGPASSWORD:-}@${PGHOST}:${PGPORT}/${PGDATABASE}"
GENERATED=$(mktemp)
trap 'rm -f "$GENERATED"' EXIT

echo "Generating types from the live schema..."
supabase gen types typescript --db-url "$DB_URL" --schema public > "$GENERATED"

# Functions owned by an extension — pgcrypto's `gen_random_uuid`, `crypt`,
# `dearmor` and friends. They land in `public` here because the harness installs
# pgcrypto there, whereas real Supabase puts extensions in their own schema. They
# are not this repository's to declare, so they are excluded rather than listed
# as undeclared on every run. `deptype = 'e'` is the catalogue's own record of
# "this object belongs to an extension".
IGNORE=$(psql -X -A -t -q -c "
  select coalesce(string_agg(p.proname, ',' order by p.proname), '')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and exists (
      select 1 from pg_depend d
      where d.objid = p.oid and d.deptype = 'e'
    )" | tr -d '[:space:]')

echo "Comparing against src/types/database.ts..."
node "$REPO/scripts/compare-database-types.mjs" \
  "$GENERATED" \
  "$REPO/src/types/database.ts" \
  --ignore-functions="$IGNORE"
