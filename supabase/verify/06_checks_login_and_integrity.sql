-- Verification harness — login hardening and standing integrity invariants
--
-- Two halves.
--
-- Sections 1–3 assert what migration 0013 claims about login recording and
-- throttling.
--
-- Sections 4–7 assert invariants that span every migration from 0006 onward.
-- They are not tied to one migration on purpose: "no SECURITY DEFINER function
-- is missing a pinned search_path" is a property of the whole schema, and the
-- only way it stays true is if something checks it after every change. A test
-- written against one migration stops being run the moment the next one lands.

\set ON_ERROR_STOP on

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';

-- ======================================================================
-- 1. Recording an attempt
-- ======================================================================

do $$
declare
  v_row public.admin_login_attempts;
begin
  perform public.record_login_attempt(
    '  Admin@Example.COM  ', 'hash-abc', false, 'bad_credentials');

  select * into v_row from public.admin_login_attempts
  order by created_at desc limit 1;

  -- Lowercased and trimmed by the function, so throttling cannot be evaded by
  -- changing capitalisation or padding the field.
  if v_row.email <> 'admin@example.com' then
    raise exception 'CHECK FAILED: the email was stored as "%"', v_row.email;
  end if;

  if v_row.succeeded then
    raise exception 'CHECK FAILED: a failure was recorded as a success';
  end if;

  raise notice 'PASS  record_login_attempt normalises the email it stores';
end $$;

-- A blank identifier is not an attempt, and must not be storable.
do $$
declare
  v_before integer;
begin
  select count(*) into v_before from public.admin_login_attempts;

  perform public.record_login_attempt('   ', 'hash-abc', false, 'bad_credentials');
  perform public.record_login_attempt('', null, false, null);

  if (select count(*) from public.admin_login_attempts) <> v_before then
    raise exception 'CHECK FAILED: a blank email was recorded';
  end if;

  raise notice 'PASS  a blank email is not recorded';
end $$;

-- The reason vocabulary is closed, so the column can be grouped and counted.
do $$
begin
  begin
    insert into public.admin_login_attempts (email, succeeded, reason)
    values ('x@example.com', false, 'because-i-said-so');
    raise exception 'CHECK FAILED: an unknown reason was accepted';
  exception when check_violation then
    raise notice 'PASS  the failure-reason vocabulary is enforced';
  end;
end $$;

-- ======================================================================
-- 2. What an unauthenticated caller may and may not do
-- ======================================================================
--
-- A failed login is unauthenticated by definition, so `anon` has to be able to
-- record one. Everything else must be closed.

do $$
begin
  if not has_function_privilege('anon', 'public.record_login_attempt(text, text, boolean, text)', 'execute') then
    raise exception 'CHECK FAILED: anon cannot record a login attempt';
  end if;

  if not has_function_privilege('anon', 'public.check_login_throttle(text, text)', 'execute') then
    raise exception 'CHECK FAILED: anon cannot consult the throttle';
  end if;

  -- The table itself must be closed to anon in every direction.
  for i in 1..1 loop
    if has_table_privilege('anon', 'public.admin_login_attempts', 'select')
       or has_table_privilege('anon', 'public.admin_login_attempts', 'insert')
       or has_table_privilege('anon', 'public.admin_login_attempts', 'update')
       or has_table_privilege('anon', 'public.admin_login_attempts', 'delete')
    then
      raise exception 'CHECK FAILED: anon holds a direct grant on admin_login_attempts';
    end if;
  end loop;

  -- Administrators read it; nobody writes it directly.
  if not has_table_privilege('authenticated', 'public.admin_login_attempts', 'select') then
    raise exception 'CHECK FAILED: administrators cannot read the login log';
  end if;

  if has_table_privilege('authenticated', 'public.admin_login_attempts', 'insert')
     or has_table_privilege('authenticated', 'public.admin_login_attempts', 'update')
     or has_table_privilege('authenticated', 'public.admin_login_attempts', 'delete')
  then
    raise exception 'CHECK FAILED: authenticated can write admin_login_attempts directly';
  end if;

  raise notice 'PASS  the login log is function-write, admin-read, anon-blind';
end $$;

-- And an anonymous caller genuinely cannot read what it just wrote.
do $$
begin
  set local role anon;

  begin
    perform 1 from public.admin_login_attempts limit 1;
    reset role;
    raise exception 'CHECK FAILED: anon read the login log';
  exception when insufficient_privilege then
    reset role;
    raise notice 'PASS  anon cannot read the login log it writes to';
  end;
