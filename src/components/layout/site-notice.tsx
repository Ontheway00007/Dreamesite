import { Container } from "@/components/layout/container";
import { getPublicSettings } from "@/lib/settings/public-settings";

/**
 * The site-wide notice, when the business has set one.
 *
 * Renders nothing at all when the setting is blank — not a collapsed element,
 * not an empty bar. A notice bar that is always present but usually empty
 * shifts the page and trains people to ignore it.
 *
 * `role="status"` rather than `role="alert"`: it is announced when convenient
 * rather than interrupting, because it is standing information — office hours,
 * a closure — not an emergency.
 */
export async function SiteNotice() {
  const settings = await getPublicSettings();

  if (!settings.maintenanceNotice) {
    return null;
  }

  return (
    <div
      role="status"
      className="border-accent/20 bg-accent/10 border-b py-2.5 text-center"
    >
      <Container>
        <p className="text-foreground text-sm">{settings.maintenanceNotice}</p>
      </Container>
    </div>
  );
}
