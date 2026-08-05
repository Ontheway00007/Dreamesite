# Dreame..

Premium animated property showcase for a residential building company operating
across northern Melbourne. The site reads property data from Supabase when it is
configured, and falls back to committed demonstration fixtures when it is not.

## Stack

| Concern          | Choice                                              |
| ---------------- | --------------------------------------------------- |
| Framework        | Next.js 16 (App Router, Turbopack, Server Components) |
| Language         | TypeScript (strict)                                 |
| Styling          | Tailwind CSS v4 with a CSS-variable design system    |
| Data             | Supabase (`@supabase/ssr` browser + server clients)  |
| Maps             | Mapbox GL JS                                        |
| Animation        | Framer Motion, GSAP + ScrollTrigger                 |
| Smooth scrolling | Lenis, driven by the GSAP ticker                    |
| Icons            | Lucide                                              |
| Hosting          | Vercel (free tier compatible end to end)            |

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

The homepage renders without any environment variables. Supabase and Mapbox
values are only read when a feature that needs them is used, and a missing
variable throws a named error rather than failing silently.

## Environment variables

Set these in `.env.local` for development and in Vercel project settings for
deployments.

| Variable                          | Required     | Where to find it                                        |
| --------------------------------- | ------------ | ------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | for data     | Supabase → Project Settings → Data API → Project URL     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | for data     | Supabase → Project Settings → API Keys → anon / public   |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | for the map  | account.mapbox.com → Tokens → public token (`pk.…`)      |
| `NEXT_PUBLIC_MAPBOX_STYLE`        | optional     | A Mapbox Studio style URL. Defaults to `mapbox://styles/mapbox/dark-v11` |
| `NEXT_PUBLIC_SITE_URL`            | recommended  | Your canonical origin, e.g. `https://dreame.com.au`      |
| `LOGIN_HASH_SALT`                 | production   | Any long random string — `openssl rand -hex 32`           |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`  | production   | Cloudflare → Turnstile → your site → site key            |
| `TURNSTILE_SECRET_KEY`            | production   | Cloudflare → Turnstile → your site → secret key          |
| `CSP_REPORT_ONLY`                 | optional     | `true` to stage the CSP before enforcing it              |
| `DEPLOYMENT_ENV`                  | non-Vercel   | Set to `production` on non-Vercel hosts                   |

The anon key is designed to be public — RLS is what limits what it can see.
Restrict the Mapbox token to your domains before launch.

The three "production" rows above are not required to run the site, and the
consequence of omitting each is specific rather than general:

- Without `LOGIN_HASH_SALT`, per-address login throttling is **skipped**.
  Per-email throttling still applies. The code returns null rather than storing an
  unsalted hash, because an unsalted hash of an IPv4 address is reversible in
  seconds.
- Without the two Turnstile keys, a production deployment **refuses** the attempts
  that would need a challenge rather than skipping it. Locally it skips, so the
  form works with no Cloudflare account.

`docs/operations.md` covers all of this, plus rotation, retention and incident
response.

**`SUPABASE_SERVICE_ROLE_KEY` is deliberately not in that table.** No module in
this application reads it. The one module that used to — the projection
generator — now runs as the signed-in administrator and writes through an
admin-checked function. Leave the key unset: a key that bypasses RLS cannot leak
from an application that never loads it.

## Data sources

The property repository is a dispatcher over two sources implementing the same
contract (`src/lib/properties/source.ts`):

- **Supabase** whenever both `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. Public catalogue reads go through
  the anon key plus row-level security; server-only flows never use the
  service key for user-facing reads.
- **Local fixtures** (`src/content/properties.ts`) for development, tests and
  CI when Supabase is not configured.

Production with Supabase configured but unreachable degrades to the empty
catalogue rather than silently shipping demonstration data; detailed errors
stay in server logs. On non-Vercel hosts, set `DEPLOYMENT_ENV=production` in
the runtime environment to get the same safeguard (see `.env.example`).

## Database setup

The CLI is the supported path. On a machine with the Supabase CLI installed:

```bash
# authenticate and link
supabase login
supabase link --project-ref <your-project-ref>

# apply the schema, policies and storage setup in one go
supabase db push

# generated TypeScript row types, dropped into src/types/database.ts
supabase gen types typescript --linked > src/types/database.ts

# against a local stack instead:
supabase start
supabase db reset         # re-applies migrations and runs supabase/seed.sql

# no CLI and no containers? apply everything to a throwaway local cluster
# and run the assertion suites:
sudo sh supabase/verify/run-local.sh
```

When the CLI is unavailable, run the files in `supabase/migrations/` in order
against the SQL editor, then `supabase/seed.sql` to load the demonstration
records. Never edit an applied migration — add a new one.

### Verifying the database

Every command below needs a PostgreSQL 15 server binary and **no Supabase project
or credential**:

```bash
# Schema, RLS, privacy, integrity and login hardening.
# Applies every migration to an empty throwaway cluster, then runs five
# assertion suites against it.
sudo sh supabase/verify/run-local.sh

# Concurrency: two interleaved sessions proving the write-skew guards block.
sudo sh supabase/verify/04_concurrency.sh

# Generated-type drift, the same comparison CI makes.
sudo sh supabase/verify/gen-types.sh /tmp/generated.ts
node scripts/compare-database-types.mjs /tmp/generated.ts src/types/database.ts
```

On Amazon Linux 2023: `dnf install -y postgresql15-server postgresql15
postgresql15-contrib`. On Debian/Ubuntu: `apt-get install -y postgresql-15`.

CI runs all of it on every push against a `postgres:15-alpine` service container
— deliberately not a Supabase project, so CI never holds production credentials.
The concurrency suite shares its checks with the local script through
`supabase/verify/_concurrency_body.sh`; only the way each reaches a server
differs, so the two cannot drift apart.

`src/types/database.ts` is hand-maintained, which is only safe because CI checks
it: every table's column names and nullability, in both directions, plus every
declared function. A column added to a migration and not added there fails the
build.

## Media and storage

Property media lives in one public Supabase Storage bucket, `property-media`,
created by migration `0004`.

### Path layout

Every stored object follows exactly one shape:

```
properties/<property-uuid>/<category>/<object-uuid>.<ext>
```

with `<category>` one of `hero`, `gallery`, `facade`, `construction`,
`floor-plans`, `drone`, `documents`.

The object name is generated server-side from a fresh UUID and the extension
implied by the verified MIME type. **The uploaded filename never contributes to
it**, which removes collisions, double extensions such as `.php.jpg`, and
filenames that describe the property. The original name is kept as metadata
only.

Because every segment is a UUID or a fixed category word, traversal sequences
cannot match the pattern — `..` is not a UUID. Path escape is prevented by the
grammar rather than by stripping characters.

### Storage policies

Writes require **all three** of: the right bucket, an active administrator, and
a path matching the layout above. The path check is
`public.is_valid_property_media_path()` (migration `0009`), which also confirms
the named property exists.

Migration `0007` checked only the bucket and admin status, so any administrator
could write anywhere in the bucket under any name. `0009` replaces those three
policies.

`UPDATE` carries both `USING` and `WITH CHECK`, so an object cannot be moved
from a valid path to an invalid one.

**On reads:** `property-media` is a *public* bucket. Its objects are readable by
anyone with the URL, and the `SELECT` policies from `0004` do not change that —
they are defence in depth for a future switch to a private bucket. Draft media
is protected by its URL not being published, and by the row policies on
`property_images` / `property_resources` which stop an anonymous reader
discovering it. Nothing in this system should be described as though read
policies restrict access to a known public URL.

### Upload flow

Files go from the browser straight to Storage. Next.js never handles the bytes,
which keeps a 20 MB floor plan away from the Server Action body limit and out of
server memory.

1. **Ticket** — `requestImageUpload` / `requestDocumentUpload` verify the
   administrator, the property, the MIME type, the extension and the size, then
   return the object name to use.
2. **Upload** — the browser writes to that path under its own authenticated
   session. The Storage policy independently re-checks admin status and path
   layout, so a client that ignores the returned path gets nowhere useful.
3. **Finalise** — `finaliseImageUpload` / `finaliseDocumentUpload` confirm the
   object is actually present, then write the row.

Step 3 is what makes a database row evidence that a file exists. A row written
before the upload finished would be a broken image on a live page.

### Failure handling

Postgres and Storage are separate systems with no shared transaction, so this
is **not** transactional across both. The sequencing is chosen so any single
failure leaves a *safe* state:

| Failure | Result |
| --- | --- |
| Finalisation fails after upload | The object is deleted. If that also fails, an unreferenced object remains and is logged. |
| Delete: row removed, object delete fails | The file stops being served immediately. The administrator is told the file may remain — it is not reported as deleted. |
| Replace: upload or row update fails | The previous file is untouched and still working. The new object is cleaned up. |
| Replace succeeds, old object delete fails | New image live; the administrator is told the old file remains. |

Deletion is database-first deliberately. The reverse order would produce a
visibly broken image on a live page, which is worse than an invisible orphan.