end $$;

-- Purging is administrator-only and cannot erase the throttle window.
do $$
begin
  if has_function_privilege('anon', 'public.purge_login_attempts(integer)', 'execute') then
    raise exception 'CHECK FAILED: anon can purge the login log';
  end if;

  begin
    perform public.purge_login_attempts(0);
    raise exception 'CHECK FAILED: a zero-day retention was accepted';
  exception when sqlstate 'PT422' then
    raise notice 'PASS  purge_login_attempts refuses a retention under one day';
  end;
end $$;

-- ======================================================================
-- 3. Throttling
-- ======================================================================

do $$
declare
  v_email text := 'throttle-test@example.com';
  v_decision record;
  i integer;
begin
  delete from public.admin_login_attempts where email = v_email;

  -- Nothing recorded: allowed, no challenge.
  select * into v_decision from public.check_login_throttle(v_email, null);

  if not v_decision.allowed or v_decision.requires_captcha then
    raise exception 'CHECK FAILED: a first attempt was throttled';
  end if;

  -- Three failures: still allowed, but a challenge is now required.
  for i in 1..3 loop
    perform public.record_login_attempt(v_email, null, false, 'bad_credentials');
  end loop;

  select * into v_decision from public.check_login_throttle(v_email, null);

  if not v_decision.allowed then
    raise exception 'CHECK FAILED: three failures blocked the account outright';
  end if;

  if not v_decision.requires_captcha then
    raise exception 'CHECK FAILED: three failures did not demand a challenge';
  end if;

  raise notice 'PASS  three failures demand a challenge without blocking';

  -- Ten failures: blocked, with a usable retry hint.
  for i in 1..7 loop
    perform public.record_login_attempt(v_email, null, false, 'bad_credentials');
  end loop;

  select * into v_decision from public.check_login_throttle(v_email, null);

  if v_decision.allowed then
    raise exception 'CHECK FAILED: ten failures did not block (% counted)',
      v_decision.recent_failures;
  end if;

  if v_decision.retry_after_seconds <= 0 then
    raise exception 'CHECK FAILED: a blocked identifier got no retry hint';
  end if;

  raise notice 'PASS  ten failures block, with a % second retry hint',
    v_decision.retry_after_seconds;
end $$;

-- A success must not clear the record of the run that preceded it.
do $$
declare
  v_email text := 'throttle-test@example.com';
  v_decision record;
begin
  perform public.record_login_attempt(v_email, null, true, null);

  select * into v_decision from public.check_login_throttle(v_email, null);

  if v_decision.allowed then
    raise exception
      'CHECK FAILED: one success cleared % recorded failures',
      v_decision.recent_failures;
  end if;

  raise notice 'PASS  a successful attempt does not reset the failure count';
end $$;

-- Throttling by address is independent of the email, so a run spread across
-- many accounts from one client is still caught.
do $$
declare
  v_decision record;
  i integer;
begin
  for i in 1..10 loop
    perform public.record_login_attempt(
      'spray-' || i || '@example.com', 'one-client-hash', false, 'bad_credentials');
  end loop;

  -- A previously unseen email, from the same client.
  select * into v_decision
  from public.check_login_throttle('never-seen@example.com', 'one-client-hash');

  if v_decision.allowed then
    raise exception 'CHECK FAILED: a spray across accounts from one client was allowed';
  end if;

  raise notice 'PASS  throttling by address catches a spray across accounts';
end $$;

-- Failures outside the window stop counting.
do $$
declare
  v_email text := 'aged-out@example.com';
  v_decision record;
  i integer;
begin
  for i in 1..12 loop
    insert into public.admin_login_attempts (email, succeeded, reason, created_at)
    values (v_email, false, 'bad_credentials', now() - interval '20 minutes');
  end loop;

  select * into v_decision from public.check_login_throttle(v_email, null);

  if not v_decision.allowed then
    raise exception 'CHECK FAILED: failures older than the window still block';
  end if;

  raise notice 'PASS  failures age out of the throttle window';
end $$;

-- ======================================================================
-- 4. The audit log cannot be rewritten
-- ======================================================================
--
-- Asserted here rather than only in 01_checks because it is the invariant most
-- likely to be broken by accident: any later migration adding a convenience
-- grant on `audit_log` would undo it silently.

