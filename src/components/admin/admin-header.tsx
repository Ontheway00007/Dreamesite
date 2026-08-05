"use client";

import { useTransition } from "react";

import { logoutAction } from "@/lib/admin/actions/auth-actions";
import type { AdminUser } from "@/lib/admin/auth";

export function AdminHeader({ currentUser }: { currentUser: AdminUser }) {
  const [isPending, startTransition] = useTransition();

  return (
    <header className="border-border bg-surface/80 sticky top-0 z-30 flex h-16 items-center justify-between border-b px-6 backdrop-blur-sm lg:px-8">
      {/* Mobile brand (visible on small screens where sidebar is hidden) */}
      <div className="flex items-center gap-2 lg:hidden">
        <span className="font-display text-foreground text-lg">Dreame</span>
        <span className="text-foreground-subtle text-xs font-medium uppercase tracking-wider">
          Admin
        </span>
      </div>

      {/* Spacer for desktop (sidebar is showing brand) */}
      <div className="hidden lg:block" />

      {/* Actions */}
      <div className="flex items-center gap-4">
        <span className="text-foreground-muted hidden text-sm sm:block">
          {currentUser.email}
        </span>
        <form
          action={() => {
            startTransition(() => {
              logoutAction();
            });
          }}
        >
          <button
            type="submit"
            disabled={isPending}
            className="text-foreground-muted hover:text-foreground rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {isPending ? "Signing out..." : "Sign out"}
          </button>
        </form>
      </div>
    </header>
  );
}
