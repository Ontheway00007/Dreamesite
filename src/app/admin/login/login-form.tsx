"use client";

import { useActionState } from "react";

import {
  loginAction,
  type AuthActionResult,
} from "@/lib/admin/actions/auth-actions";
import { TurnstileWidget } from "./turnstile-widget";

/**
 * The administrator sign-in form.
 *
 * Two things worth noting.
 *
 * **The challenge appears only when asked for.** The server returns
 * `requiresCaptcha` once the throttle has seen enough failures, and only then is
 * the Turnstile script loaded. A first attempt costs no third-party request.
 *
 * **`next` is submitted, not trusted.** It is echoed from the URL into a hidden
 * field for convenience, and the server validates it against an allow-list of
 * shape before redirecting — see `safeRedirectTarget`. A hidden field is exactly
 * as forgeable as a query parameter, which is why the check is server-side.
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState<
    AuthActionResult | null,
    FormData
  >(async (_previous, formData) => loginAction(formData), null);

  return (
    <form action={formAction} className="space-y-5">
      {/*
        `role="alert"` so the failure is announced rather than only shown. The
        message is the same for every kind of rejection; the reason is in the
        server log.
      */}
      {state?.error && (
        <div
          role="alert"
          className="bg-red-500/10 border-red-500/20 rounded-lg border px-4 py-3 text-sm text-red-400"
        >
          {state.error}
        </div>
      )}

      {next && <input type="hidden" name="next" value={next} />}

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
          autoFocus
          className="bg-surface border-border text-foreground placeholder:text-foreground-subtle focus:border-accent focus:ring-accent/20 block w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
          placeholder="you@example.com"
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

      {state?.requiresCaptcha && <TurnstileWidget />}

      <button
        type="submit"
        disabled={isPending}
        className="bg-accent hover:bg-accent-strong text-foreground-inverse w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
