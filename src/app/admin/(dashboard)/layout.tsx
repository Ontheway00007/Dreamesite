import { requireAdmin } from "@/lib/admin/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";

/**
 * Authenticated admin layout with sidebar navigation.
 *
 * `requireAdmin()` runs on every request — if the user is not authenticated
 * or is not an active admin, they are redirected before any content renders.
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-screen bg-[var(--color-background)]">
      <AdminSidebar currentUser={admin} />
      <div className="flex flex-1 flex-col lg:pl-64">
        <AdminHeader currentUser={admin} />
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
