#
# The concurrency checks themselves. Sourced by 04_concurrency.sh (local
# throwaway cluster) and ci-concurrency.sh (CI service container); not runnable
# on its own.
#
# ## Why this is a separate file
#
# The same reason `_cluster.sh` is. There are two ways to reach a PostgreSQL
# server here — a unix socket owned by the `postgres` OS user locally, and TCP to
# a service container in CI — and only one set of checks worth running against
# either. Copying the checks into both drivers would mean a check added to one
# silently missing from the other, and the CI job quietly testing less than the
# local run.
#
# The caller must provide:
#
#   PSQL      a psql invocation prefix carrying the connection arguments
#   pg_exec   runs a shell command string in whatever way can reach the server
#             (locally `su postgres -c`, in CI just `sh -c`)
#   WORK      a writable, world-writable directory for the FIFOs
#
# What is checked:
#
#   1. Two concurrent demotions of the last two super administrators: one wins,
#      one is refused, and the roster never reaches zero.
#   2. Publishing cannot use readiness that another transaction is in the middle
#      of destroying.
#   3. Two different properties do not block each other.
#   4. Ordered groups serialise: reorder against insert, delete, category change,
#      a second reorder, and an unrelated group.
#

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
  pg_exec "$PSQL < $WORK/$name.fifo > $WORK/$name.out 2>&1" &
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

fail() {
  echo "CHECK FAILED: $1"
  exit 1
}

query() {
  pg_exec "$PSQL -A -t -c \"$1\"" 2>/dev/null | tr -d ' \r' | head -1
}

# Confirms a backend is waiting on an ungranted advisory lock.
#
# Scoped to the current database: advisory locks are visible cluster-wide in
# pg_locks, and in CI the server may be shared with other databases.
assert_blocked_on_advisory_lock() {
  i=0
  while [ "$i" -lt 100 ]; do
    n=$(query "select count(*) from pg_locks where locktype = 'advisory' and not granted and database = (select oid from pg_database where datname = current_database())")
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

# ----------------------------------------------------------------------
# Fixtures
# ----------------------------------------------------------------------

pg_exec "$PSQL -q -v ON_ERROR_STOP=1 -f -" <<'SQL' >/dev/null
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
  null,
  -37.53, 144.90, '1', 'Example Street', '3064',
  'approximate', 500, 'automatic', null, null, null,
  false, false, true, true, false,
  -37.53, 144.90, 'Mickleham VIC', 'automatic', 'Mickleham', 'Approximate', false);

select public.save_property_location(
  'a2000000-0000-4000-8000-000000000002',
  null,
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
pg_exec "$PSQL -q -v ON_ERROR_STOP=1 -c \"set request.jwt.claim.sub = 'cc000003-0000-4000-8000-000000000003'; update public.admin_users set role = 'super_admin' where user_id = 'cc000001-0000-4000-8000-000000000001';\"" >/dev/null
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

echo ""
echo "=================== 4. Ordered groups serialise ==================="
echo ""

# A gallery of three, on property two.
pg_exec "$PSQL -q -v ON_ERROR_STOP=1 -f -" <<'SQL' >/dev/null
set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';

insert into public.property_images
  (id, property_id, image_type, storage_path, alt_text, is_published, sort_order)
values
  ('c1000001-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002',
   'gallery', 'properties/a2000000-0000-4000-8000-000000000002/gallery/abcdef01-2345-6789-abcd-ef01234567c1.jpg',
   'One', true, 0);
insert into public.property_images
  (id, property_id, image_type, storage_path, alt_text, is_published, sort_order)
values
  ('c1000002-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002',
   'gallery', 'properties/a2000000-0000-4000-8000-000000000002/gallery/abcdef01-2345-6789-abcd-ef01234567c2.jpg',
   'Two', true, 1);
insert into public.property_images
  (id, property_id, image_type, storage_path, alt_text, is_published, sort_order)
values
  ('c1000003-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000002',
   'gallery', 'properties/a2000000-0000-4000-8000-000000000002/gallery/abcdef01-2345-6789-abcd-ef01234567c3.jpg',
   'Three', true, 2);

-- A separate group on the same property, to prove groups are independent.
insert into public.property_images
  (id, property_id, image_type, storage_path, alt_text, is_published, sort_order)
values
  ('c2000001-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002',
   'floor_plan', 'properties/a2000000-0000-4000-8000-000000000002/floor-plans/abcdef01-2345-6789-abcd-ef01234567d1.png',
   'Ground floor', true, 0);
SQL

# --- 4a. Reorder versus a concurrent insert --------------------------------
#
# A holds the gallery lock by starting a reorder. B tries to add an image to the
# same group; its insert trigger must wait rather than landing mid-reorder.

printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "select public.reorder_property_images('a2000000-0000-4000-8000-000000000002', 'gallery', array['c1000003-0000-4000-8000-000000000003','c1000002-0000-4000-8000-000000000002','c1000001-0000-4000-8000-000000000001']::uuid[]);" \
  "\\echo A-REORDERED" >&3
wait_for a "A-REORDERED"
echo "PASS  session A reordered the gallery and holds the group lock"

printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "insert into public.property_images (id, property_id, image_type, storage_path, alt_text, is_published, sort_order) values ('c1000004-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000002','gallery','properties/a2000000-0000-4000-8000-000000000002/gallery/abcdef01-2345-6789-abcd-ef01234567c4.jpg','Four',true,3);" \
  "commit;" \
  "\\echo B-INSERTED" >&4

assert_blocked_on_advisory_lock "session B inserting into the group being reordered"

printf "%s\n" "commit;" "\\echo A-REORDER-COMMITTED" >&3
wait_for a "A-REORDER-COMMITTED"
wait_for b "B-INSERTED"

# The reorder applied, and the insert landed after it rather than inside it.
order_after=$(query "select string_agg(id::text, ',' order by sort_order) from public.property_images where property_id = 'a2000000-0000-4000-8000-000000000002' and image_type = 'gallery'")
case "$order_after" in
  c1000003*,c1000002*,c1000001*,c1000004*) : ;;
  *) fail "the reorder and the insert interleaved: order is $order_after" ;;
