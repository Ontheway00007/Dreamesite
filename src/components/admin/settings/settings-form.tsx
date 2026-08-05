"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  updateSiteSettings,
  type SettingsActionResult,
} from "@/lib/admin/actions/settings-actions";
import {
  SETTINGS_LIMITS,
  detectSecret,
} from "@/lib/admin/validation/settings";
import type { FieldError } from "@/lib/admin/validation/result";
import { AdminAlert } from "@/components/admin/admin-alert";
import { Field } from "@/components/admin/form-controls";

/**
 * Site settings form.
 *
 * Grouped by what the fields are for rather than by column order, because the
 * question an administrator arrives with is "where do I change the phone
 * number", not "what is on the settings table".
 *
 * Each group says what happens when its fields are blank. The site works with
 * nothing filled in — the compiled-in defaults apply — and the form should make
 * that obvious rather than implying fifteen required fields.
 */

interface Props {
  readonly settings: {
    readonly companyName: string;
    readonly companyPhone: string;
    readonly companyEmail: string;
    readonly companyAddressDisplay: string;
    readonly defaultMetaTitle: string;
    readonly defaultMetaDescription: string;
    readonly defaultOgImageUrl: string;
    readonly socialFacebook: string;
    readonly socialInstagram: string;
    readonly socialLinkedin: string;
    readonly enquiryRecipientEmail: string;
    readonly maintenanceNotice: string;
  };
  /** What the site falls back to for the three values that always have one. */
  readonly fallbacks: {
    readonly companyName: string;
    readonly companyEmail: string;
    readonly companyPhone: string;
  };
  /** False when no row exists yet, so the page can say so. */
  readonly hasStoredSettings: boolean;
}

function toFieldMap(errors: readonly FieldError[] | undefined) {
  if (!errors) return {};

  return errors.reduce<Record<string, string>>((map, error) => {
    if (!map[error.field]) map[error.field] = error.message;
    return map;
  }, {});
}

