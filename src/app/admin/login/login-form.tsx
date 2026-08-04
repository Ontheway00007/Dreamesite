"use client";

import { useActionState } from "react";

import { loginAction, type AuthActionResult } from "@/lib/admin/actions/auth-actions";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    async (_prev, formData) => {
      return loginAction(formData);
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <div className="bg-red-500/10 border-red-500/20 rounded-lg border px-4 py-3 text-sm text-red-400">
          {state.error}
        </div>
      )}

      <div className="space-y-2">
        <label
          htmlFor="email"
          className="text-foreground-muted block text-sm font-medium"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="bg-surface border-border text-foreground placeholder:text-foreground-subtle focus:border-accent focus:ring-accent/20 block w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
          placeholder="admin@dreame.com.au"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="text-foreground-muted block text-sm font-medium"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="bg-surface border-border text-foreground placeholder:text-foreground-subtle focus:border-accent focus:ring-accent/20 block w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-accent hover:bg-accent-strong text-foreground-inverse w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
