import { AdminAlert } from "@/components/admin/admin-alert";
import { SettingsForm } from "@/components/admin/settings/settings-form";
import { getAdminSettings } from "@/lib/admin/settings-repository";
import { siteConfig } from "@/lib/site-config";

export const metadata = { title: "Settings" };

/** Turns a nullable column into the empty string the inputs expect. */
function text(value: string | null | undefined): string {
  return value ?? "";
}

export default async function SettingsPage() {
  const { row, failed } = await getAdminSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-2 font-display text-foreground">Settings</h1>
        <p className="text-foreground-subtle mt-1 text-sm">
          Business details, search defaults and the site-wide notice. Every field
          is optional.
        </p>
      </div>

      {failed ? (
        <AdminAlert tone="error" title="Could not load the settings">
          <p className="mt-1">
            The database did not respond. Reload the page to try again — the
            details are in the server logs. Nothing has been changed, and the
            public site is still using its last known values.
          </p>
        </AdminAlert>
      ) : (
        <SettingsForm
          hasStoredSettings={row !== null}
          fallbacks={{
            companyName: siteConfig.name,
            companyEmail: siteConfig.contact.email,
            companyPhone: siteConfig.contact.phone,
          }}
          settings={{
            companyName: text(row?.company_name),
            companyPhone: text(row?.company_phone),
            companyEmail: text(row?.company_email),
            companyAddressDisplay: text(row?.company_address_display),
            defaultMetaTitle: text(row?.default_meta_title),
            defaultMetaDescription: text(row?.default_meta_description),
            defaultOgImageUrl: text(row?.default_og_image_url),
            socialFacebook: text(row?.social_facebook),
            socialInstagram: text(row?.social_instagram),
            socialLinkedin: text(row?.social_linkedin),
            enquiryRecipientEmail: text(row?.enquiry_recipient_email),
            maintenanceNotice: text(row?.maintenance_notice),
          }}
        />
      )}
    </div>
  );
}
