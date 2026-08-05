import "server-only";

import { createHash } from "node:crypto";

/**
 * Pure helpers for the login flow.
 *
 * Separated from the Server Action so each piece can be tested without a
 * database, a request or a Supabase project. The action is the part that cannot
 * be unit-tested; everything decidable is decided here.
 */

/**
 * The one message every rejected login receives.
 *
 * Wrong password, no such account, correct password for somebody who is not an
 * administrator, correct password for a deactivated administrator — all four get
 * this sentence, because distinguishing them is exactly how an attacker learns
 * which addresses are worth attacking.
 *
 * The previous implementation returned "Invalid email or password" for a bad
 * password and "You do not have administrator access" for a valid credential
 * belonging to a non-administrator. The second message confirmed both that the
 * account existed and that the password was right.
 *
 * The real reason is recorded in `admin_login_attempts` and the server log.
 */
export const NEUTRAL_LOGIN_FAILURE =
  "Those sign-in details are not correct, or that account cannot sign in here.";

/**
 * Shown when the failure is ours rather than theirs.
 *
 * Distinguished from the neutral message on purpose: telling somebody their
 * password is wrong when the database is unreachable sends them to reset a
 * password that was fine. It reveals nothing about any account — only that the
 * service is unwell, which they can already see.
 */
export const SERVICE_UNAVAILABLE_MESSAGE =
  "We cannot sign you in right now. Please try again in a moment.";

/** Internal reason codes. Mirrors the CHECK on `admin_login_attempts.reason`. */
export type LoginFailureReason =
  | "bad_credentials"
  | "not_admin"
  | "inactive_admin"
  | "throttled"
  | "captcha_failed"
  | "service_error";

/**
 * Salted hash of a client address.
 *
 * Throttling needs to recognise a repeat client, not to know where it is. A hash
 * does the first without the second, so the address itself is never stored.
 *
 * The salt matters: an unsalted hash of an IPv4 address is reversible in seconds
 * by hashing all four billion of them. `LOGIN_HASH_SALT` is server-only. Without
 * it the function returns null and per-address throttling is skipped rather than
 * done badly — per-email throttling still applies, and `docs/operations.md` says
 * to set the salt.
 */
export function hashClientAddress(address: string | null): string | null {
  const salt = process.env.LOGIN_HASH_SALT?.trim();

  if (!address || !salt) {
    return null;
  }

  return createHash("sha256").update(`${salt}:${address}`).digest("hex");
}

/**
 * The client address from proxy headers.
 *
 * `x-forwarded-for` is a client-supplied header and can be forged. On Vercel it
 * is rewritten by the platform, so the *first* entry is trustworthy there;
 * elsewhere it may not be. That is acceptable for this use: a forged address
 * weakens per-address throttling for the forger and cannot affect anybody else's
 * count, because per-email throttling is independent of it.
 */
export function clientAddressFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();

    if (first) return first;
  }

  return headers.get("x-real-ip")?.trim() ?? null;
}

/**
 * Where to send an administrator after signing in.
 *
 * Open-redirect prevention. A `next` parameter is attacker-controlled: a link to
 * `/admin/login?next=https://evil.example` would, without this, bounce a freshly
 * authenticated administrator to a page that looks like the dashboard and asks
 * for their password again.
 *
 * The rules are deliberately narrow — an allow-list of shape rather than a
 * block-list of tricks:
 *
 * - must begin with a single `/`, so no absolute URL and no scheme
 * - `//host` is rejected, which a browser treats as protocol-relative
 * - `\` is rejected, which some browsers normalise to `/`
 * - must be under `/admin`, because that is the only place this redirect goes
 *
 * Anything else falls back to `/admin`. Failing closed costs a redirect;
 * failing open costs a credential.
 */
export function safeRedirectTarget(next: string | null | undefined): string {
  const fallback = "/admin";

  if (!next) return fallback;

  const candidate = next.trim();

  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//")) return fallback;
  if (candidate.includes("\\")) return fallback;
  // A control character can truncate a header or confuse a parser.
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback;

  // `/adminsomething` must not pass a naive prefix test.
  if (candidate !== "/admin" && !candidate.startsWith("/admin/")) {
    return fallback;
  }

  // The login page itself would loop.
  if (candidate.startsWith("/admin/login")) return fallback;

  return candidate;
}

/* ---------------------------------------------------------------------- */
/* Turnstile                                                              */
/* ---------------------------------------------------------------------- */

/**
 * Whether a challenge can be presented at all.
 *
 * Both keys, or neither. A site key with no secret key renders a widget whose
 * response nothing verifies, which is worse than no challenge because it looks
 * like one.
 */
export function isTurnstileConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() &&
      process.env.TURNSTILE_SECRET_KEY?.trim(),
  );
}

/**
 * Whether a missing or invalid challenge must block the attempt.
 *
 * The tension: local development should not need a Cloudflare account, and
 * production must not silently skip the challenge because somebody forgot to set
 * a variable.
 *
 * Resolved by making the *deployment* decide, not the configuration. In a
 * production deployment the challenge is required once the throttle asks for it,
 * and unconfigured keys are a startup problem to be fixed rather than a check to
 * be skipped. Anywhere else, an unconfigured challenge is skipped so the login
 * form works out of the box.
 */
export function isTurnstileEnforced(): boolean {
  if (isTurnstileConfigured()) {
    return true;
  }

  return process.env.VERCEL_ENV === "production" ||
    process.env.DEPLOYMENT_ENV === "production";
}

export interface TurnstileOutcome {
  readonly ok: boolean;
  /** Cloudflare's codes, for the server log. Never shown to the visitor. */
  readonly errorCodes?: readonly string[];
}

/**
 * Verifies a Turnstile token with Cloudflare.
 *
 * Fails closed on a network error. An unreachable verifier during a run of
 * failed logins is precisely when the challenge matters, so "we could not check"
 * is treated as "not verified" — the visitor is told the service is unavailable
 * rather than being let through.
 */
export async function verifyTurnstile(
  token: string | null,
  remoteAddress: string | null,
): Promise<TurnstileOutcome> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();

  if (!secret) {
    // Caller decides whether that is allowed — see `isTurnstileEnforced`.
    return { ok: false, errorCodes: ["not-configured"] };
  }

  if (!token) {
    return { ok: false, errorCodes: ["missing-input-response"] };
  }

  const body = new URLSearchParams({ secret, response: token });

  if (remoteAddress) {
    body.set("remoteip", remoteAddress);
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        // A hung verifier must not hang the login request.
        signal: AbortSignal.timeout(5000),
      },
    );

    const result = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    return {
      ok: result.success === true,
      errorCodes: result["error-codes"],
    };
  } catch {
    return { ok: false, errorCodes: ["verification-unreachable"] };
  }
}
