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
    <Section id={id} spacing="lg" width="wide" divided className="grain overflow-hidden bg-background-alt">
      <Reveal>
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <Eyebrow className="editorial-kicker text-accent">{eyebrow}</Eyebrow>
            <Heading level={1} as="h2" className="mt-7 max-w-5xl">
              {title}
            </Heading>
          </div>
          <Text size="lead" className="max-w-xl lg:col-span-4 lg:pb-2">
            {body}
          </Text>
        </div>
      </Reveal>

      <div className="mt-14 grid gap-8 lg:mt-20 lg:grid-cols-12">
        <div className="editorial-frame border-border bg-surface-raised border p-6 shadow-raised sm:p-10 lg:col-span-8">
          <EnquiryForm
            propertyId={propertyId}
            source={source}
            defaultMessage={defaultMessage}
          />
        </div>

        <div className="rounded-[5rem_0.75rem_0.75rem_0.75rem] bg-accent p-8 text-accent-foreground sm:p-10 lg:col-span-4">
          <p className="font-display text-5xl leading-none italic">Talk to a person.</p>
          <p className="mt-4 text-sm leading-relaxed opacity-[0.72]">Call, email or send the form—whichever way you would rather speak.</p>
          <div className="mt-12 space-y-9">
          <div>
            <h3 className="text-[0.625rem] font-bold tracking-[0.2em] uppercase opacity-60">
              Prefer to call
            </h3>
            <p className="mt-3">
              <a
                href={telHref(settings.contactPhone)}
                className="text-sm font-semibold transition-opacity hover:opacity-70"
              >
                {settings.contactPhone}
              </a>
            </p>
          </div>

          <div>
            <h3 className="text-[0.625rem] font-bold tracking-[0.2em] uppercase opacity-60">
              Or email
            </h3>
            <p className="mt-3">
              <a
                href={`mailto:${settings.contactEmail}`}
                className="text-sm font-semibold break-words transition-opacity hover:opacity-70"
              >
                {settings.contactEmail}
              </a>
            </p>
          </div>

          <div>
            <h3 className="text-[0.625rem] font-bold tracking-[0.2em] uppercase opacity-60">
              Where we build
            </h3>
            <p className="mt-3 text-sm leading-relaxed opacity-[0.76]">
              {serviceAreas.join(", ")}
            </p>
          </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
