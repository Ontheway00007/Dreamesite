#!/bin/sh
#
# Generates database types from the migrations, for auditing the hand-written
# `src/types/database.ts` against the schema the migrations actually produce.
#
# ## This is an audit tool, not the way to update types
#
# Prefer `npm run db:types`, which runs `supabase gen types --linked` against
# the real project. Failing that, `supabase gen types --local` against
# `supabase start`. Both see the real `auth` and `storage` schemas and the real
# extension set.
#
# This script sees neither: it applies `00_supabase_stubs.sql` first, so the
# `auth` and `storage` schemas are the minimal stand-ins the harness defines. The
# `public` schema is exact — that is what makes it useful for auditing — but the
# output is not what the CLI would produce against real Supabase, so it should
# not be committed as the generated types.
#
# It writes to a path you name and prints nothing else, so the comparison is
# yours to make:
#
#   sudo sh supabase/verify/gen-types.sh /tmp/generated.ts
#   diff <(...) ...
#
set -e

OUT=${1:-./generated-database.ts}

REPO=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
. "$REPO/supabase/verify/_cluster.sh"

if ! command -v supabase >/dev/null 2>&1; then
  echo "The Supabase CLI is not installed. Install it, or use npm run db:types."
  exit 1
fi

DATA=${PGGEN_DATA:-/var/lib/pggentypes}
SOCK=${PGGEN_SOCK:-/var/run/pggentypes}
PORT=${PGGEN_PORT:-55432}

rm -rf "$DATA" "$SOCK"
mkdir -p "$DATA" "$SOCK"
chown -R "$PGUSER_OS":"$PGUSER_OS" "$DATA" "$SOCK"

as_pg "initdb -D $DATA -A trust -U postgres" >/dev/null

# A TCP listener on loopback only, because `gen types --db-url` needs one.
as_pg "pg_ctl -D $DATA \
  -o \"-c listen_addresses='127.0.0.1' -p $PORT -k $SOCK\" \
  -l $DATA/server.log -w start" >/dev/null
trap 'as_pg "pg_ctl -D $DATA -w stop" >/dev/null 2>&1 || true' EXIT

as_pg "createdb -h $SOCK -p $PORT -U postgres verify"

PSQL="psql -v ON_ERROR_STOP=1 -h $SOCK -p $PORT -U postgres -d verify -X -q"
as_pg "$PSQL -f $REPO/supabase/verify/00_supabase_stubs.sql"
for f in "$REPO"/supabase/migrations/*.sql; do
  as_pg "$PSQL -f $f"
done

cd "$REPO"
supabase gen types typescript \
  --db-url "postgresql://postgres@127.0.0.1:$PORT/verify" \
  --schema public > "$OUT"

echo "Wrote $(wc -l < "$OUT") lines to $OUT"
echo "Compare against src/types/database.ts. Do not commit this as the generated types — see the header."
