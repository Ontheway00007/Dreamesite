#!/bin/sh
#
# Runs the single-session verification suites against a local PostgreSQL
# cluster.
#
# Prefer `supabase db reset` when the CLI is available — it applies the
# migrations against the real platform schemas. This script is for the case
# where the CLI is not installed and containers cannot be run: it needs nothing
# but a PostgreSQL 15 server binary and psql on PATH.
#
#   dnf install -y postgresql15-server postgresql15 postgresql15-contrib
#
# It creates a throwaway cluster, applies the stubs and every migration in
# order, runs each check file, and stops. Nothing touches an existing cluster.
#
# The concurrency guarantees need two live connections and are checked
# separately by 04_concurrency.sh.
#
# Usage:  sudo sh supabase/verify/run-local.sh
#
set -e

REPO=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
. "$REPO/supabase/verify/_cluster.sh"

cluster_start "${PGVERIFY_DATA:-/var/lib/pgverify}" "${PGVERIFY_SOCK:-/var/run/pgverify}"
trap cluster_stop EXIT

cluster_migrate

PSQL="psql -v ON_ERROR_STOP=1 -h $CLUSTER_SOCK -U postgres -d verify -X -q"

for checks in 01_checks 02_checks_phase63 03_checks_phase631 05_checks_phase632; do
  echo ""
  echo "--- $checks.sql"
  as_pg "$PSQL -f $REPO/supabase/verify/$checks.sql"
done

echo ""
echo "All files applied and every check suite completed."
echo "Concurrency guarantees need two live sessions: run 04_concurrency.sh."
