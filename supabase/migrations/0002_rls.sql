-- Phase 5 — Row Level Security
--
-- Public visitors (role `anon`) may read only published, parent-published
-- content plus active suburb references, and may create enquiries and nothing
-- else. Private tables have no anon policy at all, and no authenticated
-- policy exists in this phase — admin authorisation is deliberately reserved
-- for Phase 6 once real user accounts and roles exist.

-- ======================================================================
-- Enable RLS everywhere
-- ======================================================================
alter table public.properties                  enable row level security;
alter table public.property_private_locations  enable row level security;
alter table public.property_location_settings  enable row level security;
alter table public.property_public_locations   enable row level security;
alter table public.suburb_references           enable row level security;
alter table public.property_images             enable row level security;
alter table public.property_features           enable row level security;
alter table public.construction_updates        enable row level security;
alter table public.property_resources          enable row level security;
alter table public.property_testimonials       enable row level security;
alter table public.enquiries                   enable row level security;

-- ======================================================================
-- Public catalogue read policies
-- ======================================================================

-- Properties themselves.
create policy "public read published properties"
  on public.properties for select
  to anon
  using (is_published);

-- Generated public location projections for published properties only.
create policy "public read public locations of published properties"
  on public.property_public_locations for select
  to anon
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_public_locations.property_id
        and p.is_published
    )
  );

-- Oneman suburb reference is itself public data, gated on is_active.
create policy "public read active suburb references"
  on public.suburb_references for select
  to anon
  using (is_active);

-- Child records: row must be published AND its parent property must be
-- published — never trust the child flag on its own.
create policy "public read published images of published properties"
  on public.property_images for select
  to anon
  using (
    is_published
    and exists (
      select 1 from public.properties p
      where p.id = property_images.property_id
        and p.is_published
    )
  );

create policy "public read published features of published properties"
  on public.property_features for select
  to anon
  using (
    is_published
    and exists (
      select 1 from public.properties p
      where p.id = property_features.property_id
        and p.is_published
    )
  );

create policy "public read published build updates of published properties"
  on public.construction_updates for select
  to anon
  using (
    is_published
    and exists (
      select 1 from public.properties p
      where p.id = construction_updates.property_id
        and p.is_published
    )
  );

create policy "public read published resources of published properties"
  on public.property_resources for select
  to anon
  using (
    is_published
    and exists (
      select 1 from public.properties p
      where p.id = property_resources.property_id
        and p.is_published
    )
  );

create policy "public read published testimonials of published properties"
  on public.property_testimonials for select
  to anon
  using (
    is_published
    and exists (
      select 1 from public.properties p
      where p.id = property_testimonials.property_id
        and p.is_published
    )
  );

-- ======================================================================
-- Enquiries: anonymous insert only, nothing else
-- ======================================================================
create policy "anyone may create an enquiry"
  on public.enquiries for insert
  to anon
  with check (
    status = 'new'
    and property_id is null
       or exists (
         select 1 from public.properties p
         where p.id = enquiries.property_id
           and p.is_published
       )
  );

-- No `select`, `update` or `delete` policy for anon: those operations fail
-- under RLS without one, which is exactly the intended behaviour.

-- ======================================================================
-- The same public read policies also apply to `authenticated`
-- ======================================================================
-- Logged-in non-admin users see exactly the same catalogue. Admin access
-- arrives with Phase 6 roles.
create policy "signed-in read published properties"
  on public.properties for select
  to authenticated
  using (is_published);

create policy "signed-in read public locations of published properties"
  on public.property_public_locations for select
  to authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_public_locations.property_id
        and p.is_published
    )
  );

create policy "signed-in read active suburb references"
  on public.suburb_references for select
  to authenticated
  using (is_active);

create policy "signed-in read published images of published properties"
  on public.property_images for select
  to authenticated
  using (
    is_published
    and exists (
      select 1 from public.properties p
      where p.id = property_images.property_id
        and p.is_published
    )
  );

create policy "signed-in read published features of published properties"
  on public.property_features for select
  to authenticated
  using (
    is_published
    and exists (
      select 1 from public.properties p
      where p.id = property_features.property_id
        and p.is_published
    )
  );

create policy "signed-in read published build updates of published properties"
  on public.construction_updates for select
  to authenticated
  using (
    is_published
    and exists (
      select 1 from public.properties p
      where p.id = construction_updates.property_id
        and p.is_published
    )
  );

create policy "signed-in read published resources of published properties"
  on public.property_resources for select
  to authenticated
  using (
    is_published
    and exists (
      select 1 from public.properties p
      where p.id = property_resources.property_id
        and p.is_published
    )
  );

create policy "signed-in read published testimonials of published properties"
  on public.property_testimonials for select
  to authenticated
  using (
    is_published
    and exists (
      select 1 from public.properties p
      where p.id = property_testimonials.property_id
        and p.is_published
    )
  );

create policy "signed-in users may create an enquiry"
  on public.enquiries for insert
  to authenticated
  with check (
    status = 'new'
    and property_id is null
       or exists (
         select 1 from public.properties p
         where p.id = enquiries.property_id
           and p.is_published
       )
  );
