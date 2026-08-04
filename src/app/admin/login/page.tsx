import { redirect } from "next/navigation";

import { getAdminUser } from "@/lib/admin/auth";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Admin Login — Dreame",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  // Already authenticated? Go to dashboard.
  const admin = await getAdminUser();
  if (admin) {
    redirect("/admin");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="w-full max-w-sm space-y-8 px-6">
        <div className="text-center">
          <h1 className="font-display text-heading-2 text-foreground">
            Dreame
          </h1>
          <p className="text-foreground-muted mt-2 text-sm">
            Administration
          </p>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
