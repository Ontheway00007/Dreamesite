-- Phase 6 — Admin users and authorization
--
-- Establishes the administrator model. Authorization is determined by the
-- `admin_users` table, NOT by JWT claims or user_metadata. Server code
-- queries this table to verify administrator rights.

-- ======================================================================
-- 1. admin_users — the administrator roster
-- ======================================================================
create table public.admin_users (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  email       text not null,
  display_name text,
  role        text not null default 'admin' check (role in ('admin', 'super_admin')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.admin_users is
  'Administrator roster. Linked to auth.users. Server code verifies membership here — browser claims are never trusted.';
comment on column public.admin_users.role is
  'admin = standard CRUD. super_admin = can manage other admins. Both may edit properties.';

create index admin_users_user_id_idx on public.admin_users (user_id);

-- updated_at trigger
create trigger set_updated_at before update on public.admin_users
  for each row execute function public.set_updated_at();

-- ======================================================================
-- 2. RLS on admin_users
-- ======================================================================
alter table public.admin_users enable row level security;

-- Admins can read the admin roster (needed for admin list UI)
create policy "admins can read admin roster"
  on public.admin_users for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active
    )
  );

-- Only super_admins can insert/update/delete other admins
create policy "super admins can manage admin roster"
  on public.admin_users for all
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active and au.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active and au.role = 'super_admin'
    )
  );

-- No anon access
-- (RLS enabled + no anon policy = denied)

-- ======================================================================
-- 3. Helper function: is_admin()
-- ======================================================================
-- Used by RLS policies to check if the current user is an active admin.
-- Runs as SECURITY DEFINER so it can read admin_users regardless of caller's
-- policies. This avoids infinite recursion in RLS checks.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and is_active
  );
$$;

comment on function public.is_admin() is
  'Returns true if the current authenticated user is an active administrator. Used by RLS policies.';

-- Revoke direct execution from anon — only authenticated users should call this
revoke execute on function public.is_admin() from anon;

-- ======================================================================
-- 4. Audit log table (architecture-ready, future UI)
-- ======================================================================
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  action      text not null check (action in (
    'created', 'updated', 'published', 'unpublished', 'deleted', 'archived'
  )),
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only audit trail. Records admin actions for accountability. No public access.';

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_user_idx on public.audit_log (user_id, created_at desc);

alter table public.audit_log enable row level security;

-- Only admins can read the audit log
create policy "admins can read audit log"
  on public.audit_log for select
  to authenticated
  using (public.is_admin());

-- Only admins can insert audit entries (via server actions)
create policy "admins can insert audit entries"
  on public.audit_log for insert
  to authenticated
  with check (public.is_admin());
