import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeRedirectTarget } from "@/lib/admin/login-security";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminUsersRow } from "@/types/database";

/**
 * Admin authentication and authorization utilities.
 *
 * Authorization is ALWAYS verified server-side by checking the admin_users
 * table. Browser claims, user_metadata, and JWT custom claims are never
 * trusted for authorization decisions.
 */

export interface AdminUser {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly role: "admin" | "super_admin";
  readonly isActive: boolean;
}

function toAdminUser(row: AdminUsersRow): AdminUser {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active,
  };
}

/**
 * Verifies the current user is an authenticated administrator.
 *
 * Returns the admin user record if authorized, otherwise redirects
 * to the login page. Use this in Server Components and Server Actions
 * that require admin access.
 */
/**
 * Where to return after signing in.
 *
 * The pathname comes from a header the proxy sets, and is passed through
 * the same validation the login action uses before it ever reaches a URL. An
 * unvalidated round trip through `?next=` is how an open redirect appears.
 */
async function loginUrlForCurrentPage(): Promise<string> {
  try {
    const pathname = (await headers()).get("x-pathname");
    const target = safeRedirectTarget(pathname);

    return target === "/admin"
      ? "/admin/login"
      : `/admin/login?next=${encodeURIComponent(target)}`;
  } catch {
    // `headers()` is unavailable in some contexts; the plain login page is a
    // correct answer, just a less convenient one.
    return "/admin/login";
  }
}

export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createAdminClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(await loginUrlForCurrentPage());
  }

  // Verify admin status from the admin_users table — never trust claims
  const { data, error: adminError } = await supabase
    .from("admin_users")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (adminError || !data) {
    redirect("/admin/unauthorized");
  }

  return toAdminUser(data as unknown as AdminUsersRow);
}

/**
 * Checks if the current user is authenticated (without redirecting).
 * Returns the admin record or null.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const supabase = await createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("admin_users")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!data) {
    return null;
  }

  return toAdminUser(data as unknown as AdminUsersRow);
}

/**
 * Verifies the current user is a super_admin. Redirects otherwise.
 */
export async function requireSuperAdmin(): Promise<AdminUser> {
  const admin = await requireAdmin();

  if (admin.role !== "super_admin") {
    redirect("/admin/unauthorized");
  }

  return admin;
}
