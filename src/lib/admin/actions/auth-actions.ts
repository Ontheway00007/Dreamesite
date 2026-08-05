"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { callRpc } from "@/lib/admin/rpc";
import {
  NEUTRAL_LOGIN_FAILURE,
  SERVICE_UNAVAILABLE_MESSAGE,
  clientAddressFrom,
  hashClientAddress,
  isTurnstileEnforced,
  safeRedirectTarget,
  verifyTurnstile,
  type LoginFailureReason,
} from "@/lib/admin/login-security";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Authentication Server Actions.
 *
 * Supabase Auth email/password. No public registration: administrators are
 * provisioned by inserting an `admin_users` row against an existing auth user.
 *
 * ## The order of operations, and why it is this order
 *
 * 1. **Throttle check, before credentials are touched.** A blocked identifier
 *    must not get a password verified for it, because the timing difference
 *    between "checked and wrong" and "not checked" is itself a signal.
 * 2. **Challenge, if the throttle asks for one.** After a few failures, before
 *    more guesses.
 * 3. **Credentials.**
 * 4. **Administrator status**, from `admin_users` — never from a JWT claim.
 * 5. **Record the attempt**, whatever happened.
 *
 * ## One message
 *
 * Every rejection returns `NEUTRAL_LOGIN_FAILURE`. The real reason goes to the
 * attempt log and the server log. A service failure is the one exception, and it
 * says nothing about any account.
 *
 * ## What is never recorded
 *
 * No password, anywhere — not in the log, not in the attempt row, not in an
 * error object. The attempt row holds the submitted email, a salted hash of the
 * client address, and a reason code from a closed vocabulary.
 */

export interface AuthActionResult {
  readonly error?: string;
  /** True when the form should present a challenge on the next attempt. */
  readonly requiresCaptcha?: boolean;
  /** Seconds until a blocked identifier may try again, when it is blocked. */
  readonly retryAfterSeconds?: number;
}

interface ThrottleDecision {
  allowed: boolean;
  requires_captcha: boolean;
  retry_after_seconds: number;
  recent_failures: number;
}

/**
 * Records an attempt without ever failing the request.
 *
 * A login must not be refused because the audit write failed, and it must not
 * *succeed* silently either — so a failure here is logged loudly and the caller
 * carries on. The alternative, awaiting a write that can fail, turns a
 * bookkeeping problem into an outage.
 */
async function recordAttempt(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  email: string,
  ipHash: string | null,
  succeeded: boolean,
  reason: LoginFailureReason | null,
): Promise<void> {
  const { error } = await callRpc(supabase, "record_login_attempt", {
    p_email: email,
    p_ip_hash: ipHash,
    p_succeeded: succeeded,
    p_reason: reason,
  });

  if (error) {
    console.error("[auth] Could not record a login attempt", {
      code: error.code,
      message: error.message,
      succeeded,
      reason,
    });
  }
}

/** Structured, and deliberately free of the email and every credential. */
function logFailure(reason: LoginFailureReason, detail?: Record<string, unknown>) {
  console.warn("[auth] Login rejected", { reason, ...detail });
}

