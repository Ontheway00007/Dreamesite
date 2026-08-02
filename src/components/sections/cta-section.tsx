import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";

export interface CtaAction {
  label: string;
  href: string;
}

export interface CtaSectionProps {
  id?: string;
  eyebrow: string;
  title: string;
  body: string;
  primary: CtaAction;
  secondary?: CtaAction;
}

/** Closing enquiry block. Reusable for any page that needs a single next step. */
export function CtaSection({
  id,
  eyebrow,
  title,
  body,
  primary,
  secondary,
}: CtaSectionProps) {
  return (
    <Section id={id} spacing="lg" width="content" divided className="grain">
      <Reveal className="flex flex-col items-center text-center">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Heading level={1} className="mt-6 max-w-3xl">
          {title}
        </Heading>
        <Text size="lead" className="mt-7 max-w-xl">
          {body}
        </Text>
        <div className="mt-11 flex flex-wrap justify-center gap-4">
          <Button href={primary.href} variant="primary" size="lg">
            {primary.label}
          </Button>
          {secondary ? (
            <Button href={secondary.href} variant="ghost" size="lg">
              {secondary.label}
            </Button>
          ) : null}
        </div>
      </Reveal>
    </Section>
  );
}
