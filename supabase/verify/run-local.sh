#!/bin/sh
#
# Runs the verification harness against a local PostgreSQL cluster.
#
# Prefer `supabase db reset` when the CLI is available — it applies the
# migrations against the real platform schemas. This script is for the case
# where the CLI is not installed and containers cannot be run: it needs nothing
# but a PostgreSQL 15 server binary and psql on PATH.
#
#   PostgreSQL 15 + pgcrypto, e.g. on Amazon Linux 2023:
#     dnf install -y postgresql15-server postgresql15 postgresql15-contrib
#
# It creates a throwaway cluster, applies the stubs and every migration in
# order, runs both check files, and stops. Nothing touches an existing cluster.
#
# Usage:  sudo sh supabase/verify/run-local.sh
#
set -e

REPO=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
DATA=${PGVERIFY_DATA:-/var/lib/pgverify}
SOCK=${PGVERIFY_SOCK:-/var/run/pgverify}
PGUSER_OS=${PGVERIFY_OS_USER:-postgres}

# The server refuses to run as root, so everything below is run as the
# postgres OS user. A fresh cluster each time keeps the fixtures from one run
# out of the next.
rm -rf "$DATA" "$SOCK"
mkdir -p "$DATA" "$SOCK"
chown -R "$PGUSER_OS":"$PGUSER_OS" "$DATA" "$SOCK"

as_pg() {
  su "$PGUSER_OS" -s /bin/sh -c "$1"
}

as_pg "initdb -D $DATA -A trust -U postgres" >/dev/null
echo "initdb: ok"

# No TCP listener: a unix socket in a private directory cannot be reached from
# outside this machine, which is what you want from a throwaway test cluster.
as_pg "pg_ctl -D $DATA -o \"-c listen_addresses='' -k $SOCK\" -l $DATA/server.log -w start" >/dev/null
trap 'as_pg "pg_ctl -D $DATA -w stop" >/dev/null 2>&1 || true' EXIT
echo "server: started"

as_pg "createdb -h $SOCK -U postgres verify"
PSQL="psql -v ON_ERROR_STOP=1 -h $SOCK -U postgres -d verify -X -q"

echo ""
echo "--- stubs"
as_pg "$PSQL -f $REPO/supabase/verify/00_supabase_stubs.sql"

echo ""
echo "--- migrations"
for f in "$REPO"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  as_pg "$PSQL -f $f"
done

echo ""
echo "--- 01_checks.sql"
as_pg "$PSQL -f $REPO/supabase/verify/01_checks.sql"

echo ""
echo "--- 02_checks_phase63.sql"
as_pg "$PSQL -f $REPO/supabase/verify/02_checks_phase63.sql"

echo ""
echo "All files applied and both check suites completed."
