-- Phase 5.1 — hardening
--
-- Corrects gaps found in review:
--   * forbidden combinations in the location settings
--   * execute revocation on all internal trigger functions
--   * enquiry input length limits
--   * a regression snapshot for the enquiry INSERT policy precedence fix

-- ======================================================================
-- 1. Stricter privacy-settings integrity
-- ======================================================================

-- An approximate location requires a radius; without one the projection
-- generator would publish nothing sensible.
alter table public.property_location_settings
  add constraint approximate_requires_radius
  check (
    location_visibility <> 'approximate' or privacy_radius_meters is not null
  );

-- Manual markers require manual coordinates.
alter table public.property_location_settings
  add constraint manual_requires_coordinates
  check (
    public_marker_mode <> 'manual'
    or (manual_public_latitude is not null and manual_public_longitude is not null)
  );

-- Hidden means hidden: no public coordinate may be recorded, and directions
-- are never offered.
alter table public.property_public_locations
  add constraint hidden_has_no_coordinate
  check (
    location_visibility <> 'hidden' or public_latitude is null
  );

alter table public.property_public_locations
  add constraint hidden_has_no_directions
  check (
    location_visibility <> 'hidden' or not allow_directions
  );

-- ======================================================================
-- 2. Helper functions: revoke default EXECUTE
-- ======================================================================

-- Trigger functions run only inside a trigger; nothing outside the engine
-- should call them.
revoke execute on function public.set_updated_at() from anon, authenticated;

-- ======================================================================
-- 3. Enquiry input validation
-- ======================================================================

alter table public.enquiries
  add constraint name_length check (length(name) <= 120),
  add constraint message_length check (length(message) <= 4000),
  add constraint phone_format check (
    phone is null or phone ~ '^[0-9+() \-]{6,25}$'
  );

-- ======================================================================
-- 4. Enquiry insert precedence regression guard
-- ======================================================================

-- The two INSERT policies must bind `status = 'new'` to the entire
-- disjunction, not just the left side. This assertion runs at migration
-- time and fails the apply if a future edit reintroduces the precedence bug.
do $$
declare
  policy_body text;
begin
  select pg_get_expr(polqual, polrelid) into policy_body
  from pg_policy
  where polname = 'anyone may create an enquiry'
    and polrelid = 'public.enquiries'::regclass;

  if policy_body is null or policy_body not like '%(property_id IS NULL%' then
    raise exception
      'anonymous enquiry insert policy lost its status/property_id grouping: %',
      policy_body;
  end if;
end $$;