esac
echo "PASS  the insert waited, and landed after the reorder"

positions=$(query "select string_agg(distinct sort_order::text, ',' order by sort_order::text) from public.property_images where property_id = 'a2000000-0000-4000-8000-000000000002' and image_type = 'gallery'")
if [ "$positions" != "0,1,2,3" ]; then
  fail "positions are not contiguous after the interleaving: $positions"
fi
echo "PASS  positions remain contiguous from zero ($positions)"

# --- 4b. Reorder versus a concurrent delete --------------------------------

printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "select public.lock_group('property-image', 'a2000000-0000-4000-8000-000000000002', 'gallery');" \
  "\\echo A-HOLDS-GALLERY" >&3
wait_for a "A-HOLDS-GALLERY"

printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "delete from public.property_images where id = 'c1000004-0000-4000-8000-000000000004';" \
  "commit;" \
  "\\echo B-DELETED" >&4

assert_blocked_on_advisory_lock "session B deleting from a locked group"

printf "%s\n" "rollback;" "\\echo A-RELEASED" >&3
wait_for a "A-RELEASED"
wait_for b "B-DELETED"
echo "PASS  a delete waits for the group lock"

# --- 4c. Reorder versus a category change ---------------------------------
#
# Moving an image between groups locks both, so it must wait for either.

printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "select public.lock_group('property-image', 'a2000000-0000-4000-8000-000000000002', 'floor_plan');" \
  "\\echo A-HOLDS-PLANS" >&3
wait_for a "A-HOLDS-PLANS"

printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "update public.property_images set image_type = 'floor_plan' where id = 'c1000001-0000-4000-8000-000000000001';" \
  "commit;" \
  "\\echo B-RECATEGORISED" >&4

assert_blocked_on_advisory_lock "session B moving an image into a locked group"

printf "%s\n" "rollback;" "\\echo A-RELEASED-PLANS" >&3
wait_for a "A-RELEASED-PLANS"
wait_for b "B-RECATEGORISED"
echo "PASS  a category change waits for the destination group's lock"

# It arrived at the end of the destination group, not on top of the plan
# already there.
plan_positions=$(query "select string_agg(distinct sort_order::text, ',' order by sort_order::text) from public.property_images where property_id = 'a2000000-0000-4000-8000-000000000002' and image_type = 'floor_plan'")
if [ "$plan_positions" != "0,1" ]; then
  fail "the moved image collided in its new group: positions $plan_positions"
fi
echo "PASS  the moved image took the next free position ($plan_positions)"

# --- 4d. Two simultaneous reorders ----------------------------------------

printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "select public.lock_group('property-image', 'a2000000-0000-4000-8000-000000000002', 'gallery');" \
  "\\echo A-HOLDS-AGAIN" >&3
wait_for a "A-HOLDS-AGAIN"

printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "select public.reorder_property_images('a2000000-0000-4000-8000-000000000002', 'gallery', array['c1000002-0000-4000-8000-000000000002','c1000003-0000-4000-8000-000000000003']::uuid[]);" \
  "commit;" \
  "\\echo B-SECOND-REORDER" >&4

assert_blocked_on_advisory_lock "session B reordering a group already locked"

printf "%s\n" "rollback;" "\\echo A-DONE-AGAIN" >&3
wait_for a "A-DONE-AGAIN"
wait_for b "B-SECOND-REORDER"
echo "PASS  a second reorder of the same group waits for the first"

# --- 4e. Independent groups do not contend --------------------------------

printf "%s\n" \
  "begin;" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "select public.lock_group('property-image', 'a2000000-0000-4000-8000-000000000002', 'gallery');" \
  "\\echo A-HOLDS-GALLERY-3" >&3
wait_for a "A-HOLDS-GALLERY-3"

printf "%s\n" \
  "begin;" \
  "set local statement_timeout = '4s';" \
  "set request.jwt.claim.sub = 'cc000001-0000-4000-8000-000000000001';" \
  "insert into public.property_features (id, property_id, category, label, sort_order) values ('c3000001-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','energy','Independent group',0);" \
  "commit;" \
  "\\echo B-OTHER-GROUP" >&4
wait_for b "B-OTHER-GROUP"

if grep -qF "canceling statement due to statement timeout" "$WORK/b.out"; then
  echo "Session B output:"
  cat "$WORK/b.out"
  fail "an unrelated group blocked on the gallery lock"
fi
echo "PASS  a different group is unaffected by the gallery lock"

printf "%s\n" "rollback;" "\\echo A-GROUPS-DONE" >&3
wait_for a "A-GROUPS-DONE"

# ----------------------------------------------------------------------

printf "%s\n" "\\q" >&3
printf "%s\n" "\\q" >&4
exec 3>&-
exec 4>&-
wait 2>/dev/null || true

echo ""
echo "All concurrency checks passed."
