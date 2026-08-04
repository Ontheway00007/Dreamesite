import { EnquiryForm } from "@/components/enquiry/enquiry-form";
import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { getPublicSettings, telHref } from "@/lib/settings/public-settings";
import { serviceAreas } from "@/lib/site-config";

export interface EnquirySectionProps {
  /** Anchor target, e.g. `contact` for `/#contact`. */
  id?: string;
  eyebrow?: string;
  title: string;
  body: string;
  /** Set on a property page so the enquiry is attached to that home. */
  propertyId?: string;
  source: "homepage" | "property-page" | "contact";
  defaultMessage?: string;
}

/**
 * The enquiry block: a real form, with the direct contact details beside it.
 *
 * Replaces the `mailto:` link that previously stood in for this. A mailto
 * depends on the visitor having a mail client configured, produces nothing the
 * business can track or assign, and silently loses the enquiry when it fails.
 * The form writes a record; the phone number and address remain for anyone who
 * would rather use them.
 *
 * A Server Component, so the render timestamp the form's timing check needs is
 * produced on the server and the form itself is the only client boundary.
 */
export async function EnquirySection({
  id,
  eyebrow = "Contact",
  title,
  body,
  propertyId,
  source,
  defaultMessage,
}: EnquirySectionProps) {
  // The business's own details when it has set them, the compiled-in defaults
  // otherwise. Resolved in one place so the form, the footer and the header
  // never show three different phone numbers.
  const settings = await getPublicSettings();

  return (
    <Section id={id} spacing="lg" width="content" divided className="grain">
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Heading level={2} as="h2" className="mt-6 max-w-3xl">
          {title}
        </Heading>
        <Text size="lead" className="mt-7 max-w-xl">
          {body}
        </Text>
      </Reveal>

      <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <EnquiryForm
          propertyId={propertyId}
          source={source}
          defaultMessage={defaultMessage}
        />

        <div className="space-y-8">
          <div>
            <h3 className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
              Prefer to call
            </h3>
            <p className="mt-3">
              <a
                href={telHref(settings.contactPhone)}
                className="text-foreground hover:text-accent text-sm transition-colors"
              >
                {settings.contactPhone}
              </a>
            </p>
          </div>

          <div>
            <h3 className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
              Or email
            </h3>
            <p className="mt-3">
              <a
                href={`mailto:${settings.contactEmail}`}
                className="text-foreground hover:text-accent text-sm break-words transition-colors"
              >
                {settings.contactEmail}
              </a>
            </p>
          </div>

          <div>
            <h3 className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
              Where we build
            </h3>
            <p className="text-foreground-muted mt-3 text-sm leading-relaxed">
              {serviceAreas.join(", ")}
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
