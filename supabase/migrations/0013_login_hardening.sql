-- ======================================================================
-- 0013  Login attempt recording and throttling
-- ======================================================================
--
-- Additive. Nothing earlier is edited.
--
-- The login flow had three problems.
--
-- 1. **It leaked account existence.** Wrong credentials returned "Invalid email
--    or password"; correct credentials for a non-administrator returned "You do
--    not have administrator access". So anyone holding a valid password for any
--    account on the project learned whether that account existed — and, worse,
--    that the credential was correct. Fixed in the application: one message for
--    every rejection.
--
-- 2. **Nothing recorded attempts.** A password-guessing run against `/admin`
--    left no trace anywhere.
--
-- 3. **Nothing throttled attempts.** Supabase Auth applies its own rate limits,
--    but they are per-project and not something this application can reason
--    about, tune or observe.
--
-- ## Why the state lives in the database
--
-- The obvious implementation is a counter in module scope. On Vercel that
-- counter is per-instance and per-cold-start: concurrent lambdas each keep their
-- own, and an attacker distributing requests defeats it without trying. It also
-- resets whenever the platform recycles the instance. A throttle that is
-- trivially bypassed is worse than none, because it reads as protection.
--
-- The database is the one piece of shared state every instance already has.
--
-- ## Why an unauthenticated role may write here
--
-- A failed login is by definition unauthenticated, so `anon` has to be able to
-- record one. That is a write path open to the internet, and it is deliberately
-- as narrow as possible: `anon` may execute two functions and cannot SELECT,
-- UPDATE or DELETE the table at all. It cannot read what it wrote, cannot
-- enumerate other attempts, and cannot clear its own history.
--
-- Flooding is the residual risk, and it is self-defeating: the table *is* the
-- throttle, so an attacker filling it locks out the identifier they are filling
-- it under. Retention is documented in `docs/operations.md`.

create table public.admin_login_attempts (
  id uuid primary key default gen_random_uuid(),

  /*
    The email as submitted, lowercased.

    Storing it is what makes per-account throttling possible, and it is the
    minimum needed for that. It is also personal data, which is why the
    retention window is documented and why nothing else identifying is kept
    alongside it.
  */
  email text not null,

  /*
    A hash of the client address, never the address.

    Per-address throttling needs to recognise a repeat visitor, which a hash
    does. It does not need to know where they are, which an address would tell
    anyone who later read this table. The application salts it with a
    server-only secret, so the hashes are not reversible with a list of
    candidate addresses either.
  */
  ip_hash text,

  succeeded boolean not null,

  /*
    Why it failed, for engineers. Never shown to the person logging in — that is
    the entire point of the single neutral message.

    A closed vocabulary rather than free text, so the column can be counted and
    grouped rather than only read.
  */
  reason text
    check (reason is null or reason in (
      'bad_credentials',    -- wrong password, or no such account
      'not_admin',          -- authenticated, but no admin_users row
      'inactive_admin',     -- admin_users row exists and is_active is false
      'throttled',          -- refused before credentials were checked
      'captcha_failed',     -- challenge missing or rejected
      'service_error'       -- Supabase unreachable or returned an error
    )),

  created_at timestamptz not null default now()
);

comment on table public.admin_login_attempts is
  'Login attempt log for /admin. Backs throttling and answers "was this account attacked". Contains an email and a salted address hash; never a password, a token or a raw IP. Writable only through record_login_attempt.';

alter table public.admin_login_attempts enable row level security;

-- Administrators may read the log. Nobody may write it directly, update it or
-- delete from it — the two functions below are the only way in, and neither
-- offers a way out.
create policy "admins read login attempts"
  on public.admin_login_attempts for select
  to authenticated
  using (public.is_admin());

revoke all on public.admin_login_attempts from anon, authenticated;
grant select on public.admin_login_attempts to authenticated;

-- Throttle lookups scan by identifier within a time window, which is exactly
-- what these cover. Partial on failures: a successful attempt never contributes
-- to a lockout, so indexing it would be dead weight.
create index admin_login_attempts_email_idx
  on public.admin_login_attempts (email, created_at desc)
  where not succeeded;

create index admin_login_attempts_ip_idx
  on public.admin_login_attempts (ip_hash, created_at desc)
  where not succeeded and ip_hash is not null;

create index admin_login_attempts_created_idx
  on public.admin_login_attempts (created_at desc);


-- ======================================================================
-- Recording an attempt
-- ======================================================================
--
-- SECURITY DEFINER because the caller is `anon` and `anon` holds no INSERT
-- grant. The function is the only door, so it decides what may be written: the
-- reason is constrained by the table's CHECK, and there is no parameter that
-- could carry a password even by mistake.
--
-- `search_path` is pinned. The email is lowercased here rather than trusted from
-- the caller, so throttling cannot be evaded by changing capitalisation.

