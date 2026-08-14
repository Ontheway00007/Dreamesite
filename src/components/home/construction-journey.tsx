"use client";

import { Container } from "@/components/layout/container";
import { useGsap } from "@/hooks/use-gsap";
import { cn } from "@/lib/utils/cn";

const stages = [
  {
    number: "01",
    title: "Read the land",
    phase: "Site and design",
    story:
      "Orientation, fall, access and afternoon light shape the home before a line becomes a wall.",
    cue: "Contour · orientation · light",
    study: "ground",
  },
  {
    number: "02",
    title: "Set the footprint",
    phase: "Slab and groundwork",
    story:
      "The plan becomes physical. Services are placed, levels are fixed and the first permanent edge is drawn.",
    cue: "Set-out · services · concrete",
    study: "slab",
  },
  {
    number: "03",
    title: "Raise the volume",
    phase: "Frame and structure",
    story:
      "Rooms gain height and proportion. Openings begin to frame views; circulation can finally be walked.",
    cue: "Structure · openings · proportion",
    study: "frame",
  },
  {
    number: "04",
    title: "Close the envelope",
    phase: "Lock-up and interiors",
    story:
      "The weather stays outside. Material, joinery and light turn a protected shell into a sequence of rooms.",
    cue: "Envelope · texture · detail",
    study: "shell",
  },
  {
    number: "05",
    title: "Hand over a home",
    phase: "Completion",
    story:
      "The final work is quiet: test, refine, clean and resolve. The building is ready for the rituals of daily life.",
    cue: "Refine · verify · inhabit",
    study: "complete",
  },
] as const;

type Study = (typeof stages)[number]["study"];

/**
 * Abstract material studies keep an empty media state intentional and honest.
 *
 * The "not project photography" disclaimer is a caption below the card rather
 * than text laid over it. Overlaying it meant its contrast depended on whichever
 * study happened to be underneath: in the ground study it landed on the soil
 * band, where `--foreground-subtle` and `--study-earth-deep` sit close enough in
 * luminance that the line was barely readable in the daylight theme. A caption
 * outside the frame cannot be undermined by the image it describes.
 *
 * The two labels that remain inside the card are positioned over the blueprint
 * grid at the top, which is the one region every study leaves clear.
 */
function MaterialStudy({ study, number }: { study: Study; number: string }) {
  return (
    <figure>
      <div className="border-border bg-surface relative isolate aspect-[16/11] overflow-hidden rounded-[1.75rem] border shadow-raised">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-35"
          /*
          `--blueprint-line` rather than a literal `rgba(255,255,255,.045)`.
          The token already exists for exactly this grid and already has a
          daylight value; the literal drew white lines on a pale card, so the
          grid was invisible in one of the two themes.
        */
          style={{
            backgroundImage:
              "linear-gradient(var(--blueprint-line) 1px, transparent 1px), linear-gradient(90deg, var(--blueprint-line) 1px, transparent 1px)",
            backgroundSize: "3rem 3rem",
          }}
        />
        <div className="from-background/10 via-transparent to-background/70 absolute inset-0 bg-gradient-to-br" />

        {study === "ground" ? <GroundStudy /> : null}
        {study === "slab" ? <SlabStudy /> : null}
        {study === "frame" ? <FrameStudy /> : null}
        {study === "shell" ? <ShellStudy /> : null}
        {study === "complete" ? <CompleteStudy /> : null}

        <div className="text-label tracking-label absolute inset-x-5 top-5 flex items-center justify-between gap-4 font-medium uppercase sm:inset-x-7 sm:top-7">
          <span className="text-foreground-muted">Material study</span>
          <span className="text-foreground-subtle tabular-nums">
            {number} / 05
          </span>
        </div>
      </div>
      <figcaption className="text-foreground-subtle text-label tracking-label mt-3 text-right uppercase">
        Abstract, not project photography
      </figcaption>
    </figure>
  );
}

function GroundStudy() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="bg-accent/70 absolute right-[14%] bottom-[34%] size-3 rounded-full shadow-[0_0_0_8px_color-mix(in_oklab,var(--accent)_16%,transparent)]" />
      <div className="border-foreground-subtle/50 absolute right-[14%] bottom-[15%] h-[44%] w-[62%] -skew-x-12 rounded-[50%] border" />
      <div className="border-foreground-subtle/35 absolute right-[6%] bottom-[8%] h-[50%] w-[78%] -skew-x-12 rounded-[50%] border" />
      <div className="bg-study-earth absolute inset-x-0 bottom-0 h-[24%] [clip-path:polygon(0_42%,100%_0,100%_100%,0_100%)]" />
      <div className="bg-study-earth-deep absolute inset-x-0 bottom-0 h-[14%] [clip-path:polygon(0_28%,100%_0,100%_100%,0_100%)]" />
    </div>
  );
}

function SlabStudy() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 grid place-items-center"
    >
      <div className="bg-foreground-subtle/20 border-foreground-subtle/40 h-[38%] w-[68%] -rotate-6 border shadow-[1.5rem_1.5rem_0_var(--study-shadow)]">
        <div className="border-accent/70 ml-[16%] h-full w-[42%] border-x" />
        <div className="border-accent/70 mt-[-20%] ml-[58%] h-[52%] w-[26%] border" />
      </div>
    </div>
  );
}

