#!/bin/sh
#
# Concurrency verification — two live sessions.
#
# The other check files run in a single session, which is exactly why they
# cannot test the two guarantees that matter most here. Write skew is invisible
# from one connection: each transaction is individually correct and only the
# pair is wrong. Proving the fix needs two sessions whose statements interleave
# in a controlled order.
#
# Two sessions are driven through FIFOs so their statements can be sequenced
# deliberately, and a third read-only session observes the lock table to confirm
# the blocking actually happened — a test that passes because the second
# transaction failed for some unrelated reason would be worse than no test.
#
# What is checked:
#
#   1. Two concurrent demotions of the last two super administrators: one wins,
#      one is refused, and the roster never reaches zero.
#   2. Publishing cannot use readiness that another transaction is in the middle
#      of destroying.
#   3. Two different properties do not block each other.
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

PSQL="psql -v ON_ERROR_STOP=0 -h $CLUSTER_SOCK -U postgres -d verify -X"

# ----------------------------------------------------------------------
# Session plumbing
# ----------------------------------------------------------------------
#
# A FIFO held open by a redirected file descriptor keeps psql waiting for more
# input instead of exiting at end-of-file, which is what makes an interleaved
# script possible at all.

start_session() {
  name=$1
  mkfifo "$WORK/$name.fifo"
  chmod 666 "$WORK/$name.fifo"
  : > "$WORK/$name.out"
  chmod 666 "$WORK/$name.out"
  as_pg "$PSQL < $WORK/$name.fifo > $WORK/$name.out 2>&1" &
}

# send <session> <sql>
send() {
  printf '%s\n' "$2" > "$WORK/$1.fifo"
}

# Waits for a session's output to contain a string, up to ~10s.
wait_for() {
  i=0
  while [ "$i" -lt 100 ]; do
    if grep -qF "$2" "$WORK/$1.out" 2>/dev/null; then
      return 0
    fi
    sleep 0.1
    i=$((i + 1))
  done
  echo "TIMED OUT waiting for '$2' in session $1. Output was:"
  cat "$WORK/$1.out"
  exit 1
}

# Confirms a backend is waiting on an ungranted advisory lock.
assert_blocked_on_advisory_lock() {
  i=0
  while [ "$i" -lt 100 ]; do
    n=$(as_pg "$PSQL -A -t -c \"select count(*) from pg_locks where locktype = 'advisory' and not granted\"" 2>/dev/null | tr -d ' \r')
    if [ "$n" != "" ] && [ "$n" -ge 1 ]; then
      echo "PASS  $1 is genuinely waiting on the advisory lock"
      return 0
    fi
    sleep 0.1
    i=$((i + 1))
  done
  echo "CHECK FAILED: $1 never blocked on an advisory lock — the lock is not doing anything"
  exit 1
}

fail() {
  echo "CHECK FAILED: $1"
  exit 1
}

query() {
  as_pg "$PSQL -A -t -c \"$1\"" 2>/dev/null | tr -d ' \r' | head -1
}

# ----------------------------------------------------------------------
# Fixtures
# ----------------------------------------------------------------------

as_pg "$PSQL -q -v ON_ERROR_STOP=1 -f -" <<'SQL' >/dev/null
create extension if not exists "pgcrypto";

-- Three users: two super administrators, and an actor who is neither so the
-- self-lockout guard stays out of the way.
insert into auth.users (id, email) values
  ('cc000001-0000-4000-8000-000000000001', 'super-x@example.com'),
  ('cc000002-0000-4000-8000-000000000002', 'super-y@example.com'),
  ('cc000003-0000-4000-8000-000000000003', 'actor@example.com')
on conflict do nothing;

insert into public.admin_users (user_id, email, role, is_active) values
  ('cc000001-0000-4000-8000-000000000001', 'super-x@example.com', 'super_admin', true),
  ('cc000002-0000-4000-8000-000000000002', 'super-y@example.com', 'super_admin', true),
  ('cc000003-0000-4000-8000-000000000003', 'actor@example.com',   'admin',       true)
on conflict do nothing;

-- Two properties, each complete enough to publish, so the publish race has
-- something real to race over.
insert into public.properties (
  id, slug, name, summary, status, suburb, state,
  bedrooms, bathrooms, car_spaces, land_size_sqm
) values
  ('a1000000-0000-4000-8000-000000000001', 'race-one', 'Race One', 'One.',
   'move-in-ready', 'Mickleham', 'VIC', 3, 2, 1, 300),
  ('a2000000-0000-4000-8000-000000000002', 'race-two', 'Race Two', 'Two.',
   'move-in-ready', 'Craigieburn', 'VIC', 3, 2, 1, 300)
on conflict do nothing;

set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';

select public.save_property_location(
  'a1000000-0000-4000-8000-000000000001',
  -37.53, 144.90, '1', 'Example Street', '3064',
  'approximate', 500, 'automatic', null, null, null,
  false, false, true, true, false,
  -37.53, 144.90, 'Mickleham VIC', 'automatic', 'Mickleham', 'Approximate', false);

select public.save_property_location(
  'a2000000-0000-4000-8000-000000000002',
  -37.60, 144.94, '2', 'Example Street', '3064',
  'approximate', 500, 'automatic', null, null, null,
  false, false, true, true, false,
  -37.60, 144.94, 'Craigieburn VIC', 'automatic', 'Craigieburn', 'Approximate', false);
SQL

echo ""
echo "=================== 1. Two concurrent super-admin removals ==================="
echo ""

start_session a
start_session b
exec 3> "$WORK/a.fifo"
exec 4> "$WORK/b.fifo"