**Known limitation:** there is no background sweeper for unreferenced objects.
They are logged when they occur and must be cleaned up manually.

### Accepted formats

| Purpose | Accepted | Limit |
| --- | --- | --- |
| Photography | JPEG, PNG, WebP | 15 MB |
| Floor plan images | JPEG, PNG, WebP | 20 MB |
| Documents | PDF | 25 MB |

Two deliberate exclusions:

- **SVG** — an SVG is a document that can carry script. Served from our own
  origin it would be a stored-XSS vector. Accepting it needs a reviewed
  sanitisation step, which does not exist, so it is refused rather than
  half-handled.
- **AVIF** — decoding depends on the `sharp` build behind `next/image`, and that
  has not been verified in this deployment. Accepting a format whose rendering
  is unconfirmed risks an upload the public site cannot display.

Limits live in `lib/media/config.ts` and nowhere else. The browser checks them
for immediate feedback; the server checks them again and is the authority.

### External media

Tours, video and drone footage are links. `validateExternalUrl` requires
`https:` and nothing else — `javascript:` in an `href` executes on click,
`data:` can carry an HTML document, `file:` points at the visitor's own disk,
and plain `http:` is blocked as mixed content. Rather than enumerating what to
block, only one scheme is allowed through. Credentials in the URL and links to
`localhost` are refused too.

A storage path and an external URL are different things and are modelled as a
discriminated union, `MediaSource`:

```ts
type MediaSource =
  | { kind: "storage"; path: string }
  | { kind: "external"; url: string }
```

`resolveMediaSource` in `lib/properties/media.ts` is the only function that
turns one into a URL. The earlier model used optional sibling fields, and one
reader got it wrong — external document URLs were routed through the storage URL
builder, producing dead links inside our own bucket and offering them to
visitors as downloads. The union makes that class of mistake unavailable.

### Hero images

The hero is the row whose `image_type` is `hero`. There is deliberately no
competing `is_hero` boolean: two mechanisms would eventually disagree.

- At most one per property, enforced by a partial unique index.
- `set_property_hero_image()` promotes and demotes in one transaction, so the
  property never has two heroes or none.
- A floor plan cannot be the hero — a card showing a line drawing where every
  other card shows a photograph reads as a fault.
- Either source kind is acceptable; an externally hosted hero is as valid as an
  uploaded one.
- Removing the hero leaves the card with no photograph. A floor plan is never
  substituted, for the same reason it cannot be promoted.

**Promotion requires a publishable image.** Migration `0010` replaced the
`0009` version of `set_property_hero_image()`, which would promote any image
belonging to the property. It now refuses one that is unpublished, has no alt
text, is a floor plan, belongs to another property, or has neither a storage
path nor an external URL.

Requiring *published* before promotion was chosen over publishing the image as
a side effect of promotion. "Set as hero" silently making a photograph public is
a bigger decision than choosing among images that are already public, and it is
not the decision the button appears to offer.

**Legacy heroes are not repaired.** The migration does not demote heroes that
predate these rules. They are already invisible publicly — `mapPropertyRow`
filters unpublished images — and demoting them would discard a deliberate
choice. Instead the admin surfaces the state: the media manager reports a
designated hero that is still a draft as *not visible yet*, and one that is live
without alt text as needing a description. The media overview page shows the
same three states across the whole catalogue.

Floor-plan rejection is checked at promotion only. Once an image is promoted its
`image_type` becomes `hero`, so what it was before is unrecoverable — there is
nothing a later repair pass could look at.

### Ordering

`reorder_property_images()` and `reorder_property_resources()` rewrite a whole
group's `sort_order` in one statement. Both refuse ids belonging to another
property, ids from another category, duplicates, and non-administrators — the
ownership check covers cross-property tampering and accidental category changes
at once.

The admin interface reorders with up and down buttons, not dragging. Drag is a
pleasant addition for a mouse and an impossibility without one, so the buttons
are the interface rather than a fallback behind it.

### Alt text

**Publishing an image requires alt text. Every category, no exceptions.**

The tempting exception is a "decorative" image needing no description. None of
these categories is decorative: each shows something about the home, which is
why it is published at all. A gallery photograph without a description is simply
missing from the page for someone using a screen reader.

The requirement applies at publication rather than upload, so a batch can be
uploaded and described afterwards without the form fighting the editor. A
caption does not satisfy it — a caption is written for everyone and usually adds
context rather than describing the picture.

A published image lacking alt text is flagged in the media manager, and the
publish action refuses it wherever it is triggered from.

### Publishing a property

Photography is **not** required to publish a property — the architectural
drawing is a valid presentation. What is required is that published media is
coherent: a published hero must resolve, published media must have a valid
source, and no draft media reaches a public read.

Draft exclusion is enforced twice: RLS stops the anon key reading a draft row,
and `mapPropertyRow` filters unpublished rows regardless of who queried. The
second exists so "draft media never becomes public media" is a property of the
mapping rather than only of the caller.

**Publishing is one call, not a check followed by a write.** `publishPropertyAction`
invokes `publish_property_if_ready(uuid)`, which takes the property advisory lock
*and* `FOR UPDATE` on the property row, evaluates `property_publish_blockers()`,
updates, and writes the audit entry — all inside one transaction.

The previous shape read the blockers, decided, and updated separately. Between
those two steps a location could be deleted or an image unpublished, and the
property would be published without qualifying. Two administrators working at
once is enough to hit it.

The function returns the blockers rather than raising, so "not ready yet" arrives
as data and is shown as a checklist. `getPublishBlockers()` still exists for the
editor's readiness panel, which is a display concern where a stale answer costs
nothing.

`is_published` is no longer part of the property update path at all. `toRow()`
does not carry it and `PropertyInput` does not accept it, so the only routes to
public visibility are the publish and unpublish actions. A form that could
publish would need its own readiness check, and that check would have the same
gap the RPC exists to close.

### Location writes are RPC-only

The three location tables — `property_private_locations`,
`property_location_settings`, `property_public_locations` — accept **no direct
writes**. Migration 0012 drops the admin INSERT/UPDATE/DELETE policies and
revokes the grants. SELECT stays, because the admin location tab reads all three.

Nothing in the application ever wrote them directly. But the reason nothing did
was convention, and a policy is not a convention: `supabase.from(
'property_location_settings').update(...)` was a legal way to change a
property's privacy, bypassing the property lock, the atomic three-table write,
the derived projection, the audit entry, and the unpublish that has to follow
removal.

Removing the grants means the writing functions can no longer be SECURITY
INVOKER — an invoker function has exactly the caller's privileges, and the caller
now has none. `save_property_location`, `clear_property_location` and
`save_regenerated_public_location` are SECURITY DEFINER, which is the point: the
function *is* the privilege. Each checks `is_admin()` before doing anything and
pins its `search_path`, and the harness asserts both.

### The projection cannot be regenerated from stale data

`generatePublicLocationForProperty` used to read the property, the private
location and the settings with the **service role**, compute the projection, and
upsert it unconditionally. Three problems, worst last:

1. Nothing called it — privileged code with no caller.
2. The service role bypasses RLS.
3. A location save committing between the read and the write was silently undone.
   The direction of that failure is the worst available: an administrator setting
   visibility to `hidden` could have the previous public coordinate *restored* by
   a background job, with no error anywhere.

It is now `regeneratePublicLocation`, and it runs as the signed-in administrator.
All three `updated_at` values are read and passed to
`save_regenerated_public_location`, which takes the property lock, confirms none
has moved, and refuses with `PT409` otherwise. Only the projection is written —
regeneration must never alter the stored position or the settings, which are input
rather than derived output.

**The service-role key is no longer used by any module.** `.env.example` says so
and asks for it to be left unset.

### A projection can go stale, and says so

The projection embeds the property's suburb and state, so changing either leaves
the stored marker describing the previous one. That is wrong public data — not a
privacy leak, since the coordinate is still the privacy-correct one, but a marker
in the wrong place.

Recomputing from a trigger is impossible: the privacy algorithm lives in
TypeScript and is deliberately not duplicated in SQL. So a trigger records
`stale_since` and the location tab says the published location is out of date.
Saving clears it.

It deliberately does **not** block publishing. Making an administrator unable to
publish because they renamed a property would be disproportionate to a stale
label.

### Property locking

The row lock alone was not enough. Readiness spans three tables, and you cannot
`SELECT ... FOR UPDATE` a row that does not exist — "there is no location
settings row" is one of the states being guarded. So publishing takes a
**property-scoped advisory lock** as well, and every write that can change
readiness takes the same one:

| Function | Takes the lock |
| --- | --- |
| `publish_property_if_ready` | yes, then the `properties` row lock |
| `save_property_location` | yes |
| `clear_property_location` | yes |

`clear_property_location` is new. Before it, the only *documented* writer of the
location tables took the lock, which made the lock only as good as everyone
remembering it. Giving removal a front door means "clear the location" and
"publish" contend properly — and because a property with no location cannot be
published, clearing one unpublishes the property in the same transaction rather
than leaving the two to disagree.

