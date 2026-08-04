import { requireAdmin } from "@/lib/admin/auth";

export const metadata = {
  title: "Dashboard",
};

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-heading-2 font-display text-foreground">
          Dashboard
        </h1>
        <p className="text-foreground-muted mt-1">
          Welcome back, {admin.displayName ?? admin.email}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard title="Properties" href="/admin/properties" />
        <DashboardCard title="Enquiries" href="/admin/enquiries" />
        <DashboardCard title="Media" href="/admin/media" />
        <DashboardCard title="Settings" href="/admin/settings" />
      </div>
    </div>
  );
}

function DashboardCard({ title, href }: { title: string; href: string }) {
  return (
    <a
      href={href}
      className="bg-surface hover:bg-surface-raised border-border group block rounded-xl border p-6 transition-colors"
    >
      <h2 className="text-foreground group-hover:text-accent text-lg font-medium transition-colors">
        {title}
      </h2>
      <p className="text-foreground-subtle mt-1 text-sm">
        Manage {title.toLowerCase()}
      </p>
    </a>
  );
}
