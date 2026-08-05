-- Phase 6 — Admin CRUD policies
--
-- Adds administrator write access to all tables via RLS policies.
-- Uses public.is_admin() to verify admin status.
-- Anonymous and non-admin authenticated users still see only published data.

-- ======================================================================
-- 1. properties — admin full CRUD
-- ======================================================================
create policy "admins can read all properties"
  on public.properties for select
  to authenticated
  using (public.is_admin());

create policy "admins can insert properties"
  on public.properties for insert
  to authenticated
  with check (public.is_admin());

create policy "admins can update properties"
  on public.properties for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete properties"
  on public.properties for delete
  to authenticated
  using (public.is_admin());

-- ======================================================================
-- 2. property_private_locations — admin only
-- ======================================================================
create policy "admins can read private locations"
  on public.property_private_locations for select
  to authenticated
  using (public.is_admin());

create policy "admins can insert private locations"
  on public.property_private_locations for insert
  to authenticated
  with check (public.is_admin());

create policy "admins can update private locations"
  on public.property_private_locations for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete private locations"
  on public.property_private_locations for delete
  to authenticated
  using (public.is_admin());

-- ======================================================================
-- 3. property_location_settings — admin only
-- ======================================================================
create policy "admins can read location settings"
  on public.property_location_settings for select
  to authenticated
  using (public.is_admin());

create policy "admins can insert location settings"
  on public.property_location_settings for insert
  to authenticated
  with check (public.is_admin());

create policy "admins can update location settings"
  on public.property_location_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete location settings"
  on public.property_location_settings for delete
  to authenticated
  using (public.is_admin());

-- ======================================================================
-- 4. property_public_locations — admin write (for projection upserts)
-- ======================================================================
create policy "admins can read all public locations"
  on public.property_public_locations for select
  to authenticated
  using (public.is_admin());

create policy "admins can insert public locations"
  on public.property_public_locations for insert
  to authenticated
  with check (public.is_admin());

create policy "admins can update public locations"
  on public.property_public_locations for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete public locations"
  on public.property_public_locations for delete
  to authenticated
  using (public.is_admin());

-- ======================================================================
-- 5. suburb_references — admin CRUD
-- ======================================================================
create policy "admins can read all suburb references"
  on public.suburb_references for select
  to authenticated
  using (public.is_admin());

create policy "admins can insert suburb references"
  on public.suburb_references for insert
  to authenticated
  with check (public.is_admin());

create policy "admins can update suburb references"
  on public.suburb_references for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete suburb references"
  on public.suburb_references for delete
  to authenticated
  using (public.is_admin());

-- ======================================================================
-- 6. property_images — admin CRUD
-- ======================================================================
create policy "admins can read all images"
  on public.property_images for select
  to authenticated
  using (public.is_admin());

create policy "admins can insert images"
  on public.property_images for insert
  to authenticated
  with check (public.is_admin());

create policy "admins can update images"
  on public.property_images for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete images"
  on public.property_images for delete
  to authenticated
  using (public.is_admin());

-- ======================================================================
-- 7. property_features — admin CRUD
-- ======================================================================
create policy "admins can read all features"
  on public.property_features for select
  to authenticated
  using (public.is_admin());

create policy "admins can insert features"
  on public.property_features for insert
  to authenticated
  with check (public.is_admin());

create policy "admins can update features"
  on public.property_features for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete features"
  on public.property_features for delete
  to authenticated
  using (public.is_admin());

-- ======================================================================
-- 8. construction_updates — admin CRUD
-- ======================================================================
create policy "admins can read all construction updates"
  on public.construction_updates for select
  to authenticated
  using (public.is_admin());

create policy "admins can insert construction updates"
  on public.construction_updates for insert
  to authenticated
  with check (public.is_admin());

create policy "admins can update construction updates"
  on public.construction_updates for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete construction updates"
  on public.construction_updates for delete
  to authenticated
  using (public.is_admin());

-- ======================================================================
-- 9. property_resources — admin CRUD
-- ======================================================================
create policy "admins can read all resources"
  on public.property_resources for select
  to authenticated
  using (public.is_admin());

create policy "admins can insert resources"
  on public.property_resources for insert
  to authenticated
  with check (public.is_admin());

create policy "admins can update resources"
  on public.property_resources for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete resources"
  on public.property_resources for delete
  to authenticated
  using (public.is_admin());

-- ======================================================================
-- 10. property_testimonials — admin CRUD
-- ======================================================================
create policy "admins can read all testimonials"
  on public.property_testimonials for select
  to authenticated
  using (public.is_admin());

create policy "admins can insert testimonials"
  on public.property_testimonials for insert
  to authenticated
  with check (public.is_admin());

create policy "admins can update testimonials"
  on public.property_testimonials for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete testimonials"
  on public.property_testimonials for delete
  to authenticated
  using (public.is_admin());

-- ======================================================================
-- 11. enquiries — admin read/update (never delete from UI)
-- ======================================================================
create policy "admins can read all enquiries"
  on public.enquiries for select
  to authenticated
  using (public.is_admin());

create policy "admins can update enquiries"
  on public.enquiries for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ======================================================================
-- 12. Grants — authenticated role needs table access for admin operations
-- ======================================================================

-- Private tables now accessible to authenticated (RLS still controls access)
grant select, insert, update, delete on public.property_private_locations to authenticated;
grant select, insert, update, delete on public.property_location_settings to authenticated;

-- Public tables need write grants for authenticated admins
grant insert, update, delete on public.properties to authenticated;
grant insert, update, delete on public.property_public_locations to authenticated;
grant insert, update, delete on public.suburb_references to authenticated;
grant insert, update, delete on public.property_images to authenticated;
grant insert, update, delete on public.property_features to authenticated;
grant insert, update, delete on public.construction_updates to authenticated;
grant insert, update, delete on public.property_resources to authenticated;
grant insert, update, delete on public.property_testimonials to authenticated;
grant select, update on public.enquiries to authenticated;

-- Admin users table
grant select on public.admin_users to authenticated;
grant insert, update, delete on public.admin_users to authenticated;

-- Audit log
grant select, insert on public.audit_log to authenticated;

-- ======================================================================
-- 13. Storage — admin upload policies
-- ======================================================================
create policy "admins can upload property media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'property-media'
    and public.is_admin()
  );

create policy "admins can update property media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'property-media'
    and public.is_admin()
  );

create policy "admins can delete property media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'property-media'
    and public.is_admin()
  );