The key comes from `property_lock_key(uuid)`: `md5` of the UUID with a class
prefix, taken as the first 64 bits. The prefix is what keeps a property key from
colliding with the administrator roster key — they are different key spaces by
construction, not by luck. A collision between two properties would cost some
unnecessary waiting and never a wrong result.

**Ordering, and why there is no deadlock.** The rule: acquire the advisory lock
before any row lock, and never hold two advisory locks at once. No transaction
needs both a property lock and the roster lock, so those cannot form a cycle.
Within the property lock, publishing takes the advisory lock and then the row
lock; the only other writer of that row is an ordinary property update, which
takes the row lock and never asks for the advisory lock, so it cannot be the
other half of a cycle.

Verified with two live sessions in `supabase/verify/04_concurrency.sh`, including
that different properties do not block each other.

## Authentication & Admin

The admin system lives at `/admin` and uses Supabase Auth with email/password.

### Architecture

- **No public registration** — administrators are provisioned via the
  `admin_users` table in the Supabase dashboard.
- **Authorization is server-side only** — the `admin_users` table is queried on
  every request via `requireAdmin()`. JWT claims and `user_metadata` are never
  trusted for authorization.
- **Middleware** refreshes the auth session cookie on every `/admin/*` request.
- **RLS policies** use a `public.is_admin()` helper function (SECURITY DEFINER)
  to gate all write operations.
- **Audit logging** records admin actions (create, update, publish, delete) in
  an append-only `audit_log` table.

### Setting up the first administrator

1. Create a user in the Supabase Auth dashboard (Authentication → Users → Add user)
2. Insert a row into `admin_users`:
   ```sql
   INSERT INTO public.admin_users (user_id, email, role)
   VALUES ('<auth-user-uuid>', 'admin@example.com', 'super_admin');
   ```
3. Visit `/admin/login` and sign in with those credentials.

`docs/operations.md` covers provisioning subsequent administrators, removing
access in a hurry, and why deactivating beats deleting.

### Login hardening

Four things guard the login form. All are enforced server-side; none can be
skipped by a client.

**One message for every rejection.** Wrong password, no such account, correct
password for somebody who is not an administrator, correct password for a
deactivated administrator — all four get the same sentence. The previous
implementation answered "You do not have administrator access" for a valid
credential belonging to a non-administrator, which confirmed both that the
account existed and that the password was right. A genuine service failure gets a
*different* message, because telling somebody their password is wrong when the
database is unreachable sends them to reset a password that was fine.

**A throttle that lives in the database.** Fifteen-minute window; three failures
require a CAPTCHA, ten refuse the attempt. Counted per email and per hashed
address independently, and the stricter of the two wins. A success does *not*
reset the count — one correct password cannot clear the record of an attack in
progress. State is in `admin_login_attempts` rather than in memory because
serverless instances share no memory, and an in-process counter is bypassed by
whatever hits a cold start.

**Addresses are stored as salted SHA-256, never raw.** Throttling needs to
recognise a repeat client, not to know where it is. Without `LOGIN_HASH_SALT` the
hash function returns null and per-address throttling is skipped, rather than
storing an unsalted hash that is trivially reversible.

**Turnstile, enforced by the deployment rather than the configuration.** In
production, unset keys mean the attempts that need a challenge are refused;
locally they are skipped. Verification failures fail closed too — an unreachable
verifier during a burst of failed logins is exactly when it matters.

Also: `signOut({ scope: "global" })` revokes every refresh token rather than only
this browser's, and the post-login `next` parameter goes through an allow-list of
shape — it must be a single-slash relative path under `/admin` that is not the
login page — so it cannot become an open redirect.

**Multi-factor authentication is not enforced.** Supabase Auth supports TOTP, but
the enrolment screen, the challenge step and the per-account requirement are not
built. `docs/operations.md` states the gap plainly and describes what closing it
requires.

### Admin routes

| Route                     | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `/admin/login`            | Email/password login                    |
| `/admin/unauthorized`     | Shown when user is not an admin         |
| `/admin`                  | Counts, and a worklist of what needs attention |
| `/admin/properties`       | Property listing with sort/filter/search |
| `/admin/properties/new`   | Create a new property                   |
| `/admin/properties/[id]`  | Edit a property: details, location, media, build timeline, features, search |
| `/admin/enquiries`        | Enquiry queue: search, status filter, notes |
| `/admin/media`            | Cross-catalogue media worklist          |
| `/admin/settings`         | Business details, search defaults, site notice |

### Roles

| Role          | Permissions                                      |
| ------------- | ------------------------------------------------ |
| `admin`       | Full CRUD on properties, media, enquiries        |
| `super_admin` | Above + manage the administrator roster          |

An administrator cannot demote or delete themselves — a trigger on
`admin_users` refuses it, so the installation cannot be locked out.

**And the installation can never reach zero active super administrators.** A
second trigger counts what would remain and refuses deletion, deactivation and
demotion when the answer is none.

That guard counted correctly and still permitted the state it forbade. Two super
administrators, A and B: transaction 1 demotes A and finds B still active, so
allows it; transaction 2 demotes B and finds A still active, because transaction 1
has not committed. Both commit. Nobody is left. Neither transaction is wrong on
its own — only the pair is, which is write skew, and row locking cannot see it
because the two touch *different rows*.

The fix serialises on the invariant rather than on any row: `lock_admin_roster()`
before counting. This is the one intentionally global lock in the schema, because
"at least one active super administrator exists" is a property of the whole table.
It is taken only on the path that can actually decrement the count, so ordinary
administrator edits never contend.

The load-bearing detail is that the count taken after the lock is granted sees the
other transaction's committed change — a volatile function takes a fresh snapshot
per statement in `READ COMMITTED`. That is too subtle to accept on reasoning, so
`04_concurrency.sh` proves it with two live sessions, and asserts the second one
genuinely blocked rather than merely failing.

### Authorization helpers, and why they are SECURITY DEFINER

Two functions decide everything:

| Function                 | Answers                                    |
| ------------------------ | ------------------------------------------ |
| `public.is_admin()`      | Is the caller an active administrator?     |
| `public.is_super_admin()`| May the caller change the admin roster?    |

Both are `SECURITY DEFINER`, `STABLE`, and pinned with `SET search_path = ''`.
Each property matters:

- **SECURITY DEFINER** lets them read `admin_users` with the owner's
  privileges, bypassing RLS on that table. Without it, a policy *on*
  `admin_users` that checks `admin_users` recurses — PostgreSQL aborts the
  statement with `42P17`, and every admin read fails. Phase 6 shipped exactly
  that bug; migration `0008` fixes it.
- **`search_path = ''`** stops a caller putting their own schema ahead of
  `public` and having the function resolve `admin_users` to a table they
  control. Every reference inside is fully schema-qualified.
- **STABLE** means one evaluation per statement rather than per row — these
  run inside row-level policies.

`EXECUTE` is revoked from `PUBLIC` and granted only to `authenticated`.
`CREATE FUNCTION` grants `EXECUTE` to `PUBLIC` by default, and `PUBLIC` is
inherited by every role, so revoking from `anon` alone — as Phase 6 did — has
no effect.

### RLS model

| Audience                        | Access                                          |
| ------------------------------- | ----------------------------------------------- |
| `anon`                          | Published catalogue rows only; insert enquiries |
| `authenticated`, not an admin   | Identical to `anon`                             |
| `authenticated`, an admin       | Full CRUD on every table, plus the private ones |
| `super_admin`                   | Above, plus the `admin_users` roster            |

Being signed in grants nothing on its own. Every admin policy calls
`is_admin()`, so a valid session without an `admin_users` row sees exactly
what an anonymous visitor sees.

### Transactional integrity

Saving a location writes three tables — the stored position, the privacy
settings, and the generated public projection. As separate statements, a
failure on the third leaves the first two committed, and the published marker
then disagrees with the settings that were supposed to produce it. A property
set to `hidden` could keep serving a coordinate from the previous save.

`public.save_property_location` (migration `0008`) performs all three writes
plus the audit entry in one transaction. Everything commits together or
nothing does.

The privacy algorithm stays in TypeScript, in `lib/properties/privacy.ts`.
The Server Action derives the projection *before* the call and passes the
result in; the database function stores what it is given and never recomputes
it. A second implementation in SQL would be a second definition of what may
be published, and the two would eventually disagree.

### Validation

Validation lives in `lib/admin/validation/`, not inside the Server Actions,
so the same rules are available to future API routes, importers and
client-side hints — and so each rule is testable without a database or a
session.

| Module        | Covers                                              |
| ------------- | --------------------------------------------------- |
| `property.ts` | Names, slugs, measurements, description blocks      |
| `location.ts` | Coordinates, radius, manual markers, postcodes      |
| `result.ts`   | The shared `ValidationResult` / `FieldError` shapes |

Errors are returned per field, so a form highlights the input at fault
instead of showing one message above everything. The rules mirror the
database CHECK constraints deliberately: the database stays the authority,
and this layer exists to produce a message an administrator can act on rather
than a constraint violation they cannot.