export function SettingsForm({ settings, fallbacks, hasStoredSettings }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function set<K extends keyof typeof settings>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /*
    The same heuristic the server uses, run as the administrator types.

    The server check is the one that counts — this is here so the warning
    appears at the moment of the paste rather than after a save attempt, which
    is when someone can still tell where the value came from.
  */
  const secretWarnings = Object.entries(values)
    .map(([key, value]) => ({ key, what: detectSecret(String(value)) }))
    .filter((entry): entry is { key: string; what: string } =>
      Boolean(entry.what),
    );

  function handleSave() {
    setError(null);
    setNotice(null);
    setFieldErrors({});

    startTransition(async () => {
      const result: SettingsActionResult = await updateSiteSettings({
        companyName: values.companyName,
        companyPhone: values.companyPhone,
        companyEmail: values.companyEmail,
        companyAddressDisplay: values.companyAddressDisplay,
        defaultMetaTitle: values.defaultMetaTitle,
        defaultMetaDescription: values.defaultMetaDescription,
        defaultOgImageUrl: values.defaultOgImageUrl,
        socialFacebook: values.socialFacebook,
        socialInstagram: values.socialInstagram,
        socialLinkedin: values.socialLinkedin,
        enquiryRecipientEmail: values.enquiryRecipientEmail,
        maintenanceNotice: values.maintenanceNotice,
      });

      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        setFieldErrors(toFieldMap(result.fieldErrors));
        return;
      }

      setNotice("Settings saved. The public site has been updated.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {error && <AdminAlert tone="error" title={error} />}
      {notice && <AdminAlert tone="success" title={notice} />}

      {secretWarnings.length > 0 && (
        <AdminAlert tone="error" title="That looks like a credential">
          <p className="mt-1">
            One of these fields contains {secretWarnings[0].what}. Settings are
            read by the public website, so anything here is published.
            Credentials belong in environment variables, and this will be
            refused on save.
          </p>
        </AdminAlert>
      )}

      {!hasStoredSettings && (
        <AdminAlert tone="info" title="No settings saved yet">
          <p className="mt-1">
            The site is running on its built-in defaults. Fill in what the
            business has confirmed and leave the rest blank — a blank field falls
            back rather than publishing an empty one.
          </p>
        </AdminAlert>
      )}

      <Group
        title="Business details"
        description="Shown in the footer, the header and the enquiry block. Blank falls back to the values in the codebase."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Company name"
            error={fieldErrors.companyName}
            hint={`Blank uses “${fallbacks.companyName}”.`}
          >
            <input
              type="text"
              value={values.companyName}
              maxLength={SETTINGS_LIMITS.companyName}
              onChange={(event) => set("companyName", event.target.value)}
              className="admin-input"
              placeholder={fallbacks.companyName}
            />
          </Field>

          <Field
            label="Public phone number"
            error={fieldErrors.companyPhone}
            hint={`Blank uses “${fallbacks.companyPhone}”.`}
          >
            <input
              type="tel"
              value={values.companyPhone}
              maxLength={SETTINGS_LIMITS.companyPhone}
              onChange={(event) => set("companyPhone", event.target.value)}
              className="admin-input"
              placeholder={fallbacks.companyPhone}
            />
          </Field>

          <Field
            label="Public email address"
            error={fieldErrors.companyEmail}
            hint={`Shown to visitors. Blank uses “${fallbacks.companyEmail}”.`}
          >
            <input
              type="email"
              value={values.companyEmail}
              maxLength={SETTINGS_LIMITS.companyEmail}
              onChange={(event) => set("companyEmail", event.target.value)}
              className="admin-input"
              placeholder={fallbacks.companyEmail}
            />
          </Field>

          <Field
            label="Address to display"
            error={fieldErrors.companyAddressDisplay}
            hint="Optional. Only what the business is happy to publish."
          >
            <input
              type="text"
              value={values.companyAddressDisplay}
              maxLength={SETTINGS_LIMITS.addressDisplay}
              onChange={(event) =>
                set("companyAddressDisplay", event.target.value)
              }
              className="admin-input"
            />
          </Field>
        </div>
      </Group>

      <Group
        title="Search defaults"
        description="Used for the site as a whole. Individual properties override these on their own Search tab."
      >
        <Field
          label="Default meta title"
          error={fieldErrors.defaultMetaTitle}
          hint={`Up to ${SETTINGS_LIMITS.metaTitle} characters.`}
        >
          <input
            type="text"
            value={values.defaultMetaTitle}
            onChange={(event) => set("defaultMetaTitle", event.target.value)}
            className="admin-input"
          />
        </Field>

        <Field
          label="Default meta description"
          error={fieldErrors.defaultMetaDescription}
          hint={`Up to ${SETTINGS_LIMITS.metaDescription} characters.`}
        >
          <textarea
            value={values.defaultMetaDescription}
            rows={3}
            onChange={(event) =>
              set("defaultMetaDescription", event.target.value)
            }
            className="admin-input resize-none"
          />
        </Field>

        <Field
          label="Default sharing image"
          error={fieldErrors.defaultOgImageUrl}
          hint="Must start with https://. Used for pages that are not a single property."
        >
          <input
            type="url"
            value={values.defaultOgImageUrl}
            onChange={(event) => set("defaultOgImageUrl", event.target.value)}
            className="admin-input"
            placeholder="https://…"
          />
        </Field>
      </Group>

      <Group
        title="Social profiles"
        description="Links appear only for the profiles filled in here. Each must start with https://."
      >
        <div className="grid gap-6 sm:grid-cols-3">
          <Field label="Facebook" error={fieldErrors.socialFacebook}>
            <input
              type="url"
              value={values.socialFacebook}
              onChange={(event) => set("socialFacebook", event.target.value)}
              className="admin-input"
              placeholder="https://…"
            />
          </Field>
          <Field label="Instagram" error={fieldErrors.socialInstagram}>
            <input
              type="url"
              value={values.socialInstagram}
              onChange={(event) => set("socialInstagram", event.target.value)}
              className="admin-input"
              placeholder="https://…"
            />
          </Field>
          <Field label="LinkedIn" error={fieldErrors.socialLinkedin}>
            <input
              type="url"
              value={values.socialLinkedin}
              onChange={(event) => set("socialLinkedin", event.target.value)}
              className="admin-input"
              placeholder="https://…"
            />
          </Field>
        </div>
      </Group>

      <Group
        title="Operational"
        description="Internal to the business. The enquiry address is never shown on the public site — it is deliberately left out of the public settings view."
      >
        {/*
          Stated plainly rather than left to be inferred. The field stores an
          address and nothing sends to it, so an administrator who fills it in
          and waits for emails would be waiting indefinitely.
        */}
        <Field
          label="Enquiry notification address (reserved)"
          error={fieldErrors.enquiryRecipientEmail}
          hint="Reserved for enquiry email notifications, which are not built yet. Nothing is sent to this address — enquiries arrive in the Enquiries page of this dashboard only. Recording it now means the address is ready when delivery is added."
        >
          <input
            type="email"
            value={values.enquiryRecipientEmail}
            maxLength={SETTINGS_LIMITS.companyEmail}
            onChange={(event) =>
              set("enquiryRecipientEmail", event.target.value)
            }
            className="admin-input"
          />
        </Field>

        <Field
          label="Site-wide notice"
          error={fieldErrors.maintenanceNotice}
          hint={`Shown on every page while set. Clear it to remove it. Up to ${SETTINGS_LIMITS.maintenanceNotice} characters.`}
        >
          <textarea
            value={values.maintenanceNotice}
            rows={2}
            maxLength={SETTINGS_LIMITS.maintenanceNotice}
            onChange={(event) => set("maintenanceNotice", event.target.value)}
            className="admin-input resize-none"
            placeholder="Our office is closed until 6 January."
          />
        </Field>
      </Group>

      <div className="border-border border-t pt-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save settings"}
        </button>
        <p className="text-foreground-subtle mt-3 text-xs">
          Never put an API key, password or token in any of these fields. They
          are read by the public website.
        </p>
      </div>
    </div>
  );
}

function Group({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border-border space-y-6 rounded-xl border p-6">
      <div>
        <h2 className="text-foreground text-sm font-semibold uppercase tracking-wider">
          {title}
        </h2>
        <p className="text-foreground-subtle mt-1 text-xs leading-relaxed">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}
