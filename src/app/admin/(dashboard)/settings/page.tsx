export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-heading-2 font-display text-foreground">Settings</h1>
      <div className="bg-surface border-border rounded-xl border p-8 text-center">
        <p className="text-foreground-muted">
          Admin settings and user management will be available here once the
          invitation system is implemented.
        </p>
      </div>
    </div>
  );
}
