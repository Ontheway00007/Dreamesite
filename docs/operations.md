# Operations

Running this site in production: configuration, provisioning, deployment,
retention, and what to do when something is wrong.

`README.md` explains how the system works and why. This file is the runbook —
it assumes you need to *do* something, possibly at speed.

- [Environment variables](#environment-variables)
- [Supabase project setup](#supabase-project-setup)
- [Storage](#storage)
- [Administrator provisioning](#administrator-provisioning)
- [Multi-factor authentication](#multi-factor-authentication)
- [Turnstile](#turnstile)
- [Content-Security-Policy rollout](#content-security-policy-rollout)
- [Deploying migrations](#deploying-migrations)
- [Rolling back](#rolling-back)
- [Backup and restore](#backup-and-restore)
- [Data retention](#data-retention)
- [Monitoring](#monitoring)
- [Incident response](#incident-response)
- [Verification commands](#verification-commands)

---

## Environment variables

Set these in Vercel under Project Settings → Environment Variables, or in
`.env.local` for local development. `.env.example` is the canonical list.

### Required

| Variable | Purpose | Failure mode if missing |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL, `https://<ref>.supabase.co`. Supabase → Project Settings → Data API. | The site falls back to local demonstration fixtures, and the admin reports that Supabase is not configured. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key. Project Settings → API Keys. | As above. |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin, e.g. `https://dreame.com.au`. Drives canonical URLs, `sitemap.xml`, Open Graph. | Falls back to the Vercel deployment domain, then `http://localhost:3000`. Canonical URLs and social previews point at the wrong host. |

The anon key is safe in the browser **only** because row level security is
enabled on every table it can reach. That is verified by the SQL suites; see
[Verification commands](#verification-commands).

### Recommended for production

| Variable | Purpose | Consequence of leaving it unset |
| --- | --- | --- |
| `LOGIN_HASH_SALT` | Salt for hashing client addresses in the login throttle. Any long random string; treat it as a secret. | Per-address throttling is **silently skipped**. Per-email throttling still applies. A distributed password-guessing attack spread across many accounts is no longer slowed. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key. | See [Turnstile](#turnstile). In a production deployment, unset keys mean the login **refuses** attempts that require a challenge. |
| `TURNSTILE_SECRET_KEY` | Turnstile secret key. Server-only. | As above. Both keys or neither — a site key with no secret renders a widget nothing verifies, which is worse than no widget. |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Public Mapbox token (`pk.*`). Restrict it to your domains before launch. | `/properties` shows the full list plus a "map unavailable" panel. Nothing crashes; this is a deliberate degradation. |

Generate a salt with:

```bash
openssl rand -hex 32
```

### Optional

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_MAPBOX_STYLE` | Mapbox style URL. Defaults to `mapbox://styles/mapbox/dark-v11`. |
| `CSP_REPORT_ONLY` | `true` sends `Content-Security-Policy-Report-Only` instead of enforcing. See [Content-Security-Policy rollout](#content-security-policy-rollout). |
| `DEPLOYMENT_ENV` | Set to `production` on non-Vercel hosts only. Vercel sets `VERCEL_ENV` itself. **Never set this during a build or in CI** — it would block static generation from the fixture data. |

### Deliberately not used

`SUPABASE_SERVICE_ROLE_KEY` is **not read by any module**. It was once needed by
the location projection generator; that now runs as the signed-in administrator
through an admin-checked, version-checked function, so row level security applies
to everything it does.

Leave it unset. Setting it grants the application nothing and creates a secret
that can leak. If you find it set in a deployment, remove it.

---

## Supabase project setup

1. Create a project. Note the region — put it near your users, not near you.
2. Copy the URL and anon key into the environment.
3. Apply migrations: see [Deploying migrations](#deploying-migrations).
4. Confirm RLS is enabled on every table. The SQL suites assert this; run them
   against a throwaway cluster before trusting a new project.
5. Authentication → Providers: leave email/password enabled, disable anything you
   are not using. There is no public sign-up in this application — accounts are
   created by an operator.
6. Authentication → URL Configuration: set the Site URL to your production origin
   so password-reset links do not point at localhost.

### Verify the grants after creating a project

A hosted Supabase project grants `anon` and `authenticated` **ALL** privileges on
every new table and function in `public`, via default privileges. Migration `0014`
revokes what has accumulated and turns that default off, but it is worth
confirming on any project you did not watch being built:

```sql
-- Expect: NONE, NONE, and exactly the two pre-authentication functions.
select
  (select coalesce(string_agg(table_name||':'||privilege_type, ', '), 'NONE')
     from information_schema.role_table_grants
     where table_schema='public' and grantee='anon'
       and table_name in ('admin_users','audit_log','site_settings',
                          'property_private_locations','property_location_settings',
                          'admin_login_attempts')) as anon_on_private_tables,
  (select coalesce(string_agg(distinct grantee||':'||table_name, ', '), 'NONE')
     from information_schema.role_table_grants
     where table_schema='public' and grantee in ('anon','authenticated')
       and privilege_type='TRUNCATE') as truncate_grants,
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), 'NONE')
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and not exists (select 1 from pg_depend d
                       where d.objid=p.oid and d.deptype='e')
       and has_function_privilege('anon', p.oid, 'EXECUTE'))
     as anon_executable_functions;
```

TRUNCATE is the one that matters most: it is a table-level privilege that row
level security does not filter, so a policy cannot save you from it.

`supabase/verify/00_supabase_stubs.sql` now reproduces this default, so the local
suites and CI fail if a future migration adds a table without revoking.

### Turn off public sign-ups

Authentication → Sign In / Providers → disable "Allow new users to sign up".

Being in `auth.users` does not grant admin access on its own — authorization is a
row in `admin_users`, checked by `requireAdmin()` — but an open sign-up endpoint
is an unnecessary surface.

---

## Storage

One bucket, `property-media`, created by migration `0004_storage.sql`.

- **Public read** — the site serves images directly from it.
- **Writes are administrator-only**, enforced by storage RLS policies in `0007`
  and `0009`.
- **Path layout is enforced in the database** by
  `is_valid_property_media_path()`. An upload to a path outside the expected
  `properties/<property-id>/<category>/<uuid>.<ext>` shape is rejected by the
  policy, not merely discouraged by the client.

`next.config.ts` automatically allows `next/image` to load from the bucket once
`NEXT_PUBLIC_SUPABASE_URL` is set. No `remotePatterns` edit is needed.

See README → *Media and storage* for the path layout, accepted formats and the
upload flow.

---

## Administrator provisioning

Authentication (who you are) is Supabase Auth. Authorization (whether you may use
the admin) is a row in `public.admin_users`. Both are required.

### First administrator

1. Supabase → Authentication → Users → **Add user**. Set a strong password and
   confirm the email.
2. Insert the authorization row:

   ```sql
   insert into public.admin_users (user_id, email, role)
   values ('<auth-user-uuid>', 'admin@example.com', 'super_admin');
   ```

3. Sign in at `/admin/login`.

### Subsequent administrators

Do it from `/admin/settings` — the application writes the audit entry and
enforces the role rules. Only a `super_admin` may manage administrators.

Falling back to SQL bypasses the audit trail. If you must, insert the row as
above and record why somewhere a human will find it.

### Removing an administrator

Prefer deactivating (`is_active = false`) over deleting: the audit log references
the user, and deactivation is reversible while a delete is not.

The database refuses to leave the roster with **no active super administrator**,
and refuses to let you demote or deactivate *yourself* out of that role. Both are
enforced under an advisory lock, so two concurrent removals cannot both succeed.
This is verified by `supabase/verify/04_concurrency.sh`.

To remove someone's access immediately, see
[Incident response](#incident-response).

---

## Multi-factor authentication

**Not currently enforced by this application.** Stating that plainly because a
runbook that implies otherwise is worse than one that admits the gap.

Supabase Auth supports TOTP enrolment, and the pieces this application would need
are not built: no enrolment screen, no verification step in the login flow, and no
`admin_users` column recording whether a factor is required.

Until that exists, compensate with:

- Long, unique passwords from a manager, for every administrator.
- The login throttle and Turnstile, which are enforced (see below).
- A short list of administrators, reviewed when anybody leaves.
- Supabase dashboard access itself protected by MFA — that account can bypass
  every control in this application, so it matters more than the app logins.

To close the gap properly: enable TOTP in Supabase Auth, add an enrolment step
after first sign-in, call `supabase.auth.mfa.challenge()` in the login action
before establishing the session, and add a `requires_mfa` column to
`admin_users` so it can be mandatory per account rather than optional.

---

## Turnstile

Cloudflare Turnstile guards the login form once the throttle asks for it — not on
every attempt, so a normal sign-in is unchallenged.

### Setup

1. Cloudflare dashboard → Turnstile → **Add site**.
2. Add your production hostname. Add `localhost` too if you want the challenge
   locally.
3. Widget mode **Managed**.
4. Copy the site key to `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the secret key to
   `TURNSTILE_SECRET_KEY`.

### How enforcement is decided

By the *deployment*, not the configuration:

| Keys configured | Environment | Behaviour |
| --- | --- | --- |
| Yes | any | Challenge required once the throttle asks for it. |
| No | production | Attempts needing a challenge are **refused**. Fails closed. |
| No | local / preview | Challenge skipped, so the form works out of the box. |

That table is the reason a forgotten variable cannot silently disable the
challenge in production. If administrators report being unable to sign in after a
run of failures, check these two variables first.

Verification failures fail closed as well: if Cloudflare is unreachable, the
attempt is refused rather than let through, because an unreachable verifier
during a burst of failed logins is exactly when it matters.

### Throttle thresholds

From `check_login_throttle()` in migration `0013`:

| | Value |
| --- | --- |
| Window | 15 minutes |
| Failures before a challenge | 3 |
| Failures before refusal | 10 |

Counted **per email and per hashed address independently — the stricter wins**. A
successful sign-in does *not* reset the count; the window ages out on its own, so
one success cannot be used to clear the record of an attack in progress.

State lives in the `admin_login_attempts` table rather than in memory, because
serverless instances do not share memory and an in-process counter is bypassed by
whatever hits a cold start.

A locked-out administrator either waits out the window or you clear their recent
failures:

```sql
delete from public.admin_login_attempts
where email = lower('admin@example.com')
  and not succeeded
  and created_at > now() - interval '15 minutes';
```

Do that only when you know who is asking and why.

---

## Content-Security-Policy rollout

The policy is **enforced by default**. `CSP_REPORT_ONLY=true` switches the header
to `Content-Security-Policy-Report-Only` for a staged rollout.

Two policies, by rendering mode:

- **`/admin`** — dynamic, so it gets a fresh per-request nonce and inline script
  is otherwise forbidden.
- **Public pages** — statically generated, so there is no request in which to
  stamp a nonce. Those get a policy with `'unsafe-inline'` for scripts and
  deliberately *without* `'strict-dynamic'`, because `'strict-dynamic'` makes
  browsers ignore `'unsafe-inline'` and would break every static page.

The parts most likely to break — the Mapbox map, video embeds, uploads — need a
real browser to exercise. For a first production deploy:

1. Deploy with `CSP_REPORT_ONLY=true`.
2. Exercise the map, an upload, an embed, and a login.
3. Watch the browser console for CSP violations.
4. Remove the variable and redeploy to enforce.

`sh scripts/verify-public-pages.sh` asserts the headers against served HTML —
including that every inline script on a nonce route actually carries the nonce —
so most breakage is caught before deploy.

---

## Deploying migrations

Migrations are forward-only. **Never edit an applied migration**; add a new one.

```bash
supabase login
supabase link --project-ref <your-project-ref>

# review first — this prints what would change
supabase db diff --linked

supabase db push
```

Then regenerate types and commit the result:

```bash
npm run db:types      # supabase gen types typescript --linked > src/types/database.ts
```

CI fails the build when `src/types/database.ts` disagrees with the schema the
migrations produce, in either direction, so a forgotten type update is caught
rather than discovered at runtime.

Without the CLI: run the files in `supabase/migrations/` in order in the SQL
editor. Order matters — they are numbered for that reason.

### Before pushing to production

Run the full verification suite against a throwaway cluster
([Verification commands](#verification-commands)). It applies every migration to
an empty database, so it catches a migration that only works against *your*
database.

---

## Rolling back

### Application

Vercel → Deployments → the previous good deployment → **Promote to Production**.
Instant, and it does not touch the database.

### Database

There are no down-migrations, on purpose: a generated rollback that has never been
tested is a rollback that does not work. Recovery is one of:

1. **A new forward migration** that reverses the change. Preferred, and the only
   option once real data depends on the schema.
2. **Point-in-time recovery** to just before the migration. Loses everything
   written since. See [Backup and restore](#backup-and-restore).

Because the application deploy and the migration are separate steps, order them
so that neither half breaks alone:

- **Additive change** (new nullable column, new table, new function): push the
  migration first, then deploy the application. The old code ignores what it does
  not know about.
- **Destructive change** (dropping or renaming a column): deploy application code
  that no longer references it first, then the migration. Otherwise the running
  deployment queries a column that has gone.

---

## Backup and restore

### What Supabase does for you

| Plan | Backups |
| --- | --- |
| Free | Nothing automatic. **Take your own.** |
| Pro | Daily, 7-day retention. Point-in-time recovery is a paid add-on. |

On the free plan, an accidental `delete` is unrecoverable unless you have a dump.
This is the single largest operational risk in a free-tier deployment.

### Manual dump

```bash
supabase db dump --linked -f backup-$(date +%F).sql            # schema + data
supabase db dump --linked --data-only -f data-$(date +%F).sql  # data only
```

Store dumps somewhere that is not the same account as the database. A dump
contains every enquiry and every private location — treat it as the most
sensitive file the project has, and encrypt it at rest.

### Restore

```bash
psql "$DATABASE_URL" -f backup-2026-01-01.sql
```

Restore into a **new** project first and check it, rather than over the top of a
damaged production database. You get one attempt at that and no second dump.

### Storage

Database dumps do **not** include the `property-media` bucket. Back it up
separately or accept that images are recoverable only from the originals.

---

## Data retention

### Login attempts

`admin_login_attempts` stores an email, a salted address hash, a success flag and
a reason code. Never a password, never a token, never a raw IP address.

`public.purge_login_attempts(p_older_than_days integer default 90)` deletes older
rows, returns the number removed, and refuses a retention of less than one day so
a mistaken call cannot erase the window the throttle depends on.

**It requires an administrator session, which a scheduled job and the SQL editor
do not have.** `is_admin()` resolves `auth.uid()`, and `auth.uid()` reads a JWT
claim — in the Supabase SQL editor you are the privileged `postgres` role with no
JWT, and `pg_cron` has none either. Calling it from either raises
`Administrator access is required.` (verified, not assumed).

So for scheduled and manual purges, delete as the table owner. There is no
delete-blocking trigger on this table, unlike `audit_log`:

```sql
-- one-off, in the SQL editor
delete from public.admin_login_attempts
where created_at < now() - interval '90 days';
```

```sql
-- nightly at 03:00, if pg_cron is enabled
select cron.schedule(
  'purge-login-attempts',
  '0 3 * * *',
  $$delete from public.admin_login_attempts
    where created_at < now() - interval '90 days'$$
);
```

The function is the path for an authenticated administrator — application code, or
a future admin-facing control. To exercise it manually you have to supply the
claim it checks, in one transaction so the setting is still in scope:

```sql
begin;
select set_config('request.jwt.claim.sub', '<admin-auth-user-uuid>', true);
select public.purge_login_attempts(90);
commit;
```

### Audit log

`audit_log` is **append-only**. `update`, `delete` and `truncate` are revoked
from `authenticated` and `anon`, *and* refused by triggers. An admin session
cannot rewrite history even by accident.

That means purging it is a deliberate operational act requiring the table owner
in the SQL editor, not something the application can do:

```sql
alter table public.audit_log disable trigger user;

delete from public.audit_log
where created_at < now() - interval '2 years';

alter table public.audit_log enable trigger user;
```

Re-enabling the triggers is not optional. Run all three statements together, and
verify afterwards that a `delete` is refused again:

```sql
-- expect: ERROR
delete from public.audit_log where id = (select id from public.audit_log limit 1);
```

Consider exporting before deleting — the audit log is the only record of who
changed what.

### Enquiries

Enquiries contain personal information supplied by members of the public. There is
no automatic purge; decide a retention period, write it in your privacy policy,
and honour it. See `docs/privacy-data-flow.md` for what is stored and where it
goes.

---

## Monitoring

There is no APM integration. What to watch, in the order it will bite you:

### Failed logins

```sql
select email, count(*) as failures, max(created_at) as latest
from public.admin_login_attempts
where not succeeded
  and created_at > now() - interval '24 hours'
group by email
order by failures desc;
```

A single address accumulating failures against several emails is credential
stuffing. Many addresses against one email is a targeted attack. Either warrants
attention beyond the automatic throttle.

### Reasons, grouped

```sql
select reason, count(*)
from public.admin_login_attempts
where not succeeded and created_at > now() - interval '7 days'
group by reason order by 2 desc;
```

`service_error` appearing at all means the login path is failing for reasons
unrelated to credentials — investigate before administrators report it.

### Recent administrative activity

```sql
select created_at, user_id, action, entity_type, entity_id
from public.audit_log
order by created_at desc
limit 50;
```

### Stale location projections

A published location whose projection was generated from since-changed inputs
flags itself. The admin dashboard surfaces these; they should be zero.

### Platform

- **Vercel** → Logs for server errors; Analytics for traffic.
- **Supabase** → Reports for database size, connection count and slow queries.
  On the free plan, watch database size — hitting the ceiling makes the project
  read-only.
- **CSP violations** appear in the browser console. If you want them collected,
  add a `report-uri` and an endpoint; there is none by default.

---

## Incident response

### Suspected compromise of an administrator account

In order, fastest first.

1. **Revoke access.** In the Supabase SQL editor:

   ```sql
   update public.admin_users set is_active = false
   where email = 'compromised@example.com';
   ```

   `is_active = false` fails every authorization check immediately — the next
   request from that session is refused. This is the fastest lever available.

   If that account is the last active `super_admin`, the database will refuse.
   Promote someone else first.

2. **Kill the session.** Deactivation stops authorization, but revoke the tokens
   too — Supabase → Authentication → Users → the user → **Sign out** (all
   sessions). The application signs out with `scope: "global"` for the same
   reason: a refresh token that still works is still a way in.

3. **Reset the password.** Same screen.

4. **Read the audit log** for what they did:

   ```sql
   select created_at, action, entity_type, entity_id, metadata
   from public.audit_log
   where user_id = '<auth-user-uuid>'
   order by created_at desc;
   ```

   It cannot have been edited from an admin session, so it is trustworthy.

5. **Check for administrators you did not create:**

   ```sql
   select user_id, email, role, is_active, created_at
   from public.admin_users
   order by created_at desc;
   ```

### Disabling all admin access immediately

```sql
update public.admin_users set is_active = false;
```

The public site is unaffected — it reads published data through the anon key and
does not depend on any admin session. Re-enable individually afterwards.

If you need the admin routes gone entirely, remove
`NEXT_PUBLIC_SUPABASE_URL` from the deployment and redeploy: the admin cannot
authenticate without it. This also drops the public site to fixture data, so it is
a bigger hammer than usually needed.

### Rotating the anon key

Supabase → Project Settings → API Keys → roll the anon key, then update
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and redeploy.

The anon key is public by design and is only as safe as your RLS policies. A
leaked anon key is not by itself an incident — but if you are rotating it because
you doubt the policies, re-run the SQL verification suites, which assert them.

### Rotating `LOGIN_HASH_SALT`

Changing it invalidates every stored address hash, so existing rows stop matching
new requests and per-address throttling restarts from zero. Harmless, but clear
the now-meaningless hashes:

```sql
update public.admin_login_attempts set ip_hash = null where ip_hash is not null;
```

### Suspected location data leak

`docs/privacy-data-flow.md` is the reference for what is published and what is
not. In short: private coordinates live in `property_private_locations`, which the
anon key cannot read; the public site only ever sees the derived projection.

To confirm nothing private is being served:

```bash
sh scripts/verify-public-pages.sh
```

It asserts that no private coordinate field names and no service-role or
JWT-shaped strings appear in public HTML.

---

## Verification commands

Everything below runs without a Supabase project or any credential.

```bash
# Application
npm ci
npm run lint
npm run typecheck
npm test
npm run build

# Security headers and structured data, asserted against served HTML.
# Needs a completed `npm run build` first.
sh scripts/verify-public-pages.sh

# Schema, RLS, privacy and integrity: applies every migration to a throwaway
# PostgreSQL cluster and runs all assertion suites.
sudo sh supabase/verify/run-local.sh

# Concurrency: two interleaved sessions, proving write-skew guards actually block.
sudo sh supabase/verify/04_concurrency.sh
```

The local suites need a PostgreSQL 15 server binary:

```bash
# Amazon Linux 2023
dnf install -y postgresql15-server postgresql15 postgresql15-contrib

# Debian/Ubuntu
apt-get install -y postgresql-15
```

### Type drift, locally

CI does this automatically. To reproduce it:

```bash
sudo sh supabase/verify/gen-types.sh /tmp/generated.ts
node scripts/compare-database-types.mjs /tmp/generated.ts src/types/database.ts
```

It compares every table's column names and nullability and every declared
function name. It deliberately ignores column *types* — the hand-written file
narrows `Json` to real shapes on purpose — and function arguments, which the
generator alphabetises and reports as non-null regardless of the SQL default.

### What CI runs

`.github/workflows/ci.yml`, on every push and pull request:

- **`verify`** — install, lint, typecheck, test, build, then the served-HTML
  header and structured-data checks.
- **`database`** — a `postgres:15-alpine` service container. Applies the stubs and
  every migration to an empty database, runs all five SQL assertion suites, runs
  the concurrency suite over TCP, then regenerates types and fails on drift.

CI holds **no production credentials**. The database job deliberately uses a
throwaway container rather than a Supabase project, and the build needs no
secrets — a missing Mapbox token degrades to the list-only fallback instead of
failing.
