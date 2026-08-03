-- Phase 5 — Storage
--
-- Public marketing media bucket. Anonymous visitors may read assets but
-- never write. Admin uploads are Phase 6 and will arrive with their own
-- authenticated policies once admin roles exist.

-- The bucket itself. Public buckets are world-readable by design; the read
-- policy below stays as defence in depth should the bucket ever be switched
-- to private by mistake.
insert into storage.buckets (id, name, public)
values ('property-media', 'property-media', true)
on conflict (id) do nothing;

-- Public read of anything inside property-media. A public bucket does not
-- strictly need the policy, but keeping one means a flip to `public =
-- false` degrades to "deny by default" instead of silently opening reads
-- with no audit trail.
create policy "public read property media"
  on storage.objects for select
  to anon
  using (bucket_id = 'property-media');

create policy "signed-in read property media"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'property-media');

-- No insert/update/delete policies for anon or authenticated in this phase.
-- Storage is default-deny for writes, so uploads are Phase 6 territory.