do $$
declare
  v_id uuid;
begin
  insert into public.audit_log (user_id, action, entity_type, entity_id)
  values (null, 'created', 'integrity_probe', gen_random_uuid())
  returning id into v_id;

  begin
    update public.audit_log set action = 'deleted' where id = v_id;
    raise exception 'CHECK FAILED: an audit row was updated';
  exception when others then
    null;
  end;

  begin
    delete from public.audit_log where id = v_id;
    raise exception 'CHECK FAILED: an audit row was deleted';
  exception when others then
    null;
  end;

  if not exists (select 1 from public.audit_log where id = v_id) then
    raise exception 'CHECK FAILED: the probe row did not survive';
  end if;

  raise notice 'PASS  audit rows cannot be updated or deleted';
end $$;

do $$
begin
  for i in 1..1 loop
    if has_table_privilege('authenticated', 'public.audit_log', 'update')
       or has_table_privilege('authenticated', 'public.audit_log', 'delete')
       or has_table_privilege('anon', 'public.audit_log', 'select')
    then
      raise exception 'CHECK FAILED: a grant on audit_log contradicts append-only';
    end if;
  end loop;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_log'
      and cmd in ('UPDATE', 'DELETE')
  ) then
    raise exception 'CHECK FAILED: an UPDATE or DELETE policy exists on audit_log';
  end if;

  raise notice 'PASS  no grant or policy permits rewriting audit_log';
end $$;

-- ======================================================================
-- 5. Every SECURITY DEFINER function pins its search_path
-- ======================================================================
--
-- A definer function runs with its owner's privileges. Without a pinned
-- `search_path`, a caller who can create a schema can shadow `public` and have
-- the function operate on their tables instead — with the owner's rights. This
-- is the highest-consequence mistake available in this schema, and it is one
-- forgotten line.
--
-- Written as a scan of every definer function rather than a list, so a function
-- added later is covered without anyone remembering to add it here.

do $$
declare
  v_unpinned text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.proname)
  into v_unpinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as config
      where config like 'search_path=%'
    );

  if v_unpinned is not null then
    raise exception
      'CHECK FAILED: SECURITY DEFINER without a pinned search_path: %', v_unpinned;
  end if;

  raise notice 'PASS  every SECURITY DEFINER function in public pins search_path';
end $$;

-- Every definer function that writes must also decide who may call it. A scan
-- again, with the read-only ones named as deliberate exceptions.
do $$
declare
  v_missing text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_missing
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.prosrc not like '%is_admin()%'
    and p.prosrc not like '%is_super_admin()%'
    and p.proname not in (
      -- Authorization helpers: they *are* the check.
      'is_admin', 'is_super_admin',
      -- Deliberately callable unauthenticated. Section 2 covers what they may do.
      'record_login_attempt', 'check_login_throttle',
      -- Triggers, invoked by the executor rather than by a caller. The table's
      -- own RLS policy decides who may cause them to fire.
      'flag_stale_public_location', 'serialise_group_mutation',
      -- A pure predicate over a path string. It writes nothing and grants
      -- nothing; the storage policies call it to decide, so it is the check
      -- rather than something needing one.
      'is_valid_property_media_path'
    );

  if v_missing is not null then
    raise exception
      'CHECK FAILED: SECURITY DEFINER functions with no authorization check: %',
      v_missing;
  end if;

  raise notice 'PASS  every privileged definer function checks authorization';
end $$;

-- ======================================================================
-- 6. No privileged function is callable by anon
-- ======================================================================
--
-- The allow-list is short and every entry has a reason. Anything else acquiring
-- an anon grant is a mistake.

do $$
declare
  v_leaked text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'execute')
    /*
      Extension-owned functions are excluded. `pgcrypto` grants EXECUTE to
      PUBLIC on all of its own functions, which is the extension's decision and
      not a leak in this schema — and on a real Supabase project the extension
      lives in `extensions` rather than `public`, so it would not appear at all.
      The harness installs it into `public`, so it is filtered by dependency
      instead of by name.
    */
    and not exists (
      select 1 from pg_depend d
      where d.objid = p.oid and d.deptype = 'e'
    )
    and p.proname not in (
      -- Login recording and throttling, which happen before authentication.
      'record_login_attempt', 'check_login_throttle',
      -- Trigger functions. Not callable as such; the grant is incidental.
      'set_updated_at'
    );

  if v_leaked is not null then
    raise exception 'CHECK FAILED: anon can execute: %', v_leaked;
  end if;

  raise notice 'PASS  anon can execute only the two pre-authentication functions';
