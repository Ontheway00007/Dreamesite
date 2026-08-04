import { describe, expect, it, vi, afterEach } from "vitest";

import {
  handleAdminError,
  logAdminError,
  toFriendlyError,
} from "@/lib/admin/errors";

/**
 * Two guarantees under test.
 *
 * **Nothing a database produces reaches the browser.** A constraint name
 * describes the schema. A PL/pgSQL context line can carry a function body.
 * Neither tells an administrator what to do differently, and both are useful to
 * someone probing the system.
 *
 * **The message describes what actually failed.** One sentence per PostgreSQL
 * code is not enough: `23505` arrives from slugs, heroes and construction
 * stages, and telling someone to check the slug when they duplicated a build
 * stage sends them to the wrong tab.
 */

const GENERIC = "Something went wrong saving your changes. Please try again.";

/** Anything that would identify the schema. Used as a blanket assertion. */
const SCHEMA_LEAKS = [
  "properties_slug_key",
  "construction_updates_one_per_stage",
  "property_images_one_hero_per_property",
  "approximate_requires_radius",
  "property_location_settings",
  "admin_users",
  "duplicate key",
  "relation",
  "row-level security",
  "constraint",
  "pg_",
  "CONTEXT",
  "PL/pgSQL",
];

function expectNoLeaks(message: string) {
  for (const leak of SCHEMA_LEAKS) {
    expect(message).not.toContain(leak);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------------- */
/* Layer 1 — authored messages                                            */
/* ---------------------------------------------------------------------- */

describe("authored messages", () => {
  it("shows a PT422 message exactly as the schema wrote it", () => {
    expect(
      toFriendlyError({
        code: "PT422",
        message: "Publish this image before making it the main image.",
      }),
    ).toBe("Publish this image before making it the main image.");
  });

  it("shows a PT409 stale-state message exactly as written", () => {
    expect(
      toFriendlyError({
        code: "PT409",
        message: "The list changed while you were editing it. Reload and try again.",
      }),
    ).toBe("The list changed while you were editing it. Reload and try again.");
  });

  it("recognises authored messages by code, not by their wording", () => {
    // The point of the change: rewording a message in SQL must not silently
    // stop it being shown.
    expect(
      toFriendlyError({
        code: "PT422",
        message: "Some entirely new sentence nobody has seen before.",
      }),
    ).toBe("Some entirely new sentence nobody has seen before.");
  });

  it("does not trust a familiar sentence that arrives without an authored code", () => {
    // A database message quoting our wording must not smuggle its own detail
    // out alongside it.
    const message = toFriendlyError({
      code: "42P01",
      message:
        'relation "x" does not exist: That property no longer exists. CONTEXT: PL/pgSQL function',
    });

    expect(message).toBe(GENERIC);
    expectNoLeaks(message);
  });
});

/* ---------------------------------------------------------------------- */
/* Layer 2 — recognised constraints                                       */
/* ---------------------------------------------------------------------- */

describe("recognised constraints", () => {
  it("names the slug when the slug index is what failed", () => {
    const message = toFriendlyError({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "properties_slug_key"',
    });

    expect(message).toBe("That slug is already used by another property.");
    expectNoLeaks(message);
  });

  it("does not mention the slug when a construction stage is what failed", () => {
    const message = toFriendlyError({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "construction_updates_one_per_stage"',
    });

    expect(message).toContain("update for that stage");
    expect(message).not.toContain("slug");
    expectNoLeaks(message);
  });

  it("does not mention the slug when a second hero is what failed", () => {
    const message = toFriendlyError({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "property_images_one_hero_per_property"',
    });

    expect(message).toContain("main image");
    expect(message).not.toContain("slug");
    expectNoLeaks(message);
  });

  it("does not mention location when a settings check is what failed", () => {
    const message = toFriendlyError({
      code: "23514",
      message:
        'new row for relation "site_settings" violates check constraint "site_settings_title_length"',
    });

    expect(message).not.toContain("location");
    expect(message).not.toContain("privacy");
    expectNoLeaks(message);
  });

  it("does mention location when a location check is what failed", () => {
    const message = toFriendlyError({
      code: "23514",
      message:
        'new row for relation "property_location_settings" violates check constraint "manual_marker_pair"',
    });

    expect(message).toContain("latitude");
    expectNoLeaks(message);
  });

  it("falls back generically for a constraint nobody has written wording for", () => {
    const message = toFriendlyError({
      code: "23514",
      message:
        'new row for relation "x" violates check constraint "some_future_check"',
    });

    expect(message).toContain("do not satisfy the required rules");
    expect(message).not.toContain("some_future_check");
    expectNoLeaks(message);
  });
});

/* ---------------------------------------------------------------------- */
/* Layer 3 — caller-supplied wording                                      */
/* ---------------------------------------------------------------------- */

describe("caller-supplied wording", () => {
  it("lets an operation override a constraint it knows about", () => {
    expect(
      toFriendlyError(
        {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "properties_slug_key"',
        },
        {
          byConstraint: {
            properties_slug_key: "Choose a different web address for this home.",
          },
        },
      ),
    ).toBe("Choose a different web address for this home.");
  });

  it("lets an operation override a whole code", () => {
    expect(
      toFriendlyError(
        { code: "23503", message: "insert or update violates foreign key" },
        { byCode: { "23503": "That property was deleted while you were editing." } },
      ),
    ).toBe("That property was deleted while you were editing.");
  });

  it("prefers a recognised constraint over the caller's code mapping", () => {
    // The constraint is the more specific fact, so it wins.
    expect(
      toFriendlyError(
        {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "properties_slug_key"',
        },
        { byCode: { "23505": "Something is duplicated." } },
      ),
    ).toBe("That slug is already used by another property.");
  });
});

/* ---------------------------------------------------------------------- */
/* Layer 4 — generic wording                                              */
/* ---------------------------------------------------------------------- */

describe("generic wording", () => {
  it("describes a unique violation without naming a field", () => {
    const message = toFriendlyError({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    });

    expect(message).toBe("A record with those details already exists.");
    expect(message).not.toContain("slug");
  });

  it("describes a check violation without naming location or privacy", () => {
    const message = toFriendlyError({ code: "23514" });

    expect(message).toContain("do not satisfy the required rules");
    expect(message).not.toContain("location");
    expect(message).not.toContain("privacy");
  });

  it("tells the administrator to re-authenticate when RLS refuses", () => {
    const message = toFriendlyError({
      code: "42501",
      message: 'new row violates row-level security policy for table "properties"',
    });

    expect(message).toContain("permission");
    expectNoLeaks(message);
  });

  it("reports policy recursion as a server misconfiguration", () => {
    const message = toFriendlyError({
      code: "42P17",
      message: 'infinite recursion detected in policy for relation "admin_users"',
    });

    expect(message).toContain("misconfigured");
    expectNoLeaks(message);
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

  it("explains an over-long value", () => {
    expect(toFriendlyError({ code: "22001" })).toContain("too long");
  });

  it("maps the append-only audit trigger to the generic message", () => {
    // An administrator seeing "audit_log is append-only" would learn nothing
    // they could act on. It means the application has a bug, so it belongs in
    // the log and not on screen.
    const message = toFriendlyError({
      code: "P0001",
      message: "audit_log is append-only: UPDATE is not permitted.",
    });

    expect(message).toBe(GENERIC);
    expect(message).not.toContain("audit_log");
  });
});

/* ---------------------------------------------------------------------- */
/* Fallbacks and odd shapes                                               */
/* ---------------------------------------------------------------------- */

describe("fallbacks", () => {
  it("falls back generically for an unrecognised code", () => {
    const message = toFriendlyError({
      code: "XX999",
      message: "some internal detail about the cluster",
    });

    expect(message).toBe(GENERIC);
    expect(message).not.toContain("cluster");
  });

  it("uses the caller's fallback string when given one", () => {
    expect(
      toFriendlyError({ code: "XX999" }, "Could not publish this property."),
    ).toBe("Could not publish this property.");
  });

  it("uses the caller's fallback from the options object", () => {
    expect(
      toFriendlyError({ code: "XX999" }, { fallback: "Could not save." }),
    ).toBe("Could not save.");
  });

  it("handles null, undefined, strings and odd values", () => {
    expect(toFriendlyError(null)).toBe(GENERIC);
    expect(toFriendlyError(undefined)).toBe(GENERIC);
    expect(toFriendlyError(123)).toBe(GENERIC);
    expect(toFriendlyError([])).toBe(GENERIC);
    expect(toFriendlyError("a bare string")).toBe(GENERIC);
  });

  it("handles a thrown Error instance", () => {
    expect(toFriendlyError(new Error("stack-carrying internal message"))).toBe(
      GENERIC,
    );
  });

  it("never returns a raw database message for any code it does not know", () => {
    for (const code of ["XX000", "22P02", "2BP01", "0A000", "42883"]) {
      const message = toFriendlyError({
        code,
        message:
          'ERROR: relation "public.admin_users" does not exist at character 15 CONTEXT: PL/pgSQL',
      });

      expectNoLeaks(message);
    }
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
    expect(message).toBe("That slug is already used by another property.");
    expectNoLeaks(message);
  });

  it("passes options through", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      handleAdminError("Publishing", { code: "XX999" }, "Could not publish."),
    ).toBe("Could not publish.");
  });
});