create or replace function public.record_login_attempt(
  p_email text,
  p_ip_hash text,
  p_succeeded boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- An empty submission is not an attempt worth recording, and would otherwise
  -- let a caller pad the table under a blank identifier.
  if coalesce(pg_catalog.btrim(p_email), '') = '' then
    return;
  end if;

  insert into public.admin_login_attempts (email, ip_hash, succeeded, reason)
  values (
    pg_catalog.lower(pg_catalog.btrim(p_email)),
    nullif(pg_catalog.btrim(coalesce(p_ip_hash, '')), ''),
    p_succeeded,
    p_reason
  );
end;
$$;

comment on function public.record_login_attempt(text, text, boolean, text) is
  'Records one login attempt. The only write path into admin_login_attempts. Callable by anon because a failed login is unauthenticated by definition.';

revoke all on function public.record_login_attempt(text, text, boolean, text) from public;
grant execute on function public.record_login_attempt(text, text, boolean, text) to anon, authenticated;


-- ======================================================================
-- Deciding whether to allow an attempt
-- ======================================================================
--
-- Returns a decision rather than a count, so the thresholds live in one place
-- and the application cannot drift from them.
--
-- Two independent identifiers, and the stricter answer wins:
--
-- - **By email.** Stops a run against one known administrator address.
-- - **By address hash.** Stops a run across many addresses from one client.
--
-- Either alone is evadable. Counting both means an attacker has to distribute
-- across addresses *and* spread across accounts, at which point they are no
-- longer brute-forcing anybody in particular.
--
-- ## The thresholds, and why these numbers
--
--   3 failures  -> demand a challenge
--   10 failures -> refuse until the window passes
--
-- Three is above the rate an administrator mistypes a password they know, and
-- far below the rate that makes guessing viable. Ten is a hard stop for the
-- fifteen-minute window; a legitimate administrator who has genuinely forgotten
-- their password needs a reset, not more guesses.
--
-- Successful attempts are excluded from the count, so signing in correctly after
-- two typos does not leave the next session pre-throttled. They are not *reset*
-- by success either: a successful guess in the middle of a run must not clear
-- the evidence of the run.

create or replace function public.check_login_throttle(
  p_email text,
  p_ip_hash text
)
returns table (
  allowed boolean,
  requires_captcha boolean,
  retry_after_seconds integer,
  recent_failures integer
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_window interval := interval '15 minutes';
  v_captcha_threshold integer := 3;
  v_block_threshold integer := 10;
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_ip text := nullif(pg_catalog.btrim(coalesce(p_ip_hash, '')), '');
  v_failures integer;
  v_oldest timestamptz;
begin
  -- The greater of the two counts. `greatest` ignores nulls, so a request with
  -- no resolvable address still gets the email count.
  select
    -- GREATEST and EXTRACT below are SQL constructs rather than functions, so
    -- they cannot be schema-qualified. They are also unaffected by search_path,
    -- which is why the bare forms are safe here.
    greatest(
      count(*) filter (where email = v_email),
      count(*) filter (where v_ip is not null and ip_hash = v_ip)
    ),
    min(created_at) filter (
      where email = v_email or (v_ip is not null and ip_hash = v_ip)
    )
  into v_failures, v_oldest
  from public.admin_login_attempts
  where not succeeded
    and created_at > now() - v_window
    and (email = v_email or (v_ip is not null and ip_hash = v_ip));

  v_failures := coalesce(v_failures, 0);

  return query select
    v_failures < v_block_threshold,
    v_failures >= v_captcha_threshold,
    -- How long until the oldest failure ages out of the window, which is when
    -- the count next drops. Told to the caller so it can say something specific
    -- instead of "try later".
    case
      when v_failures < v_block_threshold then 0
      else greatest(
        1,
        pg_catalog.ceil(
          extract(epoch from (v_oldest + v_window - now()))
        )::integer
      )
    end,
    v_failures;
end;
$$;

comment on function public.check_login_throttle(text, text) is
  'Whether a login attempt may proceed, whether it must pass a challenge first, and how long until the block lifts. Counts recent failures by email and by address hash; the stricter answer wins.';

revoke all on function public.check_login_throttle(text, text) from public;
grant execute on function public.check_login_throttle(text, text) to anon, authenticated;


-- ======================================================================
-- Retention
-- ======================================================================
--
-- The table holds email addresses, so it does not grow forever. This is the
-- documented purge, callable by an administrator or a scheduled job.
--
-- Not automatic: deleting security evidence on a timer that nobody chose is its
-- own kind of mistake, and 90 days is a default rather than a policy. See
-- `docs/operations.md`.

create or replace function public.purge_login_attempts(p_older_than_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.'
      using errcode = 'insufficient_privilege';
  end if;

  -- A floor, so a mistaken call cannot erase the window the throttle depends on.
  if p_older_than_days < 1 then
    raise exception 'Retention must be at least one day.'
      using errcode = 'PT422';
  end if;

  delete from public.admin_login_attempts
  where created_at < now() - (p_older_than_days || ' days')::interval;

  get diagnostics v_deleted = row_count;

  return v_deleted;
end;
$$;

comment on function public.purge_login_attempts(integer) is
  'Deletes login attempts older than the given number of days. Administrator-only, with a one-day floor so the throttle window cannot be erased.';

revoke all on function public.purge_login_attempts(integer) from public;
grant execute on function public.purge_login_attempts(integer) to authenticated;