# Session A demotes X. The guard takes the roster lock and finds Y still active,
# so it allows the change. A does not commit yet.
printf "%s\n" \
  "\\echo A-READY" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000003-0000-4000-8000-000000000003';" \
  "update public.admin_users set role = 'admin' where user_id = 'cc000001-0000-4000-8000-000000000001';" \
  "\\echo A-DEMOTED-X" >&3
wait_for a "A-DEMOTED-X"
echo "PASS  session A demoted the first super administrator and holds the roster lock"

# Session B tries to demote Y. Before the fix its guard would have counted X as
# still active — A has not committed — and allowed it. Now it must wait.
printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000003-0000-4000-8000-000000000003';" \
  "update public.admin_users set role = 'admin' where user_id = 'cc000002-0000-4000-8000-000000000002';" \
  "\\echo B-FINISHED" >&4

assert_blocked_on_advisory_lock "session B"

# Releasing A lets B re-count. Its fresh snapshot now includes A's committed
# demotion, so nothing is left and B must be refused.
printf "%s\n" "commit;" "\\echo A-COMMITTED" >&3
wait_for a "A-COMMITTED"
wait_for b "B-FINISHED"

if ! grep -qF "at least one active super administrator" "$WORK/b.out"; then
  echo "Session B output:"
  cat "$WORK/b.out"
  fail "session B was not refused — two concurrent demotions both succeeded"
fi
echo "PASS  session B was refused with the last-super-administrator message"

printf "%s\n" "rollback;" "\\echo B-DONE" >&4
wait_for b "B-DONE"

remaining=$(query "select count(*) from public.admin_users where role = 'super_admin' and is_active")
if [ "$remaining" != "1" ]; then
  fail "expected exactly 1 active super administrator, found $remaining"
fi
echo "PASS  the roster still has an active super administrator ($remaining)"

# With a second super administrator promoted, the change A was refused becomes
# legal again — the guard protects the invariant, not the row.
as_pg "$PSQL -q -v ON_ERROR_STOP=1 -c \"set request.jwt.claim.sub = 'cc000003-0000-4000-8000-000000000003'; update public.admin_users set role = 'super_admin' where user_id = 'cc000001-0000-4000-8000-000000000001';\"" >/dev/null
promoted=$(query "select count(*) from public.admin_users where role = 'super_admin' and is_active")
if [ "$promoted" != "2" ]; then
  fail "could not promote a second super administrator, count is $promoted"
fi
echo "PASS  promoting another super administrator is permitted, and re-enables removals"

echo ""
echo "=================== 2. Publish versus location mutation ==================="
echo ""

# Session A clears the location for property one, holding the property lock.
printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "select public.clear_property_location('a1000000-0000-4000-8000-000000000001');" \
  "\\echo A-CLEARED" >&3
wait_for a "A-CLEARED"
echo "PASS  session A cleared the location and holds the property lock"

# Session B tries to publish the same property. Its readiness check must not run
# until A has finished, or it would see the location A is deleting.
printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "select public.publish_property_if_ready('a1000000-0000-4000-8000-000000000001');" \
  "\\echo B-PUBLISH-RETURNED" >&4

assert_blocked_on_advisory_lock "session B publishing"

printf "%s\n" "commit;" "\\echo A-CLEAR-COMMITTED" >&3
wait_for a "A-CLEAR-COMMITTED"
wait_for b "B-PUBLISH-RETURNED"

# B must have come back with blockers rather than an empty array.
if grep -qF "Save the Location tab" "$WORK/b.out" \
   || grep -qF "location privacy settings" "$WORK/b.out"; then
  echo "PASS  publishing returned blockers after waiting for the location change"
else
  echo "Session B output:"
  cat "$WORK/b.out"
  fail "publishing did not report the location blockers it should have seen"
fi

printf "%s\n" "commit;" "\\echo B-PUBLISH-DONE" >&4
wait_for b "B-PUBLISH-DONE"

published=$(query "select is_published from public.properties where id = 'a1000000-0000-4000-8000-000000000001'")
if [ "$published" != "f" ]; then
  fail "the property was published despite having no location (is_published = $published)"
fi
echo "PASS  the property stayed a draft"

echo ""
echo "=================== 3. Different properties do not contend ==================="
echo ""

# A holds property one's lock and keeps it.
printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "select public.lock_property('a1000000-0000-4000-8000-000000000001');" \
  "\\echo A-HOLDS-ONE" >&3
wait_for a "A-HOLDS-ONE"

# B publishes property two. A short statement_timeout turns "blocked" into a
# visible failure rather than a hang: if the locks were global, this errors.
printf "%s\n" \
  "begin;" \
  "set local statement_timeout = '4s';" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "select public.publish_property_if_ready('a2000000-0000-4000-8000-000000000002');" \
  "commit;" \
  "\\echo B-OTHER-PROPERTY-DONE" >&4
wait_for b "B-OTHER-PROPERTY-DONE"

if grep -qF "canceling statement due to statement timeout" "$WORK/b.out"; then
  echo "Session B output:"
  cat "$WORK/b.out"
  fail "publishing one property blocked on another property's lock"
fi

published_two=$(query "select is_published from public.properties where id = 'a2000000-0000-4000-8000-000000000002'")
if [ "$published_two" != "t" ]; then
  echo "Session B output:"
  cat "$WORK/b.out"
  fail "the second property did not publish (is_published = $published_two)"
fi
echo "PASS  a property publishes while an unrelated property's lock is held"

printf "%s\n" "rollback;" "\\echo A-FINAL" >&3
wait_for a "A-FINAL"

# ----------------------------------------------------------------------

printf "%s\n" "\\q" >&3
printf "%s\n" "\\q" >&4
exec 3>&-
exec 4>&-
wait 2>/dev/null || true

echo ""
echo "All concurrency checks passed."