export async function loginAction(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const captchaToken = formData.get("cf-turnstile-response");
  const requestedNext = String(formData.get("next") ?? "");

  if (!email || !password) {
    // Not recorded: no identifier was supplied, so there is nothing to throttle
    // and nothing an attacker learns from the response.
    return { error: "Enter your email address and password." };
  }

  const requestHeaders = await headers();
  const address = clientAddressFrom(requestHeaders);
  const ipHash = hashClientAddress(address);

  let supabase: Awaited<ReturnType<typeof createAdminClient>>;

  try {
    supabase = await createAdminClient();
  } catch (cause) {
    // Supabase is not configured. Nothing to throttle against and nothing to
    // record — say the service is unavailable, because it is.
    console.error("[auth] Supabase client unavailable", cause);
    return { error: SERVICE_UNAVAILABLE_MESSAGE };
  }

  /* --- 1. Throttle ---------------------------------------------------- */

  const { data: throttleRows, error: throttleError } = await callRpc(
    supabase,
    "check_login_throttle",
    { p_email: email, p_ip_hash: ipHash },
  );

  if (throttleError) {
    // Fail closed. If the throttle cannot be consulted, an attacker must not
    // get unlimited attempts as a consequence.
    console.error("[auth] Throttle check failed", {
      code: throttleError.code,
      message: throttleError.message,
    });

    return { error: SERVICE_UNAVAILABLE_MESSAGE };
  }

  const throttle: ThrottleDecision = throttleRows?.[0] ?? {
    allowed: true,
    requires_captcha: false,
    retry_after_seconds: 0,
    recent_failures: 0,
  };

  if (!throttle.allowed) {
    logFailure("throttled", { recentFailures: throttle.recent_failures });
    await recordAttempt(supabase, email, ipHash, false, "throttled");

    // The one case with a specific message. It reveals nothing about the
    // account — only that this client has failed repeatedly, which they know.
    const minutes = Math.ceil(throttle.retry_after_seconds / 60);

    return {
      error: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      retryAfterSeconds: throttle.retry_after_seconds,
      requiresCaptcha: true,
    };
  }

  /* --- 2. Challenge --------------------------------------------------- */

  if (throttle.requires_captcha && isTurnstileEnforced()) {
    const outcome = await verifyTurnstile(
      typeof captchaToken === "string" ? captchaToken : null,
      address,
    );

    if (!outcome.ok) {
      logFailure("captcha_failed", { errorCodes: outcome.errorCodes });
      await recordAttempt(supabase, email, ipHash, false, "captcha_failed");

      return {
        error: "Complete the verification challenge and try again.",
        requiresCaptcha: true,
      };
    }
  }

  /* --- 3. Credentials ------------------------------------------------- */

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    /*
      Supabase does not distinguish "no such user" from "wrong password" here,
      and that is the behaviour we want. A 5xx from Supabase is a different
      thing, though: reporting it as bad credentials would send an
      administrator to reset a password that was never wrong.
    */
    const isServiceFailure = (signInError.status ?? 0) >= 500;
    const reason: LoginFailureReason = isServiceFailure
      ? "service_error"
      : "bad_credentials";

    logFailure(reason, { status: signInError.status, code: signInError.code });
    await recordAttempt(supabase, email, ipHash, false, reason);

    return {
      error: isServiceFailure ? SERVICE_UNAVAILABLE_MESSAGE : NEUTRAL_LOGIN_FAILURE,
      requiresCaptcha: throttle.recent_failures + 1 >= 3,
    };
  }

  /* --- 4. Administrator status ---------------------------------------- */

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logFailure("service_error", { at: "getUser" });
    await recordAttempt(supabase, email, ipHash, false, "service_error");

    return { error: SERVICE_UNAVAILABLE_MESSAGE };
  }

  // `is_active` is read rather than filtered on, so a deactivated administrator
  // can be told apart from a non-administrator *in the log* while both see the
  // same message.
  const { data: adminRow, error: adminError } = await supabase
    .from("admin_users")
    .select("id, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) {
    logFailure("service_error", { at: "admin_users", code: adminError.code });
    await recordAttempt(supabase, email, ipHash, false, "service_error");
    await supabase.auth.signOut();

    return { error: SERVICE_UNAVAILABLE_MESSAGE };
  }

  const admin = adminRow as unknown as { id: string; is_active: boolean } | null;

  if (!admin || !admin.is_active) {
    /*
      The credentials were correct, so a session now exists. Discarding it is the
      important part: without this, somebody with a valid non-administrator
      account holds a Supabase session for the project after being told they
      cannot sign in.
    */
    await supabase.auth.signOut();

    const reason: LoginFailureReason = admin ? "inactive_admin" : "not_admin";

    logFailure(reason, { userId: user.id });
    await recordAttempt(supabase, email, ipHash, false, reason);

    // Same sentence as a wrong password. This is the enumeration fix.
    return { error: NEUTRAL_LOGIN_FAILURE };
  }

  /* --- 5. Success ----------------------------------------------------- */

  await recordAttempt(supabase, email, ipHash, true, null);

  revalidatePath("/admin", "layout");

  // Validated against an allow-list of shape — see `safeRedirectTarget`.
  redirect(safeRedirectTarget(requestedNext));
}

export async function logoutAction(): Promise<never> {
  const supabase = await createAdminClient();

  /*
    `scope: "global"` revokes every refresh token for the user, not just this
    browser's. The default, `local`, leaves other sessions signed in — which is
    the wrong default for an administrator who is signing out because they think
    something is wrong.

    The cookie is cleared either way; this makes the server-side session
    unusable too, so a stolen refresh token stops working.
  */
  const { error } = await supabase.auth.signOut({ scope: "global" });

  if (error) {
    // The cookie is still cleared by the client below, so the administrator is
    // signed out locally regardless. Logged because a failure here means a
    // refresh token may remain valid.
    console.error("[auth] Sign-out did not complete cleanly", {
      code: error.code,
      status: error.status,
    });
  }

  revalidatePath("/admin", "layout");
  redirect("/admin/login");
}