There is a second, separate privacy review in
`lib/properties/privacy-validation.ts`. It reports configurations that are
legal but self-defeating — publishing a street address while hiding the
marker — as warnings, and never blocks a save. The distinction is deliberate:
validation can refuse, review cannot.

### Publishing rules

Publishing is the moment a record becomes public, so it is gated. A property
cannot be published until it has:

- a name, summary and slug
- a suburb and state
- location privacy settings
- a generated public projection

`public.property_publish_blockers(uuid)` returns the outstanding reasons as
readable sentences. The editor shows them before the administrator tries,
the Publish button is disabled while any remain, and the action re-checks
server-side. If readiness cannot be established the action fails closed.

Publishing is only ever done through the Publish button — the update path
also re-checks, so a record cannot be made public by a checkbox on a form.

### Duplication

Duplicating copies the **core record only**: names, measurements, status,
copy. It deliberately does not copy:

- **Location** — two properties sharing coordinates is wrong by
  construction, and copying privacy settings would apply one owner's decision
  to a different home.
- **Media** — storage objects would either be shared by reference, so
  deleting one property's photograph removes it from the other, or duplicated
  in the bucket at a cost nobody asked for.

A duplicate is always a draft, never featured, and never a display home. The
button says what is and is not copied.

### Reordering

Every mutation of an ordered group is serialised **by trigger**, not by
convention. `serialise_group_mutation` fires before insert, update and delete on
all four grouped tables and takes the group's advisory lock:

```
property-image:<property>:<image_type>
property-resource:<property>:<resource_type>
construction:<property>
feature:<property>:<category>
```

A trigger rather than four more call sites, because only reorder is an RPC — the
others are ordinary PostgREST writes, and there is no way to make a PostgREST
insert take an advisory lock. It is also the lesson from 0011 applied: a lock is
only as good as everyone remembering it, and a trigger cannot be forgotten.

A row moving between groups locks both, always in ascending key order, so two
opposite moves cannot deadlock. A row *arriving* in a group takes the next free
position — the position it held in its old group is meaningless, and a colliding
insert (two administrators creating at once, both having read the same maximum)
goes to the end rather than sharing a number.

Collision resolution deliberately does not apply to an update that only changes
`sort_order` within a group, because that is what reorder does: a permutation
passes through intermediate states where two rows briefly share a position, and
"resolving" those would rewrite the order being applied.

Verified with two live sessions: reorder versus insert, versus delete, versus
category change, two simultaneous reorders, and independent groups not
contending.

All four reorder functions — images, resources, construction updates, features —
require the **complete group**, not just a valid subset of it.

They used to check that every supplied id belonged to the property and the group,
which is an ownership question and was right. What they did not check was whether
the list *was* the group. `set sort_order = position` only touches rows named in
the list, so three ids sent for a group of four left the fourth on its old
position — frequently one now held by another row. Two rows then claim index 2 and
the order depends on whatever the read does with the tie.

Two administrators with the page open, one adding an image and the other
dragging, produces exactly that list.

The added check is a count: the number of rows in the group must equal the number
supplied. With the existing ownership and duplicate checks, that proves the list
is a permutation of the group — every id belongs, none repeats, and there are
exactly as many as the group holds, so nothing is missing. It also detects both
concurrent cases for free: an insertion makes the group larger than the list, and
a deletion makes an id unownable.

A stale list gets `PT409` and the message *"The list changed while you were
editing it. Reload and try again."*

An empty list is no longer a silent no-op. Sending nothing for a group of four is
a stale request, and only the count can tell that apart from a genuinely empty
group — which is still accepted and still does nothing.

Positions come back contiguous from zero. Public and admin reads additionally
break ties by id, so even data that predates these rules cannot appear to shuffle
itself between requests.

### Errors

No database message reaches the browser. Every write path passes failures
through `lib/admin/errors.ts`, which maps PostgreSQL error codes to
administrator-facing sentences and logs the full detail — code, message,
details, hint — server-side only.

Constraint names describe the schema, and PL/pgSQL context lines can carry a
function body; neither tells an administrator what to do differently. Only
messages this codebase raises itself pass through verbatim, matched by prefix
so a database error quoting our wording cannot smuggle its own detail out
with it.

### Audit log

`audit_log` is append-only. `UPDATE`, `DELETE` and `TRUNCATE` are revoked
from `authenticated` and `anon`, and triggers refuse all three regardless of
grants — an audit trail the audited party can edit is not an audit trail.

Entries written by `save_property_location` are inside its transaction, so
the trail cannot record a save that was rolled back.

Purging on a retention schedule remains possible for a database owner
connecting directly — not for the application, which holds no such credential.
That
is deliberate: it is an operational act, not something an admin session
should be able to perform.

### Security guarantees

- Private coordinates and privacy settings are never exposed to the browser
  on public routes — enforced by RLS *and* the privacy pipeline.
- Every admin route is gated by `requireAdmin()` in the Server Component or
  Action. There is no client-only check.
- Authorization is read from `admin_users` on every request. JWT claims and
  `user_metadata` are never trusted.
- **The service-role key is read by no module.** Every database call in the
  application, admin included, goes through the anon key plus the caller's
  session, so RLS applies to all of it. Work that needs more than an
  administrator's own grants goes through `SECURITY DEFINER` functions that
  check `is_admin()` and pin `search_path`.
- Search terms are escaped and quoted before reaching PostgREST. Interpolating
  them into an `or=` expression would let a comma or parenthesis add filters
  the caller never wrote; `lib/admin/search.ts` prevents it, and sort columns
  come from an allow-list because identifiers cannot be parameterised.
- Failed logins are throttled in the database, rejected with a single
  non-enumerating message, and recorded without ever storing a password, a token
  or a raw client address. See *Login hardening* above.
- Every response carries a Content-Security-Policy, HSTS, `nosniff`, a referrer
  policy, a permissions policy, COOP and `X-Frame-Options: DENY`. The admin gets a
  per-request nonce and forbids inline script; static public pages get a policy
  without `'strict-dynamic'`, because `'strict-dynamic'` makes browsers ignore the
  `'unsafe-inline'` those pages need. Asserted against served HTML by
  `scripts/verify-public-pages.sh`, including that every inline script on a nonce
  route actually carries the nonce.
- The audit log is append-only in the database, not merely by convention:
  `update`, `delete` and `truncate` are revoked *and* refused by triggers, for the
  table owner too. Purging it on a retention schedule requires deliberately
  disabling those triggers — see `docs/operations.md`.

## Content: build timeline and features

Two child tables carry the editorial detail the fixed property columns cannot.

### Build timeline

`construction_updates` holds one entry per build stage, from a fixed vocabulary
of eight: planning, site preparation, slab, frame, lock-up, fixing, final
inspection, completion. A stage may appear at most once per property, enforced by
a unique index.

The vocabulary is a `CHECK` rather than an enum. Widening a `CHECK` is a
constraint change; widening an enum is a type alteration with more awkward
migration semantics, and the list is expected to grow.

The public page prefers the recorded diary and falls back to the company's
documented process:

- **With published updates**, `resolveConstructionTimeline()` shows those,
  re-sorted into build order so a diary written out of sequence still reads
  forwards. Each entry is numbered by its position in the whole vocabulary, so a
  skipped stage shows as a gap rather than being silently closed up.
- **With none**, it derives the timeline from `currentStageId` against
  `content/process.ts` — the same process the homepage explains. The page
  discloses which it is showing, so a standard process is never mistaken for this
  home's record.

Overall completion divides by the whole stage vocabulary, not by the number of
updates recorded. Averaging over recorded updates only would report a home with
one completed planning entry as 100% built. Counting unrecorded stages as zero
understates rather than overstates, which is the safe direction for a claim a
buyer may rely on. A property whose `status` says the build has finished reads
100% regardless — the business's own statement about the home outranks an
incomplete diary.

Nothing in the component is fixed to a stage count. Both paths read their length
from their source.

### Features

`property_features` holds `category`, `label` and an optional `value`, where the
six categories become headings on the property page: highlights, inclusions,
specifications, materials and finishes, energy and comfort, design.

A closed vocabulary because each category *is* a section. Free text would produce
a page of one-item groups, each with its own heading.

- A label with no value is legitimate — "Double glazing throughout" is a complete
  statement — and renders as one rather than being padded out.
- Reordering is scoped to a category. `reorder_property_features()` verifies both
  the property and the category for every id, so an item cannot be moved into
  another group by reordering.
- Moving a feature between categories recomputes its position in the new group;
  keeping the old `sort_order` would drop it somewhere arbitrary.
- A label that duplicates a fixed column — "Bedrooms", "Land size" — raises an
  advisory, not an error. "Bedrooms — 4, all with built-in robes" says more than
  the figure the specifications table already shows, so the decision is the
  administrator's.

Groups with no published features do not render. An empty heading is worse than
no heading.

## Enquiries

### The public form

