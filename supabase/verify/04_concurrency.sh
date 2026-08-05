#!/bin/sh
#
# Concurrency verification — two live sessions, against a throwaway local
# cluster.
#
# The other check files run in a single session, which is exactly why they
# cannot test the two guarantees that matter most here. Write skew is invisible
# from one connection: each transaction is individually correct and only the
# pair is wrong. Proving the fix needs two sessions whose statements interleave
# in a controlled order.
#
# This file is only the driver: it builds the cluster, applies the migrations and
# says how to reach the server. The checks live in `_concurrency_body.sh`, shared
# with the CI variant so the two cannot drift apart.
#
# Usage:  sudo sh supabase/verify/04_concurrency.sh
#
set -e

REPO=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
. "$REPO/supabase/verify/_cluster.sh"

WORK=${PGVERIFY_WORK:-/var/lib/pgverify-concurrency}
rm -rf "$WORK"
mkdir -p "$WORK"
chmod 777 "$WORK"

cluster_start "$WORK/data" "$WORK/sock"
trap 'cluster_stop; rm -rf "$WORK"' EXIT

cluster_migrate

# The server refuses to run as root, so everything that talks to it goes through
# the postgres OS user.
pg_exec() {
  as_pg "$1"
}

PSQL="psql -v ON_ERROR_STOP=0 -h $CLUSTER_SOCK -U postgres -d verify -X"

. "$REPO/supabase/verify/_concurrency_body.sh"
