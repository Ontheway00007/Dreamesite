import { describe, expect, it } from "vitest";

import {
  MAXIMUM_FILL_MS,
  MINIMUM_FILL_MS,
  checkForAbuse,
  looksLikeSpam,
  validateAdminNotes,
  validateEnquiry,
} from "@/lib/admin/validation/enquiry";

/**
 * The enquiry validator is the only one in this codebase that runs against
 * input from the open internet, so these tests assume a hostile caller rather
 * than a mistaken one.
 */

const valid = {
  name: "Jane Doe",
  email: "jane@example.com",
  message: "Is the Mickleham home still available in March?",
  consentToContact: true,
};

function submit(overrides: Partial<typeof valid> & Record<string, unknown> = {}) {
  return validateEnquiry({ ...valid, ...overrides });
}

function fieldsOf(result: ReturnType<typeof validateEnquiry>) {
  return result.ok ? [] : result.errors.map((error) => error.field);
}

describe("validateEnquiry", () => {
  it("accepts an ordinary enquiry", () => {
    const result = submit();

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.name).toBe("Jane Doe");
  });

  it("requires a name, an email, a message and consent", () => {
    expect(fieldsOf(submit({ name: "  " }))).toContain("name");
    expect(fieldsOf(submit({ email: "" }))).toContain("email");
    expect(fieldsOf(submit({ message: "" }))).toContain("message");
    expect(fieldsOf(submit({ consentToContact: false }))).toContain(
      "consentToContact",
    );
  });

  it("rejects a message too short to be a question", () => {
    expect(fieldsOf(submit({ message: "hi" }))).toContain("message");
  });

  it("rejects markup in the name and the message", () => {
    expect(fieldsOf(submit({ name: "<b>Jane</b>" }))).toContain("name");
    expect(
      fieldsOf(submit({ message: "Please see <script>alert(1)</script> this" })),
    ).toContain("message");
  });

  it("lower-cases the email so duplicates are recognisable", () => {
    const result = submit({ email: "Jane@Example.COM" });

    expect(result.ok && result.value.email).toBe("jane@example.com");
  });

  it("strips zero-width and control characters from the message", () => {
    const result = submit({
      message: "Is this\u200B home\u0000 still available in March?",
    });

    expect(result.ok && result.value.message).toBe(
      "Is this home still available in March?",
    );
  });

  it("collapses runs of blank lines rather than storing them", () => {
    const result = submit({
      message: "First question.\n\n\n\n\nSecond question about the block.",
    });

    expect(result.ok && result.value.message).toBe(
      "First question.\n\nSecond question about the block.",
    );
  });

  it("treats a blank phone number as absent rather than empty", () => {
    const result = submit({ phone: "   " });

    expect(result.ok && result.value.phone).toBeUndefined();
  });

  it("rejects a phone number containing letters", () => {
    expect(fieldsOf(submit({ phone: "call me" }))).toContain("phone");
  });

  it("reports a tampered property id against the form, not a field", () => {
    // The property is set by the page, so a bad value means the request was
    // assembled by hand — there is no input to attach the message to.
    expect(fieldsOf(submit({ propertyId: "not-a-uuid" }))).toContain("form");
  });

  it("falls back to a known source when an unrecognised one is supplied", () => {
    const result = submit({ source: "x".repeat(80) });

    expect(result.ok && result.value.source).toBe("website");
  });

  it("flags a message containing a link without rejecting it", () => {
    const result = submit({
      message: "Great homes, see also https://example.com for cheap loans",
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.suspectedSpam).toBe(true);
  });
});

describe("looksLikeSpam", () => {
  it("matches both bare and full URLs", () => {
    expect(looksLikeSpam("visit https://example.com")).toBe(true);
    expect(looksLikeSpam("visit www.example.com")).toBe(true);
  });

  it("does not match ordinary prose", () => {
    expect(looksLikeSpam("Is the Donnybrook home still available?")).toBe(false);
  });
});

describe("checkForAbuse", () => {
  const now = 1_700_000_000_000;

  it("passes a plausible submission", () => {
    expect(
      checkForAbuse({
        honeypot: "",
        renderedAt: String(now - 30_000),
        now,
      }),
    ).toBeNull();
  });

  it("catches a filled honeypot before anything else", () => {
    expect(
      checkForAbuse({ honeypot: "http://spam", renderedAt: null, now }),
    ).toBe("honeypot-filled");
  });

  it("treats a missing timestamp as no signal, not as automation", () => {
    // The timestamp is set by a mount effect, so a visitor without JavaScript
    // legitimately has none. Rejecting on absence would block them while
    // costing a script one line.
    expect(checkForAbuse({ honeypot: "", renderedAt: null, now })).toBeNull();
    expect(checkForAbuse({ honeypot: "", renderedAt: "  ", now })).toBeNull();
  });

  it("rejects a timestamp that is present but not a timestamp", () => {
    expect(checkForAbuse({ honeypot: "", renderedAt: "abc", now })).toBe(
      "submitted-too-fast",
    );
    expect(checkForAbuse({ honeypot: "", renderedAt: "-5", now })).toBe(
      "submitted-too-fast",
    );
  });

  it("rejects a submission faster than a person can type", () => {
    expect(
      checkForAbuse({
        honeypot: "",
        renderedAt: String(now - (MINIMUM_FILL_MS - 1)),
        now,
      }),
    ).toBe("submitted-too-fast");
  });

  it("rejects a future timestamp", () => {
    expect(
      checkForAbuse({ honeypot: "", renderedAt: String(now + 60_000), now }),
    ).toBe("submitted-too-fast");
  });

  it("expires a form held open too long", () => {
    expect(
      checkForAbuse({
        honeypot: "",
        renderedAt: String(now - (MAXIMUM_FILL_MS + 1)),
        now,
      }),
    ).toBe("form-expired");
  });
});

describe("validateAdminNotes", () => {
  it("turns an empty note into null so cleared reads as never written", () => {
    const result = validateAdminNotes("   ");

    expect(result.ok && result.value).toBeNull();
  });

  it("keeps a real note", () => {
    const result = validateAdminNotes("Called back Tuesday.");

    expect(result.ok && result.value).toBe("Called back Tuesday.");
  });

  it("rejects a note longer than the column allows", () => {
    const result = validateAdminNotes("x".repeat(4001));

    expect(result.ok).toBe(false);
  });
});
