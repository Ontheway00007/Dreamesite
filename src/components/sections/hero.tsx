import type { CSSProperties } from "react";

import { ArrowRight } from "lucide-react";

import { Container } from "@/components/layout/container";
import { ArchitecturalFrame } from "@/components/media/architectural-frame";
import { AnimatedText } from "@/components/motion/animated-text";
import { Parallax } from "@/components/motion/parallax";
import { ScrollCue } from "@/components/sections/scroll-cue";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site-config";

/** Stage timings for the opening sequence, in seconds. */
const enter = {
  backdrop: 0,
  elevation: 0.1,
  eyebrow: 0.1,
  headline: 0.25,
  rule: 0.75,
  body: 0.9,
  actions: 1.05,
  cue: 1.25,
} as const;

function delay(seconds: number): CSSProperties {
  return { "--enter-delay": `${seconds}s` } as CSSProperties;
}

export interface HeroProps {
  eyebrow: string;
  headline: string;
  body: string;
  /** Anchor the primary action and the scroll cue jump to. */
  scrollTarget: string;
  /** Name of that destination, for the scroll cue's accessible label. */
  scrollDestination: string;
}

/**
 * Opening sequence for the site.
 *
 * A Server Component. The entrance is one CSS choreography — the layers settle,
 * the headline rises word by word, the rule draws, then the actions and the
 * scroll cue arrive — staged entirely through `--enter-delay`. Because CSS owns
 * it, the sequence starts with the first paint, survives with JavaScript
 * disabled, and is absent for reduced-motion visitors.
 *
 * The two client leaves are the parallax layer (GSAP, scroll-linked) and the
 * scroll cue (needs a click handler).
 */
export function Hero({
  eyebrow,
  headline,
  body,
  scrollTarget,
  scrollDestination,
}: HeroProps) {
  return (
    <section className="relative flex min-h-dvh items-center overflow-hidden pt-(--header-height)">
      <div className="absolute inset-0 -z-10" aria-hidden>
        <div
          data-enter="fade"
          style={delay(enter.backdrop)}
          className="blueprint-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_30%_35%,black,transparent_75%)]"
        />
        <Parallax
          distance={140}
          className="absolute -top-72 left-1/4 -translate-x-1/2"
        >
          <div className="size-[52rem] rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_70%)] blur-3xl" />
        </Parallax>
        <div
          data-enter="fade"
          style={delay(enter.elevation)}
          className="text-foreground/8 absolute -right-[10%] bottom-[-6%] w-[64rem] max-w-[125%]"
        >
          <ArchitecturalFrame variant="double-storey" />
        </div>
        <div className="to-background absolute inset-x-0 bottom-0 h-72 bg-gradient-to-b from-transparent" />
      </div>

      <Container className="py-28">
        <div className="max-w-5xl">
          <p
            data-enter
            style={delay(enter.eyebrow)}
            className="text-eyebrow text-foreground-subtle font-medium uppercase"
          >
            {eyebrow}
          </p>

          <AnimatedText
            as="h1"
            text={headline}
            delay={enter.headline}
            className="font-display text-display text-foreground mt-7 font-light"
          />

          <div
            data-enter="draw"
            style={delay(enter.rule)}
            className="bg-accent mt-10 h-px w-28 origin-left"
          />

          <p
            data-enter
            style={delay(enter.body)}
            className="text-lead text-foreground-muted mt-9 max-w-xl"
          >
            {body}
          </p>

          <div
            data-enter
            style={delay(enter.actions)}
            className="mt-12 flex flex-wrap items-center gap-4"
          >
            <Button href={scrollTarget} variant="accent" size="lg">
              View our homes
            </Button>
            <Button
              href={`mailto:${siteConfig.contact.email}`}
              variant="outline"
              size="lg"
              iconRight={<ArrowRight size={16} aria-hidden />}
            >
              Contact us
            </Button>
          </div>
        </div>
      </Container>

      <ScrollCue
        target={scrollTarget}
        destination={scrollDestination}
        enterDelay={enter.cue}
        className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 md:flex"
      />
    </section>
  );
}