A real form posting to a Server Action, replacing the `mailto:` link that stood
in for it. A mailto depends on the visitor having a mail client configured,
produces nothing the business can assign or track, and loses the enquiry
silently when it fails.

- It is a `<form action={serverAction}>` with `useActionState`, so it submits and
  reports errors before hydration.
- Every field has a `<label>`; errors attach via `aria-describedby` and
  `aria-invalid`; the outcome is announced in a live region.
- On a validation failure the typed values are returned and re-rendered, so
  nothing has to be retyped.
- **It inserts as `anon`, not with the service role.** The row goes through the
  same anonymous policy a browser would use, so the database enforces
  `status = 'new'`, refuses `admin_notes`, and refuses a property that is not
  published. A mistake in the action cannot produce a row the policy would have
  rejected.

### Anti-abuse: what it is and is not

Two checks: a honeypot field (`company_website`) hidden from sight, from
assistive technology and from the tab order, and a render timestamp used to
reject submissions completed implausibly fast or held open for more than two
hours.

**These are friction, not security.** Both values are supplied by the client. A
script can leave the honeypot empty and send a timestamp three seconds old. They
stop the indiscriminate form-filling that makes up most spam and nothing more.
What would raise the bar — a signed nonce, or per-IP counting in shared storage —
is not implemented, and no rate limiting is claimed.

A *missing* timestamp is not treated as a signal. The field is populated by an
effect when the form mounts rather than rendered by the server, because these
pages are cached and a server timestamp would arrive stale and read as expired.
That makes absence ambiguous: a visitor with JavaScript disabled submits without
it, and so does a script that strips hidden fields. Rejecting on absence would
block the visitor while costing the script one line. The honeypot is the hard
check; timing refines it when a timestamp is present.

### The spam signal is derived, not stored

A message containing a link is flagged in the admin list. That flag is computed
on read by `looksLikeSpam()`, not written at submission time.

Storing it was considered and rejected. The submitter inserts as `anon`, and the
insert policy would have to either permit them to set the column — letting a
spammer mark their own message clean — or forbid it, in which case nothing on the
public path could set it. Deriving it also means the heuristic can be improved
without a migration or a backfill.

### Staff notes and the write path they opened

`enquiries.admin_notes` is staff-facing and never published — the table has no
anonymous `SELECT` policy.

Adding it opened a write path worth naming. `enquiries` has an anonymous
`INSERT` policy and migration `0003` grants `INSERT` at table level, and a
table-level grant covers every column, including ones added later. As written, a
member of the public could have submitted an enquiry with `admin_notes` already
populated — text staff would read as if a colleague had written it.

A column-level `REVOKE` does not help: while the table-level grant exists,
per-column privileges are not consulted. Revoking the table grant and granting
each column individually would break the form every time a column was added. So
migration `0010` replaces both insert policies with ones that require
`admin_notes is null`, listing the columns a submitter may decide.

### Retention

**There is no delete, anywhere.** No `DELETE` policy exists on `enquiries` for
any role, and the admin interface offers no destroy action. Archiving takes an
enquiry out of the queue while keeping the record of the question that was asked.

A permanent deletion route belongs with a written retention policy. Until the
business has one, there is nothing in the interface that can quietly destroy
someone's enquiry. The enquiry list says so on the page, rather than leaving an
administrator hunting for a button that was deliberately omitted.

### What the audit log records

That an administrator changed an enquiry, and nothing about the person who sent
it. No name, no email address, no phone number, no message text — and not even
the length of the message. A second copy of someone's personal data inside an
append-only table nobody can edit is a liability, not a control. The enquiry's own
id is enough to find the record.

Server logs follow the same rule: a failed insert logs the PostgREST error code
and message, never the row.

## SEO

### The chain

Every metadata field resolves in the same order, and the order is the design:

1. **The administrator's override**, from the property's Search tab.
2. **The property's own content** — name, suburb, summary, status, hero
   photograph. Correct for almost every home, which is why the override is
   usually blank.
3. **The site default**, from Settings, then the values in `site-config.ts`.

`lib/seo/metadata.ts` owns all three levels. `derivePropertyMetadata()` is level
2 and takes a structural type rather than a full `Property`, so the admin editor
can preview exactly what the live page will produce instead of deriving it
separately — two independent derivations is how a preview and a page drift apart.

The site-wide level is **passed in**, not read:

```ts
propertyMetadata(property, { defaultMetaTitle, defaultMetaDescription, defaultOgImageUrl })
```

A resolver that reached for the database would be untestable without mocking one
and would issue a query from whatever component called it. The page already has
the values — `getPublicSettings()` is request-cached — so passing them costs one
read for the whole render and keeps the resolver a pure function.

In practice only the image reaches level 3: a property always has a name, a suburb
and a summary, so levels 1 and 2 always produce a title and a description. The
site default is still consulted for them, because a chain with a hole in it is one
refactor away from being wrong.

### Social images

`seo_og_image_id` is checked against the database before it is saved:
`checkOgImageEligibility()` refuses an image belonging to another property, one
with no file or link, an unpublished one, and a floor plan.

A social preview is fetched by third parties from a public URL with no session, so
a draft image would be a broken preview everywhere the link is shared. That is
refused rather than warned about. With no override the hero is used, and
`heroImageUrl()` already declines to return a floor plan or an unpublished image.

With no override the hero is used, and with no hero the **site-wide default from
Settings** is used. That third level was previously omitted, on the reasoning that
a generic banner on every property link looks like the wrong home rather than
none. That argument holds for an image the code invents; it does not hold for one
the business went to Settings and chose. Opting in is the difference.

There is still no built-in image. With nothing configured and no photograph, a
property page carries no social image at all.

`resolvePropertyMetadata` reports which level supplied the image, so the chain is
asserted directly in tests rather than inferred from a URL.

If the chosen image later becomes ineligible — unpublished, deleted,
recategorised — the mapper stops resolving it and the page falls back to the hero.
The editor reports the stored choice as no longer usable rather than showing
"Hero photograph" as though nothing were set.

### Twitter cards

Built from the same resolved values as Open Graph, so a card cannot disagree with
the page or with the other network. `summary_large_image` when there is an image
and `summary` when there is not — claiming a large image and supplying none
renders an empty banner.

No `site` or `creator` handle. None is configured, and inventing one would
attribute the business's pages to an account it does not own.

### `noindex`

`robots` is set on a property page only when the property is marked noindex, and
then only ever to `index: false`. Next merges metadata field by field, so leaving
it unset lets the root layout's rule apply — and that rule is what keeps preview
and local deployments out of search results.

`index: true` is never emitted. A per-property setting can restrict indexing
beyond the deployment default; it must not widen it, or a property marked
indexable would be indexed *from a preview URL*.

## Site settings

One row of typed configuration, using the `id boolean primary key check (id)`
idiom: `true` is the only value satisfying both the check and uniqueness, so the
table cannot hold two rows.

### Why not key/value

A key/value store has no validation, no type safety, and nothing stopping a
secret being written into it. The model is a fixed set of typed columns, which is
the **primary** defence against a credential ending up in a table the public site
reads: there is no column an API key belongs in.

The secondary defence is `detectSecret()`, which recognises JWTs, Supabase keys,
Stripe-style keys, PEM blocks, AWS access keys, GitHub tokens and
`key = value` credential shapes. It runs in the validator on save and live in the
form as the administrator types. It is a heuristic and is not exhaustive — an
exhaustive definition of "looks like a secret" does not exist — but it catches the
realistic accident of pasting a key into a field while moving configuration
around.

### The enquiry notification address is reserved, not active

`enquiry_recipient_email` stores an address and **nothing sends to it**. No
notification delivery exists; enquiries are stored and read in the Enquiries page
of the dashboard.

The column is kept rather than dropped — the address is a real business decision
worth recording, and dropping it would discard whatever has been entered — but the
admin field is labelled *"(reserved)"* and says so in as many words, and the column
comment says so in the database. A setting that appears operational while doing
nothing is worse than no setting.

Building delivery is Phase 7 work. Until then the honest statement is the one on
the screen.

### The public view

`site_settings` is administrator-only under RLS. The public site reads
`site_settings_public`, a view that omits `enquiry_recipient_email`.

A view is necessary because RLS is row-level: granting the public site access to
the table would expose every column of the single row, including the internal
routing address. The view gives column granularity, and its `select` list is the
decision about what is public — adding a column there publishes it.

### Fallbacks

`siteConfig` stays the floor. It is compiled in, always present, and reviewed in
a pull request, which is what you want for the legal name and the description.
The settings row overrides the handful of values a business legitimately changes
without a deploy: phone number, email address, address to display, a site-wide
notice.

A null column **falls back** rather than blanking the value. An administrator
clearing a field by accident cannot leave the site with no contact details.
`getPublicSettings()` never throws either — a settings table that is briefly
unreachable logs and returns the defaults rather than taking the site down.

It is wrapped in React's `cache`, so the notice, the header and the footer share
one read per request.

### No default map centre

