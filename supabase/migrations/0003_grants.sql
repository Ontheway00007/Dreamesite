-- Phase 5 — Data API grants
--
-- RLS decides *who may see what*; grants decide *which roles may talk to
-- which table at all*. Every table keeps RLS enabled as defence in depth —
-- these grants are deliberately the minimum each role needs.

-- ======================================================================
-- Public catalogue: anon and authenticated read
-- ======================================================================

-- Default PostgREST setup already grants select on new public tables. The
-- revokes below re-assert the intent against any permissive defaults a
-- future migration might introduce.
revoke all on public.properties                 from anon;
revoke all on public.property_public_locations  from anon;
revoke all on public.suburb_references          from anon;
revoke all on public.property_images            from anon;
revoke all on public.property_features          from anon;
revoke all on public.construction_updates       from anon;
revoke all on public.property_resources         from anon;
revoke all on public.property_testimonials      from anon;
revoke all on public.enquiries                  from anon;

grant select on public.properties                 to anon;
grant select on public.property_public_locations  to anon;
grant select on public.suburb_references          to anon;
grant select on public.property_images            to anon;
grant select on public.property_features          to anon;
grant select on public.construction_updates       to anon;
grant select on public.property_resources         to anon;
grant select on public.property_testimonials      to anon;
grant insert on public.enquiries                  to anon;

grant select on public.properties                 to authenticated;
grant select on public.property_public_locations  to authenticated;
grant select on public.suburb_references          to authenticated;
grant select on public.property_images            to authenticated;
grant select on public.property_features          to authenticated;
grant select on public.construction_updates       to authenticated;
grant select on public.property_resources         to authenticated;
grant select on public.property_testimonials      to authenticated;
grant insert on public.enquiries                  to authenticated;

-- ======================================================================
-- Private tables: nothing for the browser-facing roles
-- ======================================================================

-- Written only by server-side code using the service key (or a future admin
-- session with its own Phase 6 policies).
revoke all on public.property_private_locations from anon;
revoke all on public.property_private_locations from authenticated;
revoke all on public.property_location_settings from anon;
revoke all on public.property_location_settings from authenticated;

-- The service role bypasses RLS by design, so its access is implicit. No
-- grant needed here for the public-location generator: it runs server-side
-- with the service key.
