#
# Shared throwaway-cluster helpers. Sourced by run-local.sh and
# 04_concurrency.sh; not executable on its own.
#
# Both scripts need the same thing: a PostgreSQL cluster that exists only for
# the length of the run, with the stubs and every migration applied. Keeping it
# here means the two cannot drift apart — a migration added to one would
# otherwise be missing from the other, and the concurrency script would be
# testing a different schema from the assertions.
#
# Requires a PostgreSQL 15 server binary, psql, and pgcrypto. On Amazon
# Linux 2023:
#
#   dnf install -y postgresql15-server postgresql15 postgresql15-contrib
#

PGUSER_OS=${PGVERIFY_OS_USER:-postgres}

# Runs a command as the postgres OS user. The server refuses to run as root.
as_pg() {
  su "$PGUSER_OS" -s /bin/sh -c "$1"
}

# cluster_start <data-dir> <socket-dir>
cluster_start() {
  CLUSTER_DATA=$1
  CLUSTER_SOCK=$2

  rm -rf "$CLUSTER_DATA" "$CLUSTER_SOCK"
  mkdir -p "$CLUSTER_DATA" "$CLUSTER_SOCK"
  chown -R "$PGUSER_OS":"$PGUSER_OS" "$CLUSTER_DATA" "$CLUSTER_SOCK"

  as_pg "initdb -D $CLUSTER_DATA -A trust -U postgres" >/dev/null
  echo "initdb: ok"

  # No TCP listener: a unix socket in a private directory cannot be reached
  # from outside this machine, which is what you want from a test cluster.
  as_pg "pg_ctl -D $CLUSTER_DATA \
    -o \"-c listen_addresses='' -k $CLUSTER_SOCK\" \
    -l $CLUSTER_DATA/server.log -w start" >/dev/null
  echo "server: started"

  as_pg "createdb -h $CLUSTER_SOCK -U postgres verify"
}

cluster_stop() {
  as_pg "pg_ctl -D $CLUSTER_DATA -w stop" >/dev/null 2>&1 || true
}

# Applies the stubs and every migration, in order.
cluster_migrate() {
  psql_cmd="psql -v ON_ERROR_STOP=1 -h $CLUSTER_SOCK -U postgres -d verify -X -q"

  echo "--- stubs"
  as_pg "$psql_cmd -f $REPO/supabase/verify/00_supabase_stubs.sql"

  echo "--- migrations"
  for f in "$REPO"/supabase/migrations/*.sql; do
    echo "    $(basename "$f")"
    as_pg "$psql_cmd -f $f"
  done
}
