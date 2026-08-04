import Link from "next/link";

export const metadata = {
  title: "Unauthorized — Dreame Admin",
  robots: { index: false, follow: false },
};

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="max-w-sm space-y-6 px-6 text-center">
        <div className="text-foreground-subtle mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
          <svg
            className="h-8 w-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>

        <h1 className="font-display text-heading-3 text-foreground">
          Access Denied
        </h1>
        <p className="text-foreground-muted text-sm">
          Your account does not have administrator access. If you believe this
          is an error, contact a system administrator.
        </p>

        <Link
          href="/admin/login"
          className="text-accent hover:text-accent-strong inline-block text-sm font-medium transition-colors"
        >
          Return to login
        </Link>
      </div>
    </div>
  );
}
