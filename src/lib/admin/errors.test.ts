import { describe, expect, it, vi, afterEach } from "vitest";

import {
  handleAdminError,
  logAdminError,
  toFriendlyError,
} from "@/lib/admin/errors";

/**
 * The guarantee under test: nothing a database produces reaches the browser.
 *
 * A constraint name describes the schema. A PL/pgSQL context line can carry
 * a function body. Neither tells an administrator what to do differently, and
 * both are useful to someone probing the system.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toFriendlyError", () => {
  it("explains a unique violation in terms of the slug", () => {
    const message = toFriendlyError({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "properties_slug_key"',
    });

    expect(message).toContain("already exists");
    // The constraint name must not survive.
    expect(message).not.toContain("properties_slug_key");
    expect(message).not.toContain("duplicate key");
  });

  it("explains a check violation without naming the constraint", () => {
    const message = toFriendlyError({
      code: "23514",
      message:
        'new row for relation "property_location_settings" violates check constraint "approximate_requires_radius"',
    });

    expect(message).toContain("not a valid combination");
    expect(message).not.toContain("approximate_requires_radius");
    expect(message).not.toContain("property_location_settings");
  });

  it("tells the administrator to re-authenticate when RLS refuses", () => {
    const message = toFriendlyError({
      code: "42501",
      message: "new row violates row-level security policy for table \"properties\"",
    });

    expect(message).toContain("permission");
    expect(message).not.toContain("row-level security");
    expect(message).not.toContain("properties");
  });

  it("reports policy recursion as a server misconfiguration", () => {
    // 42P17 is not the administrator's fault and they cannot fix it, so the
    // message points them at someone who can.
    const message = toFriendlyError({
      code: "42P17",
      message: 'infinite recursion detected in policy for relation "admin_users"',
    });

    expect(message).toContain("misconfigured");
    expect(message).not.toContain("admin_users");
    expect(message).not.toContain("recursion");
  });

  it("explains an expired session", () => {
    expect(toFriendlyError({ code: "PGRST301", message: "JWT expired" })).toContain(
      "session has expired",
    );
  });

  it("suggests retrying after a concurrent write", () => {
    expect(toFriendlyError({ code: "40001" })).toContain("same time");
    expect(toFriendlyError({ code: "40P01" })).toContain("same time");
  });

  it("explains a statement timeout", () => {
    expect(toFriendlyError({ code: "57014" })).toContain("too long");
  });

  it("falls back generically for an unrecognised code", () => {
    const message = toFriendlyError({
      code: "XX999",
      message: "some internal detail about the cluster",
    });

    expect(message).toBe(
      "Something went wrong saving your changes. Please try again.",
    );
    expect(message).not.toContain("cluster");
  });

  it("uses the caller's fallback when given one", () => {
    expect(
      toFriendlyError({ code: "XX999" }, "Could not publish this property."),
    ).toBe("Could not publish this property.");
  });

  /* --- Messages we author ourselves ------------------------------------ */

  it("passes our own raised messages through", () => {
    // These are written for an administrator already.
    expect(toFriendlyError({ message: "Administrator access is required." })).toBe(
      "Administrator access is required.",
    );
    expect(toFriendlyError({ message: "That property no longer exists." })).toBe(
      "That property no longer exists.",
    );
    expect(
      toFriendlyError({
        message: "You cannot remove your own administrator access.",
      }),
    ).toBe("You cannot remove your own administrator access.");
  });

  it("strips the PL/pgSQL prefix before matching", () => {
    expect(
      toFriendlyError({ message: "ERROR: Administrator access is required." }),
    ).toBe("Administrator access is required.");
  });

  it("does not pass through a message merely containing our text", () => {
    // Only a prefix match counts, so a database message that happens to
    // quote our wording cannot smuggle its own detail out with it.
    const message = toFriendlyError({
      message:
        'relation "x" does not exist: That property no longer exists. CONTEXT: PL/pgSQL',
    });

    expect(message).not.toContain("CONTEXT");
    expect(message).not.toContain("relation");
  });

  /* --- Shapes that are not errors -------------------------------------- */

  it("handles null, undefined, strings and odd values", () => {
    const fallback = "Something went wrong saving your changes. Please try again.";

    expect(toFriendlyError(null)).toBe(fallback);
    expect(toFriendlyError(undefined)).toBe(fallback);
    expect(toFriendlyError(123)).toBe(fallback);
    expect(toFriendlyError([])).toBe(fallback);
    expect(toFriendlyError("a bare string")).toBe(fallback);
  });

  it("handles a thrown Error instance", () => {
    expect(toFriendlyError(new Error("stack-carrying internal message"))).toBe(
      "Something went wrong saving your changes. Please try again.",
    );
  });
});

describe("logAdminError", () => {
  it("records the full detail server-side", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logAdminError("Creating property", {
      code: "23505",
      message: "duplicate key",
      details: "Key (slug)=(x) already exists.",
      hint: null,
    });

    expect(spy).toHaveBeenCalledOnce();

    const [label, payload] = spy.mock.calls[0];

    expect(label).toContain("Creating property");
    // The detail the browser must not see is exactly what the log must keep.
    expect(payload).toMatchObject({
      code: "23505",
      details: "Key (slug)=(x) already exists.",
    });
  });
});

describe("handleAdminError", () => {
  it("logs the detail and returns only the safe message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const message = handleAdminError("Updating property", {
      code: "23505",
      message: 'violates unique constraint "properties_slug_key"',
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(message).not.toContain("properties_slug_key");
    expect(message).toContain("already exists");
  });
});
