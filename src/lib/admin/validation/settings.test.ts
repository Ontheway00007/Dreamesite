import { describe, expect, it } from "vitest";

import {
  SETTINGS_LIMITS,
  detectSecret,
  validateSettings,
} from "@/lib/admin/validation/settings";

/**
 * Settings are read by the public site, so the test that matters most is the
 * one about credentials. The model has no column a key belongs in — this is the
 * backstop for someone using a legitimate field wrongly.
 */

function fieldsOf(result: ReturnType<typeof validateSettings>) {
  return result.ok ? [] : result.errors.map((error) => error.field);
}

describe("detectSecret", () => {
  it("recognises the shapes people actually paste by accident", () => {
    expect(detectSecret("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")).toBeTruthy();
    expect(detectSecret("sb_secret_abcdefghijklmnop")).toBeTruthy();
    expect(detectSecret("sk_live_abcdefghij1234567890")).toBeTruthy();
    expect(detectSecret("AKIAIOSFODNN7EXAMPLE")).toBeTruthy();
    expect(detectSecret("ghp_abcdefghijklmnopqrstuvwxyz")).toBeTruthy();
    expect(
      detectSecret("-----BEGIN RSA PRIVATE KEY-----\nMIIEow"),
    ).toBeTruthy();
    expect(detectSecret("api_key = abc123")).toBeTruthy();
    expect(detectSecret("uses the service_role key")).toBeTruthy();
  });

  it("does not flag ordinary business text", () => {
    expect(detectSecret("Dreame Homes")).toBeNull();
    expect(detectSecret("Our office is closed until 6 January.")).toBeNull();
    expect(detectSecret("+61 3 9000 0000")).toBeNull();
  });
});

describe("validateSettings", () => {
  it("accepts an entirely empty settings row", () => {
    // Every field is optional: the site runs on its compiled-in defaults.
    const result = validateSettings({});

    expect(result.ok).toBe(true);
  });

  it("refuses a credential in a text field", () => {
    const result = validateSettings({
      companyName: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    });

    expect(fieldsOf(result)).toContain("companyName");
  });

  it("refuses a credential in a URL field", () => {
    const result = validateSettings({
      socialFacebook: "https://example.com/?token=eyJhbGciOiJIUzI1NiJ9abcdefgh",
    });

    expect(fieldsOf(result)).toContain("socialFacebook");
  });

  it("requires social links and the sharing image to be https", () => {
    expect(
      fieldsOf(validateSettings({ socialInstagram: "http://instagram.com/x" })),
    ).toContain("socialInstagram");
    expect(
      fieldsOf(validateSettings({ defaultOgImageUrl: "instagram.com/x" })),
    ).toContain("defaultOgImageUrl");
  });

  it("validates both email addresses", () => {
    expect(fieldsOf(validateSettings({ companyEmail: "not-an-email" }))).toContain(
      "companyEmail",
    );
    expect(
      fieldsOf(validateSettings({ enquiryRecipientEmail: "also-not" })),
    ).toContain("enquiryRecipientEmail");
  });

  it("lower-cases email addresses", () => {
    const result = validateSettings({ companyEmail: "Hello@Example.COM" });

    expect(result.ok && result.value.companyEmail).toBe("hello@example.com");
  });

  it("rejects a phone number containing letters", () => {
    expect(fieldsOf(validateSettings({ companyPhone: "ring us" }))).toContain(
      "companyPhone",
    );
  });

  it("rejects markup in the notice", () => {
    expect(
      fieldsOf(validateSettings({ maintenanceNotice: "<b>Closed</b>" })),
    ).toContain("maintenanceNotice");
  });

  it("bounds the notice length", () => {
    expect(
      fieldsOf(
        validateSettings({
          maintenanceNotice: "x".repeat(SETTINGS_LIMITS.maintenanceNotice + 1),
        }),
      ),
    ).toContain("maintenanceNotice");
  });

  it("turns blank fields into undefined so the column stores null", () => {
    const result = validateSettings({
      companyName: "   ",
      maintenanceNotice: "",
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.companyName).toBeUndefined();
      expect(result.value.maintenanceNotice).toBeUndefined();
    }
  });
});
