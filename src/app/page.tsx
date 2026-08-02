import { ArrowRight, HardHat, KeyRound, PencilRuler } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Parallax } from "@/components/motion/parallax";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import {
  propertyStatusOrder,
  propertyStatusTokens,
} from "@/lib/design/property-status";
import { serviceAreas, siteConfig } from "@/lib/site-config";

const approach = [
  {
    icon: PencilRuler,
    title: "Site and design",
    body: "Each home is drawn for its block, orientation and streetscape before a slab is poured.",
  },
  {
    icon: HardHat,
    title: "Build",
    body: "Fixed-scope construction managed by our own site team, with progress recorded at every stage.",
  },
  {
    icon: KeyRound,
    title: "Handover",
    body: "Independent inspection, a documented defects walk-through, then keys and warranties.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="relative flex min-h-dvh items-center overflow-hidden pt-(--header-height)">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <Parallax
            distance={160}
            className="absolute -top-56 left-1/2 -translate-x-1/2"
          >
            <div className="size-[48rem] rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_70%)] blur-3xl" />
          </Parallax>
          <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-background" />
        </div>

        <Container className="py-24">
          <Reveal className="max-w-3xl">
            <Eyebrow>Registered builder &middot; Northern Melbourne</Eyebrow>
            <Heading level="display" as="h1" className="mt-6">
              Homes built with intent, north of Melbourne.
            </Heading>
            <Text size="lead" className="mt-8 max-w-2xl">
              {siteConfig.legalName} designs and builds residential homes across
              the northern growth corridor, from Craigieburn to Mernda. Every
              home we list carries an honest status, so you always know what is
              ready now and what is still on site.
            </Text>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Button href="/#homes" variant="accent" size="lg">
                See how we list homes
              </Button>
              <Button
                href={`mailto:${siteConfig.contact.email}`}
                variant="outline"
                size="lg"
                iconRight={<ArrowRight size={16} aria-hidden />}
              >
                Speak with our team
              </Button>
            </div>
          </Reveal>
        </Container>
      </section>

      <Section id="homes" tone="alt" spacing="lg" divided>
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <Reveal>
            <Eyebrow>The status system</Eyebrow>
            <Heading level={2} className="mt-5">
              Four states. No ambiguity.
            </Heading>
            <Text className="mt-6 max-w-md">
              Buyers waste weeks chasing homes that were never available. Each
              Dreame home sits in exactly one of four states, and the label is
              updated the day it changes.
            </Text>
          </Reveal>

          <RevealGroup className="divide-y divide-border" stagger={0.09}>
            {propertyStatusOrder.map((status) => {
              const token = propertyStatusTokens[status];

              return (
                <RevealItem key={status} className="py-7 first:pt-0 last:pb-0">
                  <div className="flex items-baseline gap-4">
                    <span
                      className={`mt-2 size-2 shrink-0 rounded-full ${token.swatchClassName}`}
                      aria-hidden
                    />
                    <div>
                      <h3 className="text-foreground text-lg font-medium">
                        {token.label}
                      </h3>
                      <Text size="small" className="mt-1.5">
                        {token.description}
                      </Text>
                    </div>
                  </div>
                </RevealItem>
              );
            })}
          </RevealGroup>
        </div>
      </Section>

      <Section id="locations" spacing="lg" divided>
        <Reveal className="max-w-2xl">
          <Eyebrow>Where we build</Eyebrow>
          <Heading level={2} className="mt-5">
            Ten suburbs across the northern corridor.
          </Heading>
          <Text className="mt-6">
            We stay inside a tight radius so our site teams, trades and
            suppliers are always close to the build.
          </Text>
        </Reveal>

        <RevealGroup
          className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-5"
          stagger={0.05}
        >
          {serviceAreas.map((area) => (
            <RevealItem key={area} className="bg-surface">
              <div className="px-5 py-8">
                <span className="font-display text-xl font-light">{area}</span>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section id="approach" tone="alt" spacing="lg" divided>
        <Reveal className="max-w-2xl">
          <Eyebrow>Our approach</Eyebrow>
          <Heading level={2} className="mt-5">
            Three stages, documented end to end.
          </Heading>
        </Reveal>

        <RevealGroup className="mt-14 grid gap-10 md:grid-cols-3" stagger={0.1}>
          {approach.map(({ icon: Icon, title, body }) => (
            <RevealItem key={title}>
              <div className="border-t border-border-strong pt-7">
                <Icon size={22} className="text-accent" aria-hidden />
                <h3 className="font-display text-heading-3 mt-6">{title}</h3>
                <Text size="small" className="mt-3">
                  {body}
                </Text>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section id="enquire" spacing="lg" width="content" divided>
        <Reveal className="text-center">
          <Eyebrow>Enquire</Eyebrow>
          <Heading level={1} className="mt-6">
            Tell us the suburb. We will tell you what is available.
          </Heading>
          <Text size="lead" className="mx-auto mt-7 max-w-xl">
            Send through the area and timeframe you are considering and our team
            will reply with the homes that genuinely match.
          </Text>
          <div className="mt-11 flex flex-wrap justify-center gap-4">
            <Button
              href={`mailto:${siteConfig.contact.email}`}
              variant="primary"
              size="lg"
            >
              Email {siteConfig.contact.email}
            </Button>
            <Button
              href={`tel:${siteConfig.contact.phone.replace(/\s/g, "")}`}
              variant="ghost"
              size="lg"
            >
              {siteConfig.contact.phone}
            </Button>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