Deliberately absent. The explorer fits its viewport to the properties it is
showing, which is strictly better than a stored centre — a stored centre goes
stale the moment the business builds in a new suburb, and nothing would say so. A
setting with no reader is worse than no setting.

## Dashboard and media overview

### Counts

Every dashboard figure is a `head: true` count:
`select("id", { count: "exact", head: true })`. No rows are transferred; the
count arrives in the `Content-Range` header. On `enquiries` that matters — the
alternative moves names, email addresses and message bodies across the network to
render a card that says "12".

The exception is the publish-blocked count, which is not a row count: it asks the
publish gate about each draft. `count_publish_blocked_properties()` calls
`property_publish_blockers` — the same function publishing calls — so the
dashboard cannot claim a property is ready when publishing would refuse it, or the
reverse. The cost is one function call per draft, and drafts are the properties
somebody is actively working on, so it stays small.

That number replaced a subtraction. The dashboard used to report "properties with
no location settings", derived from two table counts, which is a real figure but
not the number blocked from publishing — it misses a blank summary, a missing
projection row, and anything else the gate checks.

Both now appear, each labelled as what it counts: the blocked total, and the
subset with no location at all, which is the most common cause and the one with an
obvious next step. The location line is suppressed when it accounts for the whole
figure rather than repeating it.

The blocked count is the one metric allowed to fail on its own. If that single read
fails the card is omitted; the others still render, because three accurate numbers
plus one omitted card beats a page that refuses to load.

If any single count fails, the whole set is reported as failed. A dashboard
showing three real numbers and one zero is worse than one saying it could not
load.

There are no charts. A builder with a dozen homes gains nothing from a graph, and
a graph would need the row data these counts exist to avoid transferring.

The dashboard leads with a "needs attention" list built only from conditions that
are actionable — unread enquiries, properties with no location, images without
alt text, drafts. Each links to the filtered page where the work happens, and
nothing appears at zero.

### The media page

Uploading and ordering stay in the property editor, where the image sits next to
the home it belongs to. The global page answers the question that could not be
asked there: across the whole catalogue, what is missing?

It lists every property with its image and document counts, its hero state
(*live*, *not visible*, *not set*) and any outstanding alt text, ordered with
outstanding work first. It is a worklist that links into each property's Media
tab — not a second uploader, and not a page saying the work happens elsewhere.

It reads three narrow projections and aggregates them in one pass, rather than
issuing a query per property. The row cap is explicit: past it, the page says the
totals are partial instead of quietly under-reporting.


## Technical SEO

| Route | What it does |
| --- | --- |
| `/robots.txt` | Allows the public site, disallows `/admin` and `/api/`, advertises the sitemap. **Disallows everything on a preview deployment.** |
| `/sitemap.xml` | The two static routes plus every published, indexable property. Revalidates hourly. |

`robots.txt` uses the same `env.isIndexable` flag as the root layout's `robots`
metadata, so the two cannot disagree. Disallowing `/admin` is belt-and-braces
over the `noindex` the admin layout already sends: a `noindex` only works after
the page has been fetched, so a crawler still spends budget discovering that a
private area exists.

The sitemap lists only published properties, and drops any carrying their own
`noindex` — a URL in the sitemap while asking search engines not to index it is a
contradiction, and the sitemap is the half that says "please index this". It reads
through `getSitemapEntries()`, four columns, rather than `getProperties()` and its
full detail graph: the sitemap uses a slug and a timestamp, so fetching images,
features and testimonials hourly to discard them would be waste.

`lastModified` comes from the property's own `updated_at`. Emitting "now" for
every entry on every crawl is the tempting shortcut and it teaches the crawler to
ignore the field.

### Structured data

Three JSON-LD documents: `HomeAndConstructionBusiness` on every page (once, in the
root layout), and `SingleFamilyResidence` plus `BreadcrumbList` on each property.
Properties reference the organisation by `@id` rather than repeating it.

**Every claim is visible on the page it describes.** Deliberately absent:

| Not emitted | Why |
| --- | --- |
| `aggregateRating`, `review` | There are no reviews. A rating with nothing behind it is the most common structured-data abuse. |
| `offers`, `price` | `price_display` is free text — "From $780,000", "Contact agent". Parsing a number out of marketing copy to satisfy a schema invents a commitment. |
| `geo`, `latitude`, `longitude` | **A privacy decision.** The projection blurs, relocates or omits a position by design; publishing a coordinate in JSON-LD would republish that decision in the most scrapable form there is. |
| `datePosted`, `availabilityStarts` | Nothing records them. |
| `foundingDate`, `numberOfEmployees`, `award` | A builder's credibility markers are exactly the fields that must not be guessed at. |

`SingleFamilyResidence` rather than `Product`, because `Product` invites the price
and rating fields that must stay empty. The address is suburb-level only, which is
the precision the site commits to everywhere else. Measurements carry units and
are omitted rather than defaulted, because `0` in a schema means zero, not unknown.

`serialiseJsonLd` escapes `<`, so a `</script>` in an administrator-written
description cannot close the tag and turn the rest of the payload into markup.

## Third-party embeds

A YouTube or Vimeo resource becomes a player. Anything else — Matterport, Kuula, a
builder's own viewer — becomes a link.

**The `iframe src` is never a URL somebody typed.** `resolveEmbed` recognises the
host against an exact allow-list, extracts an id, and *constructs* the embed URL.
The alternative — a `startsWith` check on the stored URL — fails to
`youtube.com.attacker.example`, to a `javascript:` scheme, and to any query
parameter the administrator pasted. Here, every parameter is discarded and an
unrecognised provider produces no iframe at all.

Privacy and loading:

- YouTube goes through `youtube-nocookie.com`; Vimeo gets `dnt=1`.
- Nothing loads until the visitor clicks. `loading="lazy"` defers by viewport
  position, so a visitor who scrolls past still pays; consent is the better
  trigger. A property page with a tour and drone footage makes **zero**
  third-party requests until somebody wants one — asserted in
  `scripts/verify-public-pages.sh`.
- An unlisted Vimeo video's privacy hash is not carried into the embed, because
  that would publish it in the page source.
- The frame is sandboxed to what a player needs. No `allow-top-navigation`, so it
  cannot redirect the page around it; no camera, microphone or geolocation.
  `referrerPolicy="strict-origin"` tells the provider the site, not which property
  is being viewed.
- Every embed has an "Open on …" fallback for a browser or extension that blocks
  the frame.

## Caching

The three catalogue routes — `/`, `/properties` and `/properties/[slug]` —
are statically generated with a five-minute revalidation
(`revalidate = 300`). This means:

- Every response serves from the Next.js Data Cache until it expires; the
  Supabase reads behind them do not run per request.
- A lot of editing activity in a five-minute window refreshes at most one
  request per route, so the database is shielded from browse traffic spikes.
- Admin edits become visible no more than five minutes after they save, and
  no webhook is needed for the current traffic level. When richer tag-based
  invalidation is warranted, `revalidatePath("/properties")` /
  `revalidatePath("/properties/[slug]")` from a future Supabase webhook
  replaces the time-based rule.

## Scripts

```bash
npm run dev        # development server (Turbopack)
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
npm run lint:fix   # ESLint with autofix
npm run typecheck  # tsc --noEmit
npm test           # Vitest, run once
```

Verification scripts, none of which need a Supabase project:

```bash
sh scripts/verify-public-pages.sh          # security headers + structured data,
                                           # asserted against served HTML.
                                           # Needs a completed `npm run build`.
sudo sh supabase/verify/run-local.sh       # migrations + five SQL suites
sudo sh supabase/verify/04_concurrency.sh  # two interleaved sessions
sh scripts/check-type-drift.sh             # generated types vs database.ts (CI)
```

### Continuous integration

`.github/workflows/ci.yml`, on every push and pull request, in two jobs:

- **`verify`** — `npm ci`, lint, typecheck, test, build, then
  `scripts/verify-public-pages.sh` against the built output. Asserting headers
  against *served HTML* rather than against the config that produces them is the
  point: a header that a test says is present but the server does not send is
  worse than no test.
- **`database`** — a `postgres:15-alpine` service container. Applies the stubs and
  every migration to an empty database, runs all five SQL assertion suites, runs
  the concurrency suite over TCP, then regenerates types from the result and fails
  on drift.

Neither job holds a production credential. The database job uses a throwaway
container rather than a Supabase project, and the build needs no secrets — a
missing Mapbox token degrades to the list-only fallback instead of failing.

`.github/dependabot.yml` batches patch and minor updates into one pull request per
dependency type each week and leaves majors ungrouped, so a `next` or `react`
major arrives as its own reviewable change rather than inside a batch of fifteen.

## Routes

| Route                | What it is                                     |
| -------------------- | ---------------------------------------------- |
| `/`                  | Marketing homepage                             |
| `/properties`        | The map and listing experience                 |
| `/properties/[slug]` | Property page                                  |

`lib/routes.ts` builds every internal path. A property page can link back to the
map with `?property=<slug>`, which opens that home's preview on arrival.

## Property pages