function FrameStudy() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-[15%] top-[22%] bottom-[18%]"
    >
      <div className="bg-status-under-construction absolute inset-x-0 top-0 h-2" />
      <div className="bg-status-under-construction absolute inset-x-0 bottom-0 h-2" />
      {[0, 1, 2, 3, 4, 5].map((beam) => (
        <div
          key={beam}
          className="bg-status-under-construction absolute inset-y-0 w-2"
          style={{ left: `${beam * 20}%` }}
        />
      ))}
      <div className="border-foreground/45 absolute top-[36%] right-[9%] h-[45%] w-[28%] border" />
    </div>
  );
}

function ShellStudy() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-[14%] top-[21%] bottom-[17%] grid grid-cols-5 grid-rows-3 gap-1.5 -rotate-2"
    >
      {Array.from({ length: 15 }, (_, index) => (
        <div
          key={index}
          className={cn(
            "border-border-strong border",
            index === 7 || index === 8
              ? "bg-accent/45"
              : "bg-foreground-subtle/16",
          )}
        />
      ))}
    </div>
  );
}

function CompleteStudy() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="bg-accent/12 absolute top-[18%] left-[28%] size-[54%] rounded-full blur-3xl" />
      <div className="border-foreground-muted/70 absolute top-[19%] right-[14%] bottom-[17%] left-[14%] border p-3">
        <div className="border-foreground-subtle/45 grid h-full grid-cols-[1fr_1.6fr] border">
          <div className="border-foreground-subtle/45 border-r" />
          <div className="from-accent/55 to-accent/8 bg-gradient-to-br" />
        </div>
      </div>
    </div>
  );
}

export function ConstructionJourney() {
  const animationRef = useGsap<HTMLDivElement>(({ gsap }) => {
    const stageElements = gsap.utils.toArray<HTMLElement>(
      "[data-process-stage]",
    );

    stageElements.forEach((stage) => {
      const rect = stage.getBoundingClientRect();
      const isInitiallyVisible =
        rect.top < window.innerHeight && rect.bottom > 0;

      if (isInitiallyVisible) {
        return;
      }

      gsap.fromTo(
        stage,
        { opacity: 0.42, y: 56 },
        {
          opacity: 1,
          y: 0,
          ease: "none",
          scrollTrigger: {
            trigger: stage,
            start: "top 84%",
            end: "top 48%",
            scrub: 0.45,
          },
        },
      );
    });

    gsap.fromTo(
      "[data-process-line]",
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: "none",
        scrollTrigger: {
          trigger: "[data-process-list]",
          start: "top 68%",
          end: "bottom 64%",
          scrub: true,
        },
      },
    );
  }, []);

  return (
    <section
      id="process"
      aria-labelledby="construction-journey-heading"
      className="bg-background relative scroll-mt-header overflow-clip py-24 sm:py-32 lg:py-44"
    >
      <div
        aria-hidden="true"
        className="bg-accent/6 absolute top-[8%] right-[-20rem] size-[42rem] rounded-full blur-[140px]"
      />
      <Container
        ref={animationRef}
        width="stage"
        className="grid gap-20 lg:grid-cols-12 lg:gap-12"
      >
        {/*
          No eyebrow, and `text-heading-2` rather than `text-heading-1`. See the
          note in `service-areas-section.tsx`: four of the six homepage sections
          opened with a small uppercase label, and this heading was set one step
          larger than the rest of the section headings for no reason the content
          justifies.
        */}
        <header className="self-start lg:sticky lg:top-36 lg:col-span-4">
          <h2
            id="construction-journey-heading"
            className="font-display text-heading-2 max-w-lg font-light"
          >
            A home isn&apos;t assembled. It is revealed.
          </h2>
          <p className="text-foreground-muted mt-7 max-w-sm leading-relaxed">
            Follow the decisions that turn an empty site into a finished place,
            one permanent layer at a time.
          </p>
          <div className="border-border mt-10 hidden max-w-xs border-t pt-5 lg:block">
            <p className="text-foreground-subtle text-xs leading-relaxed">
              Scroll through five moments. Motion follows your pace and stops
              entirely when reduced motion is preferred.
            </p>
          </div>
        </header>

        <div
          data-process-list
          className="relative lg:col-start-6 lg:col-span-7"
        >
          <div
            aria-hidden="true"
            className="bg-border absolute top-0 bottom-0 left-[1.15rem] hidden w-px sm:block"
          >
            <span
              data-process-line
              className="bg-accent absolute inset-0 origin-top"
            />
          </div>

          <div className="space-y-28 sm:pl-16 lg:space-y-40">
            {stages.map((stage) => (
              <article
                key={stage.number}
                data-process-stage
                className="relative"
              >
                <span
                  aria-hidden="true"
                  className="border-accent bg-background absolute top-0 -left-[3.42rem] hidden size-5 rounded-full border sm:block"
                >
                  <span className="bg-accent absolute inset-1.5 rounded-full" />
                </span>
                <div className="mb-8 flex items-end justify-between gap-6">
                  <div>
                    <p className="text-accent text-label tracking-label font-medium uppercase">
                      {stage.phase}
                    </p>
                    <h3 className="font-display text-heading-3 mt-3 font-light">
                      {stage.title}
                    </h3>
                  </div>
                  <span className="font-display text-foreground-subtle text-5xl font-light tabular-nums sm:text-6xl">
                    {stage.number}
                  </span>
                </div>

                <MaterialStudy study={stage.study} number={stage.number} />

                <div className="mt-7 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
                  <p className="text-foreground-muted max-w-xl text-base leading-relaxed sm:text-lg">
                    {stage.story}
                  </p>
                  <p className="text-foreground-subtle text-label tracking-label whitespace-nowrap uppercase sm:pt-1">
                    {stage.cue}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
