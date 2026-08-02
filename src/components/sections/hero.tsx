"use client";

import { ArrowDown, ArrowRight } from "lucide-react";

import { Container } from "@/components/layout/container";
import { ArchitecturalFrame } from "@/components/media/architectural-frame";
import { AnimatedText } from "@/components/motion/animated-text";
import { Parallax } from "@/components/motion/parallax";
import { Button } from "@/components/ui/button";
import { useGsap } from "@/hooks/use-gsap";
import { siteConfig } from "@/lib/site-config";
import { useSmoothScroll } from "@/providers/smooth-scroll-provider";

export interface HeroProps {
  eyebrow: string;
  headline: string;
  body: string;
  /** Anchor the scroll indicator jumps to. */
  scrollTarget: string;
}

/**
 * Opening sequence for the site.
 *
 * A single GSAP timeline runs once on mount and stages the composition: the
 * drawing settles, the headline rises word by word, the accent rule draws, then
 * the actions and the scroll cue arrive. It runs before first paint, so nothing
 * flashes, and it is skipped entirely under reduced motion where every element
 * is simply already in place.
 */
export function Hero({ eyebrow, headline, body, scrollTarget }: HeroProps) {
  const { scrollTo } = useSmoothScroll();

  const ref = useGsap<HTMLElement>(({ gsap }) => {
    const timeline = gsap.timeline({
      defaults: { ease: "expo.out", duration: 1 },
    });

    timeline
      .from("[data-hero-grid]", { opacity: 0, duration: 1.6 }, 0)
      .from(
        "[data-hero-elevation]",
        { opacity: 0, xPercent: 8, duration: 1.8 },
        0,
      )
      .from("[data-hero-eyebrow]", { opacity: 0, y: 14, duration: 0.8 }, 0.1)
      .from("[data-hero-rule]", { scaleX: 0, duration: 1.1 }, 0.75)
      .from("[data-hero-body]", { opacity: 0, y: 18, duration: 0.9 }, 0.9)
      .from("[data-hero-actions]", { opacity: 0, y: 18, duration: 0.9 }, 1.05)
      .from("[data-hero-cue]", { opacity: 0, duration: 0.8 }, 1.25);

    gsap.fromTo(
      "[data-hero-cue-line]",
      { yPercent: -100 },
      {
        yPercent: 100,
        duration: 1.9,
        ease: "power2.inOut",
        repeat: -1,
        repeatDelay: 0.3,
        delay: 2,
      },
    );
  });

  return (
    <section
      ref={ref}
      className="relative flex min-h-dvh items-center overflow-hidden pt-(--header-height)"
    >
      <div className="absolute inset-0 -z-10" aria-hidden>
        <div
          data-hero-grid
          className="blueprint-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_30%_35%,black,transparent_75%)]"
        />
        <Parallax
          distance={140}
          className="absolute -top-72 left-1/4 -translate-x-1/2"
        >
          <div className="size-[52rem] rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_70%)] blur-3xl" />
        </Parallax>
        <div
          data-hero-elevation
          className="text-foreground/8 absolute -right-[10%] bottom-[-6%] w-[64rem] max-w-[125%]"
        >
          <ArchitecturalFrame variant="double-storey" />
        </div>
        <div className="to-background absolute inset-x-0 bottom-0 h-72 bg-gradient-to-b from-transparent" />
      </div>

      <Container className="py-28">
        <div className="max-w-5xl">
          <p
            data-hero-eyebrow
            className="text-eyebrow text-foreground-subtle font-medium uppercase"
          >
            {eyebrow}
          </p>

          <AnimatedText
            as="h1"
            text={headline}
            delay={0.25}
            className="font-display text-display text-foreground mt-7 font-light"
          />

          <div
            data-hero-rule
            className="bg-accent mt-10 h-px w-28 origin-left"
          />

          <p
            data-hero-body
            className="text-lead text-foreground-muted mt-9 max-w-xl"
          >
            {body}
          </p>

          <div
            data-hero-actions
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

      <button
        data-hero-cue
        type="button"
        onClick={() => scrollTo(scrollTarget, -80)}
        className="text-foreground-subtle hover:text-foreground absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-3 transition-colors duration-(--duration-base) md:flex"
      >
        <span className="text-[0.625rem] font-medium tracking-[0.28em] uppercase">
          Scroll
        </span>
        <span className="bg-border relative h-14 w-px overflow-hidden">
          <span
            data-hero-cue-line
            className="bg-accent absolute inset-x-0 top-0 block h-full"
          />
        </span>
        <ArrowDown size={14} aria-hidden />
      </button>
    </section>
  );
}