Server-rendered end to end, except the gallery, which only mounts once a home has
more than one image. Every section is driven by the property's own data and a
section with nothing to show renders nothing — no "coming soon" placeholders.

| Section          | Appears when                                            |
| ---------------- | ------------------------------------------------------- |
| Hero             | always — status, address, summary, actions               |
| Showcase         | always — photography, or the architectural drawing       |
| Overview         | the record has a `description`                           |
| Specifications   | always — measured figures only, nothing estimated        |
| Build progress   | always — derived from the four documented build stages   |
| Location         | always — published location and privacy statement        |
| Tour, footage, downloads | the record has a tour, drone video or documents   |
| Testimonials     | the record has testimonials                              |
| Enquiry          | always                                                   |
| More homes       | other properties exist                                   |

The future-ready fields are already in the model, so each of these becomes
available by adding data rather than by changing code:

- **Virtual tours and drone video** — `visuals` entries with a `kind`, hosted in
  Supabase Storage or linked externally.
- **Brochures and floor plan PDFs** — `documents` entries; only those that
  resolve to a file are rendered.
- **Construction timeline** — derived from `currentStageId` against the published
  process, so a home cannot claim a stage that does not exist.
- **AI-generated descriptions** — `description.source: "ai-assisted"` renders a
  disclosure line; nothing is passed off as human writing.
- **Testimonials** — published only with a customer's permission, which is why the
  demonstration data has none.
- **Display homes** — `displayHome` adds a badge and an optional opening note.

## The property map

`/properties` is a Server Component that loads properties and renders the page
shell plus a full server-rendered listing. The interactive explorer hydrates on
top of it.

- **One filtering pipeline.** `lib/properties/filters.ts` is pure and is called
  once in `PropertyExplorer`. The list, the result count and the map all read
  that single result, so they cannot disagree. The selected property is derived
  from the filtered list, which means filtering something out deselects it
  automatically.
- **Clustering through Mapbox, not React.** One clustered GeoJSON source drives
  the cluster circles, counts, markers and the hover and selected rings. Hover
  and selection are layer filters on the promoted feature id, so they never
  trigger a React render. Adding hundreds of properties adds no components.
- **Marker shapes, not just colours.** Each status has its own silhouette —
  circle, triangle, diamond, ring — drawn on a canvas at runtime using the same
  CSS variables as the rest of the UI. A legend on the map decodes them.
- **Dynamic import.** Mapbox GL and its stylesheet load only when the map
  renders, and never on the server. The homepage ships none of it: its map
  section is a schematic with a link, not a live map.
- **URL state.** `status`, `suburb` and `beds` plus `view` live in the query
  string, so a filtered view can be shared. Values are validated on read.
- **Camera policy.** Fit to results on load and whenever the result set changes;
  ease to a selected property only when its pin is not already usable where it
  is; zoom to the expansion level on a cluster click; never move the camera while
  someone is simply reading. Durations drop to zero under reduced motion.
- **No token, no crash.** `getMapboxToken()` returns null instead of throwing,
  and the page renders a polished "map unavailable" panel beside a fully working
  list. Environment hints appear only in development.

## Property data and location privacy

`lib/properties/repository.ts` is the only way to read properties. It is already
asynchronous so Supabase can replace the local file in
`content/properties.ts` without touching a single component.

Every record passes through `lib/properties/privacy.ts` on the way out. That
module is the only place a stored position is read, and `toPublicProperty` is the
only way a property leaves the data layer, so the rules are enforceable rather
than aspirational.

### Location visibility

Each property chooses its own visibility. **Status has no influence on it** — a
sold home can be shown exactly, and a home for sale can be hidden.

| Visibility    | Published marker                                                            | Public label                    |
| ------------- | --------------------------------------------------------------------------- | ------------------------------- |
| `exact`       | The stored position                                                         | none                            |
| `approximate` | A fixed position within `privacyRadiusMeters` (100 m – 5 km)                | "Approximate location"          |
| `suburb`      | The suburb's reference position, derived from the suburb, not the property   | "Suburb only"                   |
| `hidden`      | No marker. The home stays in every list                                     | "Location available on enquiry" |

**How approximation works, and why it is safe.** The position is quantised to a
grid whose cell is the privacy radius, and the cell centre is published. Every
position inside a cell produces the same output, so the original cannot be
recovered — unlike a reversible offset, which anyone reading this repository
could undo. A small displacement derived from the *cell* is then applied so the
result does not sit on an obvious grid; because it depends only on the cell, it
adds no information about the home. The result is deterministic, so a marker
never moves between page loads.

**The radius is never published.** Public copy says the location "is
approximate" and "has been generalised on purpose", and nothing more. Quoting a
distance would invite a visitor to draw a circle and search inside it, and would
state a guarantee that depends on which grid cell a home happens to fall in. The
radius stays in the record; it does not appear in the public property object.

### Marker resolution, in precedence order

| Visibility  | Marker mode | Published marker                      |
| ----------- | ----------- | ------------------------------------- |
| `hidden`    | either      | none — hidden always wins              |
| any other   | `manual`    | the administrator's chosen coordinate  |
| `exact`     | `automatic` | the stored coordinate                  |
| `approximate` | `automatic` | the generalised coordinate           |
| `suburb`    | `automatic` | the suburb reference coordinate        |

A manual marker is a separate pair of fields, read but never written. The stored
private coordinate is never modified, and `lib/properties/privacy.ts` remains the
only module that transforms private location data.

### Directions policy

Directions default to allowed for `exact` and off for everything else, because
sending someone to a generalised marker either misleads them or narrows down the
home. `hidden` never offers them. An administrator can override any property, and
`lib/properties/privacy-validation.ts` flags an override that undermines the
marker.

### Configuration review

`validatePropertyPrivacy()` returns structured warnings — code, severity, field
and a message written for an administrator — for combinations that contradict each
other: a street address published with a hidden marker, directions enabled for a
generalised one, a manual marker with no position placed, a suburb with no
reference. It never throws and never changes a setting; a deliberate choice is
still applied. A test asserts the shipped data produces no warnings at all.

### Other per-property controls

- **Manual marker.** `publicMarkerMode: "manual"` publishes coordinates an
  administrator placed by hand. The stored position is never modified, and
  `hidden` still wins over a manual marker.
- **Address visibility.** House number, street, suburb and postcode are toggled
  independently, so "27 Example Street, Craigieburn VIC 3064", "Example Street",
  "Craigieburn VIC" and no address are all expressible. A house number is never
  published without its street.
- **Directions.** `allowDirections` gates the "Open in Maps" action, and it is
  withheld automatically when there is no marker to navigate to.

### Public and private data

`PropertyRecord` holds the private position, the address parts and the privacy
settings. `Property` holds neither: `toPublicProperty` copies public fields across
**explicitly** rather than spreading and deleting, so a field added to the record
later — an owner's phone number, an internal note — stays private until someone
deliberately publishes it.

The demonstration data is fictional: plan-type names, no street names or house
numbers, no invented prices or dates, and general coordinates chosen so no
position corresponds to a real private residence. It spans all four visibility
modes, and deliberately includes a sold home shown exactly and a completed home
hidden, to prove status never drives visibility. Replace the data and review
every `privacy` block before launch.

### Ready for the admin dashboard

`lib/properties/privacy-options.ts` holds the option metadata — labels,
descriptions, radii, address presets and runtime guards — that a future admin
form will render. No dashboard exists yet; the vocabulary lives beside the rules
so the dashboard and the public site can never describe a setting differently.

## Project structure

```
src/
  app/
    admin/                 Login, unauthorized, and the (dashboard) route group
    properties/            Map and listing route, plus the property detail route
  components/
    admin/
      content/             Build timeline and feature managers
      enquiries/           Enquiry queue: filters bar and list
      media/               Per-property media manager
      seo/                 Per-property search settings
      settings/            Site settings form
      admin-alert.tsx      One banner component for all four tones
      form-controls.tsx    Field / Toggle / Checkbox with the ARIA wiring
    enquiry/               The public enquiry form
    layout/                Container, Section, SiteHeader, SiteFooter, SiteNotice
    map/                   PropertyMap (dynamic), loader, fallback, legend
    media/                 ArchitecturalFrame line drawings (image placeholders)
    motion/                Reveal / RevealGroup (Framer), AnimatedText (CSS), Parallax (GSAP)
    property/              Card, list, filters, preview, sheets, explorer, detail sections
    sections/              One file per homepage section
    ui/                    Button, SectionHeading, Statistic, Timeline, typography
  content/                 Editable content: properties, process, statistics
  hooks/
    use-gsap.ts            Scoped, auto-reverting GSAP contexts
    use-property-filters.ts  Filter and view state, synced to the URL
  lib/
    admin/
      actions/             Server Actions, one file per entity
      validation/          Shared validators mirroring the database constraints
      *-repository.ts      Admin reads, one per concern (property, media, content,
                           enquiry, settings, metrics)
      audit.ts             Append-only audit log writes
      auth.ts              requireAdmin() — server-side authorization
      search.ts            PostgREST filter escaping and sort allow-lists
    animation/             Shared easings, durations, Framer variants, GSAP setup
    design/                Property status presentation tokens
    enquiries/             Public submission action and its form-state contract
    images/                Supabase Storage URL resolution for property media
    map/                   Map config, GeoJSON building, marker artwork
    media/                 Upload configuration and validation
    properties/            Data sources + repository + row mappers + filters + privacy (+ tests)
    seo/                   The metadata fallback chain
    settings/              Public settings resolution over site-config defaults
    supabase/              Browser, server, catalogue and admin clients
    env.ts                 Typed, validated environment access
    routes.ts              Internal path construction
    site-config.ts         Brand details, navigation, service areas
    utils/cn.ts            Class merging aware of the custom type scale
  providers/
    app-providers.tsx            Client boundary: MotionConfig + smooth scroll
    smooth-scroll-provider.tsx   Lenis + ScrollTrigger integration
  types/                   Shared domain types and generated database rows
```