end $$;

-- ======================================================================
-- 7. Direct grants match the RLS story
-- ======================================================================
--
-- RLS only constrains what a grant permits. A table with a write grant and no
-- write policy is closed today and open the moment somebody adds a permissive
-- policy for another reason — so the grants themselves are asserted.

do $$
declare
  v_table text;
begin
  -- Location tables: readable by administrators, written only through functions.
  foreach v_table in array array[
    'public.property_private_locations',
    'public.property_location_settings',
    'public.property_public_locations'
  ]
  loop
    if has_table_privilege('authenticated', v_table, 'insert')
       or has_table_privilege('authenticated', v_table, 'update')
       or has_table_privilege('authenticated', v_table, 'delete')
    then
      raise exception 'CHECK FAILED: % is directly writable', v_table;
    end if;
  end loop;

  -- Enquiries: anonymous insert only.
  if has_table_privilege('anon', 'public.enquiries', 'select')
     or has_table_privilege('anon', 'public.enquiries', 'update')
     or has_table_privilege('anon', 'public.enquiries', 'delete')
  then
    raise exception 'CHECK FAILED: anon has more than INSERT on enquiries';
  end if;

  -- The private tables must be invisible to anonymous visitors entirely.
  if has_table_privilege('anon', 'public.property_private_locations', 'select')
     or has_table_privilege('anon', 'public.property_location_settings', 'select')
     or has_table_privilege('anon', 'public.admin_users', 'select')
  then
    raise exception 'CHECK FAILED: anon can read a private table';
  end if;

  raise notice 'PASS  direct grants match the RLS model';
end $$;

-- ======================================================================
-- PostgREST embedding ambiguity
-- ======================================================================
--
-- Two foreign keys between the same pair of tables make a PostgREST embed
-- ambiguous. The API then answers HTTP 300 / PGRST201 instead of returning
-- rows, and every read that embeds the child silently yields nothing.
--
-- This is not hypothetical. Migration 0010 added
-- `properties.seo_og_image_id -> property_images.id` for the social-preview
-- override, alongside the existing `property_images.property_id ->
-- properties.id`. From then on `property_images (...)` was ambiguous, so the
-- listing, the homepage and the property page all returned no data against a
-- real project — while every local check still passed, because this harness
-- speaks SQL rather than PostgREST and the unit tests mock the client. It was
-- found only by querying a live deployment.
--
-- The fix is a hint in the select: `property_images!property_images_property_id_fkey`.
-- The schema cannot tell whether the application has applied it, so this check
-- does the next best thing: it lists every ambiguous pair and fails on any it
-- does not already know about. Adding a second foreign key between two tables
-- is legitimate; doing it without disambiguating the embed is not, and this
-- forces the decision to be made deliberately.
--
-- If this fails, either add the hint in `src/lib/properties/supabase-repository.ts`
-- and list the pair below, or reconsider the foreign key.

do $$
declare
  v_pair text;
  v_unexpected text[] := array[]::text[];
begin
  for v_pair in
    select least(src.relname, tgt.relname) || ' <-> ' || greatest(src.relname, tgt.relname)
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    join pg_namespace n on n.oid = src.relnamespace
    where con.contype = 'f'
      and n.nspname = 'public'
    group by least(src.relname, tgt.relname), greatest(src.relname, tgt.relname)
    having count(*) > 1
  loop
    -- Known and handled by a hint in the repository's select strings.
    if v_pair <> 'properties <-> property_images' then
      v_unexpected := array_append(v_unexpected, v_pair);
    end if;
  end loop;

  if array_length(v_unexpected, 1) > 0 then
    raise exception
      'CHECK FAILED: ambiguous PostgREST embedding for %. Add a !constraint hint to the select, or the embed will return HTTP 300.',
      array_to_string(v_unexpected, ', ');
  end if;

  raise notice 'PASS  every ambiguous foreign-key pair is one the repository disambiguates';
end $$;

do $$
begin
  raise notice '';
  raise notice 'All login and integrity checks passed.';
end $$;
