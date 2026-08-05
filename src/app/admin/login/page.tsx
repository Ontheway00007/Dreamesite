import { redirect } from "next/navigation";

import { getAdminUser } from "@/lib/admin/auth";
import { safeRedirectTarget } from "@/lib/admin/login-security";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Admin Login — Dreame",
  robots: { index: false, follow: false },
};

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const requested = typeof params.next === "string" ? params.next : undefined;

  // Already signed in? Honour the requested destination, validated the same way
  // the login action validates it.
  const admin = await getAdminUser();

  if (admin) {
    redirect(safeRedirectTarget(requested));
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

        <LoginForm next={requested} />
      </div>
    </div>
  );
}