## Tests

`npm test` covers the pure logic behind the site: listing filters and URL
round-tripping, GeoJSON generation, the location-privacy transform, slug lookup,
row mapping, media configuration and path validation, admin search escaping,
error handling, the construction timeline, the metadata chain, the security-header
and Content-Security-Policy builders, the login-security helpers (address
hashing, redirect allow-list, Turnstile enforcement rules), and every validation
module — property, location, media, construction, features, enquiry, SEO and
settings.

512 tests across 24 files at the time of writing.

Tests live beside the code as `*.test.ts`. There is no component or browser test
setup — that would be a much heavier commitment than the current surface
justifies — so what is *not* covered is worth stating plainly: no React component
renders in a test, no Server Action executes, and nothing exercises PostgREST or
the Storage HTTP API.

The database layer is covered separately by the SQL harness in
`supabase/verify/`, which **has been run** against PostgreSQL 15 and passes:

```bash
sudo sh supabase/verify/run-local.sh
```

That run found two defects that review had missed across two phases — migration
`0001` did not parse, and `property_publish_blockers()` raised on any incomplete
property. Both are recorded in `supabase/verify/README.md`. Worth remembering the
next time SQL looks obviously correct.

Every component takes typed props and no component reaches into global state.
Sections compose primitives; primitives never know which section they are in.

## Content to confirm before launch

Content lives in `src/content/` and `src/lib/site-config.ts` so copy can be
edited without touching components. Nothing unverified is published: the site
shows no figures for homes delivered, years operating, projects or satisfaction,
and no claims about awards, ratings or registrations.

Three things still need the business to confirm them:

| Where                    | What needs to happen                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site-config.ts`         | The email address and phone number are placeholders. They are the fallback the site uses until the business fills in Settings, and are still what is published if it never does. Confirm both before launch. |
| `content/properties.ts`  | Ten fictional concept façades with demonstration coordinates, used only when Supabase is not configured. The live source is the database; replace this file with documentation once it is retired. |
| `supabase/seed.sql`      | The same concept content in database form. Replace with real records (and review every privacy setting) before public launch.                          |

The statistics section only publishes figures derived from data in this
repository — the number of core suburbs, statuses and build stages — so it cannot
drift out of date. Once a real figure is confirmed, add it to
`content/statistics.ts` and it appears automatically.

Service areas are the confirmed core suburbs: **Mickleham, Craigieburn and
Donnybrook**. Add another suburb only when the business supplies it; the list
feeds both the locations section and the statistics count.

## Images

No stock photography is used. Property media resolves in one place,
`lib/images/property-image.ts`:

1. A property with an `imagePath` renders that file from the public
   `property-media` Supabase Storage bucket through `next/image`.
2. A property without one renders an `ArchitecturalFrame` elevation drawing,
   captioned "Architectural preview" so a visitor knows it is a drawing rather
   than photography.

Adding photography is therefore a per-property data change, not a code change.
`next.config.ts` already allows the Supabase host once the URL is configured.

## Routes

`lib/routes.ts` builds every internal path. Property cards already link using
their real `slug`; because `/properties/[slug]` arrives with the property system,
`propertyHref()` currently resolves to the enquiry section instead of a dead URL.
Flip `PROPERTY_DETAIL_ROUTES_LIVE` when that route ships — no component changes.

## Design system

All colour, type, spacing, elevation and motion values are declared as CSS
variables in `src/app/globals.css`, then bridged into Tailwind utilities through
`@theme inline`. Components only ever use the semantic layer.

- **Surfaces**: `bg-background`, `bg-background-alt`, `bg-surface`,
  `bg-surface-raised`, `bg-surface-overlay`
- **Content**: `text-foreground`, `text-foreground-muted`,
  `text-foreground-subtle`, `text-foreground-inverse`
- **Accent**: `text-accent`, `bg-accent`, `bg-accent-strong`, `bg-accent-soft`
- **Type scale**: `text-display`, `text-heading-1` … `text-heading-3`,
  `text-lead`, `text-eyebrow`; `font-display` (Cormorant Garamond) and
  `font-sans` (Inter)
- **Status colours**: `bg-status-move-in-ready`, `bg-status-under-construction`,
  `bg-status-completed`, `bg-status-sold`
- **Motion**: `ease-luxe`, `ease-entrance`, `ease-exit`,
  `duration-(--duration-base)`

- **Textures**: `grain` (fine film grain) and `blueprint-grid` (architectural
  set-out grid), both defined as Tailwind utilities

The palette is a dark luxury theme: near-black backgrounds, charcoal surfaces,
off-white text, warm sand neutrals and a brass accent. To change a status colour
or a surface tone, edit the variable in `globals.css` — nothing else.

Property status labels and descriptions live in
`src/lib/design/property-status.ts`, so the badges, filters and map markers added
later all read from one place.

## Animation

Each layer has exactly one job, and each effect has exactly one owner:

| Layer                    | Owns                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| **CSS**                  | Load-time entrances (the hero sequence, word reveals, the scroll cue) and hover/focus states |
| **GSAP + ScrollTrigger** | Scroll-linked work only: the hero parallax layer and the process timeline                    |
| **Framer Motion**        | Stateful UI: status tabs, section reveals, the animated counters                             |
| **Lenis**                | Page scrolling, nothing else                                                                 |

- The hero entrance is one CSS choreography, staged with `--enter-delay` in
  `globals.css`. CSS was chosen over a JavaScript timeline deliberately: it starts
  with the first paint so nothing flashes, it survives with JavaScript disabled,
  it costs no bundle, and it removes any question of two systems fighting over
  the same sequence.
- `SmoothScrollProvider` owns the single Lenis instance, lets Lenis run its own
  frame loop, and forwards every scroll to `ScrollTrigger.update()`. It changes
  nothing global. `lib/animation/gsap.ts` is the only module permitted to touch
  GSAP's global configuration, and today it needs to touch none of it.
- `useSmoothScroll()` exposes `scrollTo` and `setPaused` and falls back to native
  scrolling — with an explicit `behavior: "auto"` — when Lenis is not running.
- `useGsap()` runs animations inside a scoped `gsap.context` and reverts them on
  unmount, which prevents leaked ScrollTriggers. It is for scroll-linked work
  only: server-rendered markup is already painted before React hydrates, so a
  JavaScript hook cannot hide content ahead of the first paint.
- The process timeline uses two ScrollTriggers for the whole section regardless
  of how many stages it holds.
- Animation directs attention rather than decorating: one entrance, one
  scroll-linked line, one parallax layer, and hover/focus feedback. Everything
  animated moves with transforms and opacity only.
- Reduced motion is handled at every layer: the entire CSS entrance block sits
  behind `prefers-reduced-motion: no-preference`, a reduce-motion rule collapses
  any remaining animation or transition to a single frame and forces instant
  anchor scrolling, GSAP and Lenis check the query and do nothing, and
  `MotionConfig reducedMotion="user"` covers Framer Motion.

Server Components are the default. `"use client"` appears only where a browser
API or React state is genuinely needed: the header, the status tabs, the
timeline, the counters, the parallax layer, the scroll cue, and the providers.
The hero, the property cards and every section wrapper render on the server.

## Deployment

Import the repository into Vercel, add the environment variables, and deploy. No
adapters or custom configuration are needed. `next.config.ts` automatically
allows `next/image` to load from your Supabase Storage public bucket once
`NEXT_PUBLIC_SUPABASE_URL` is set.

**`docs/operations.md` is the runbook**: the full environment variable reference,
Supabase and storage setup, administrator provisioning, Turnstile, staging the
CSP, deploying and rolling back migrations, backup and restore, retention for the
audit log and login attempts, the queries worth monitoring, and incident response
— including how to revoke an administrator's access in one statement.

Two things to do before the first production deploy:

1. Set `LOGIN_HASH_SALT` and both Turnstile keys. A production deployment without
   the Turnstile keys refuses the login attempts that need a challenge.
2. Deploy once with `CSP_REPORT_ONLY=true`, exercise the map, an upload, an embed
   and a login, check the browser console for violations, then remove it. The
   policy is enforced by default; this only stages the first rollout.
