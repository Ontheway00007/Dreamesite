import { requireAdmin } from "@/lib/admin/auth";
import { getNewEnquiryCount } from "@/lib/admin/enquiry-repository";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";

/**
 * Authenticated admin layout with sidebar navigation.
 *
 * `requireAdmin()` runs on every request — if the user is not authenticated
 * or is not an active admin, they are redirected before any content renders.
 *
 * The unread enquiry count is fetched here rather than on the enquiries page:
 * the point of a badge is to be seen from the pages you are already on. It is a
 * `head`-only count, so it costs one indexed scan and transfers no rows.
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  const newEnquiries = await getNewEnquiryCount();

  return (
    <div className="flex min-h-screen bg-[var(--color-background)]">
      <AdminSidebar currentUser={admin} newEnquiryCount={newEnquiries} />
      <div className="flex flex-1 flex-col lg:pl-64">
        <AdminHeader currentUser={admin} />
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
