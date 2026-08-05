#!/bin/sh
#
# Concurrency verification against an already-running PostgreSQL reachable over
# TCP — the CI service container.
#
# The local script (`04_concurrency.sh`) builds its own cluster with `initdb` and
# talks to it over a unix socket as the `postgres` OS user. Neither is possible
# in CI: the server is a container that is already running, and the job user is
# not `postgres`. This driver supplies the other half of that contract and then
# runs exactly the same checks from `_concurrency_body.sh`.
#
# ## Why it creates its own database
#
# The CI job applies the migrations to `$PGDATABASE` and runs the SQL assertion
# suites against it, and those suites leave rows behind — administrators,
# properties, audit entries. Check 1 below asserts an exact super-administrator
# count, so it needs a database whose only contents are its own fixtures. This
# creates one, applies the stubs and every migration to it, and drops it at the
# end.
#
# Connection settings come from the standard libpq variables, so the CI job's
# `env:` block configures this with no arguments:
#
#   PGHOST PGPORT PGUSER PGPASSWORD
#
# Usage:  sh supabase/verify/ci-concurrency.sh
#
set -e

REPO=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
export PGHOST PGPORT PGUSER

# A database of its own, named so a leftover from a cancelled run is obvious.
CONC_DB=${PGVERIFY_CONCURRENCY_DB:-verify_concurrency}

WORK=${PGVERIFY_WORK:-${TMPDIR:-/tmp}/pgverify-concurrency}
rm -rf "$WORK"
mkdir -p "$WORK"
chmod 777 "$WORK"
WORK=$(CDPATH='' cd -- "$WORK" && pwd)

# No `su` needed: unlike the local cluster, nothing here runs a server process.
pg_exec() {
  sh -c "$1"
}

cleanup() {
  # Sessions still holding connections would block the drop.
  psql -q -d postgres -c \
    "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$CONC_DB'" \
    >/dev/null 2>&1 || true
  dropdb --if-exists "$CONC_DB" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "--- preparing $CONC_DB on $PGHOST:$PGPORT"
dropdb --if-exists "$CONC_DB"
createdb "$CONC_DB"

MIGRATE="psql -v ON_ERROR_STOP=1 -d $CONC_DB -X -q"

echo "--- stubs"
$MIGRATE -f "$REPO/supabase/verify/00_supabase_stubs.sql"

echo "--- migrations"
for f in "$REPO"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  $MIGRATE -f "$f"
done

# ON_ERROR_STOP=0 for the checks themselves: several of them assert that a
# statement is *refused*, and psql must keep reading after the error.
PSQL="psql -v ON_ERROR_STOP=0 -d $CONC_DB -X"

. "$REPO/supabase/verify/_concurrency_body.sh"
