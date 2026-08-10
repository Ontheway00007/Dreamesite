"use client";

import { useRef } from "react";
import { FileCheck2, HardHat, KeyRound, PencilRuler } from "lucide-react";

import { useGsap } from "@/hooks/use-gsap";
import { ScrollTrigger } from "@/lib/animation/gsap";
import { cn } from "@/lib/utils/cn";

/**
 * Construction stages with visual progression.
 * 
 * Each stage represents a key milestone in the building journey.
 */
const stages = [
  {
    id: "land",
    step: "01",
    title: "The beginning",
    subtitle: "Site and design",
    story: "An empty block. No structure yet. Just potential. This is where every home starts—with a piece of land and a vision for what it will become.",
    icon: PencilRuler,
    color: "from-stone-900 to-stone-800",
  },
  {
    id: "slab",
    step: "02",
    title: "The foundation",
    subtitle: "Slab and groundwork",
    story: "Concrete poured. The footprint is now permanent. This is the moment a plan becomes physical—the first irreversible commitment to the design.",
    icon: FileCheck2,
    color: "from-slate-800 to-slate-700",
  },
  {
    id: "frame",
    step: "03",
    title: "The skeleton",
    subtitle: "Frame and structure",
    story: "Timber rises. Rooms take shape. You can walk through spaces that existed only as lines on paper. The home reveals its bones.",
    icon: HardHat,
    color: "from-amber-900 to-amber-800",
  },
  {
    id: "lockup",
    step: "04",
    title: "The shell",
    subtitle: "Lock-up stage",
    story: "Walls, windows, roof. The house is now weatherproof. It feels enclosed. Protected. This is when the exterior world and the interior world become distinct.",
    icon: HardHat,
    color: "from-zinc-800 to-zinc-700",
  },
  {
    id: "complete",
    step: "05",
    title: "The handover",
    subtitle: "Finished home",
    story: "Every fixture installed. Every surface finished. The transformation is complete. What started as empty land is now a place someone will call home.",
    icon: KeyRound,
    color: "from-emerald-900 to-emerald-800",
  },
] as const;

/**
 * Editorial placeholder for construction photography.
 * 
 * This clearly communicates "Photography coming soon" rather than showing
 * fake or stock imagery. The design is intentionally architectural—line art
 * that suggests the stage without pretending to be a real photograph.
 */
function PhotographyPlaceholder({ 
  stage, 
  className 
}: { 
  stage: typeof stages[number]; 
  className?: string;
}) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {/* Gradient background that reflects the stage */}
      <div className={cn("absolute inset-0 bg-gradient-to-br", stage.color)} />
      
      {/* Architectural grid overlay */}
      <div className="absolute inset-0 opacity-10">
        <div className="h-full w-full" style={{
          backgroundImage: `
            linear-gradient(0deg, transparent 49%, rgba(255,255,255,0.3) 49%, rgba(255,255,255,0.3) 51%, transparent 51%),
            linear-gradient(90deg, transparent 49%, rgba(255,255,255,0.3) 49%, rgba(255,255,255,0.3) 51%, transparent 51%)
          `,
          backgroundSize: '120px 120px',
        }} />
      </div>
      
      {/* Stage icon - large and architectural */}
      <div className="absolute inset-0 flex items-center justify-center">
        <stage.icon 
          className="text-foreground/20 h-48 w-48 stroke-[0.5]" 
          aria-hidden 
        />
      </div>
      
      {/* Label */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-8">
        <p className="text-foreground/60 text-xs font-medium uppercase tracking-[0.24em]">
          Photography coming soon
        </p>
        <p className="text-foreground/80 mt-1 font-display text-xl">
          {stage.subtitle}
        </p>
      </div>
    </div>
  );
}

/**
 * The construction journey — a scroll-linked transformation story.
 * 
 * ## Why this replaces ProcessSection
 * 
 * A timeline widget lists stages. This shows transformation. As you scroll,
 * one property evolves through every stage of construction—empty land becomes
 * a finished home. The photography (or editorial placeholders) dominate the
 * composition, and the story of each stage sits beside it.
 * 
 * ## Scroll-linked choreography
 * 
 * GSAP ScrollTrigger pins the container and scrubs through each stage based
 * on scroll position. Each stage occupies one viewport height of scroll.
 * 
 * ## Photography placeholders
 * 
 * These are editorial, not generic. They use architectural iconography and
 * clearly state "Photography coming soon" rather than pretending to be real
 * images. When real construction photos exist, they replace these 1:1.
 * 
 * ## Intensity: 9/10
 * 
 * The scroll-linked transition between stages, the scale of the photography,
 * and the narrative pacing make this unforgettable. It's not a section to
 * read—it's an experience to move through.
 */
export function ConstructionJourney() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stagesRef = useRef<HTMLDivElement>(null);

  useGsap(
    ({ gsap, prefersReduced }) => {
      if (prefersReduced || !containerRef.current || !stagesRef.current) {
        return;
      }

      const container = containerRef.current;
      const stageElements = gsap.utils.toArray<HTMLElement>("[data-stage]");
      
      // Check if mobile
      const isMobile = window.innerWidth < 1024;

      // On mobile, use simpler scroll-linked fade without pinning
      // On desktop, use full pinned scroll experience
      if (isMobile) {
        // Mobile: simpler staggered reveals without complex pinning
        stageElements.forEach((stage) => {
          gsap.fromTo(
            stage,
            { 
              opacity: 0, 
              y: 60,
            },
            {
              opacity: 1,
              y: 0,
              duration: 0.8,
              ease: "power2.out",
              scrollTrigger: {
                trigger: stage,
                start: "top 80%",
                end: "top 50%",
                scrub: 0.5,
              },
            }
          );
        });
      } else {
        // Desktop: full pinned scroll experience
        ScrollTrigger.create({
          trigger: container,
          start: "top top",
          end: () => `+=${stages.length * 100}%`,
          pin: true,
          scrub: 1,
          anticipatePin: 1,
        });

        // Animate each stage in and out
        stageElements.forEach((stage, index) => {
          const isLast = index === stageElements.length - 1;
          
          // Fade in and scale
          gsap.fromTo(
            stage,
            { 
              opacity: 0, 
              scale: 0.95,
            },
            {
              opacity: 1,
              scale: 1,
              duration: 0.6,
              ease: "power2.out",
              scrollTrigger: {
                trigger: container,
                start: `top+=${index * 100}% top`,
                end: `top+=${index * 100 + 30}% top`,
                scrub: 1,
              },
            }
          );

          // Fade out (except last stage)
          if (!isLast) {
            gsap.to(stage, {
              opacity: 0,
              scale: 1.05,
              duration: 0.6,
              ease: "power2.in",
              scrollTrigger: {
                trigger: container,
                start: `top+=${(index + 1) * 100 - 30}% top`,
                end: `top+=${(index + 1) * 100}% top`,
                scrub: 1,
              },
            });
          }
        });
      }
    },
    []
  );

  return (
    <section 
      ref={containerRef}
      aria-labelledby="construction-journey-heading"
      /*
        The pinned, single-viewport composition is gated behind `motion-safe`.
        `useGsap` runs nothing for a reduced-motion visitor, so without the gate
        the stages would stay absolutely positioned and invisible on top of each
        other inside a fixed screen height. Ungated, this falls back to the
        stacked flow layout the small screens already use, which reads fine.
      */
      className="relative w-full overflow-hidden bg-background lg:motion-safe:h-screen"
    >
      {/* Background gradient that shifts with scroll */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background-alt to-background" />

      {/* The scroll-linked stages */}
      <div 
        ref={stagesRef}
        className="relative h-full w-full lg:motion-safe:absolute lg:motion-safe:inset-0"
      >
        {stages.map((stage) => (
          <div
            key={stage.id}
            data-stage={stage.id}
            className="relative py-20 opacity-100 lg:motion-safe:absolute lg:motion-safe:inset-0 lg:motion-safe:py-0 lg:motion-safe:opacity-0"
          >
            <div className="h-full w-full">
              {/* Three-column layout: Stage info | Photography | Story */}
              <div className="mx-auto flex h-full max-w-[120rem] flex-col items-center gap-8 px-5 sm:px-8 lg:grid lg:grid-cols-12 lg:gap-12 lg:px-12">
                
                {/* Left: Stage number and title (desktop only) */}
                <div className="hidden lg:col-span-3 lg:flex lg:flex-col lg:gap-6">
                  <div>
                    <p className="text-accent font-display text-[5rem] leading-none tracking-tighter">
                      {stage.step}
                    </p>
                    <h3 className="font-display text-foreground mt-2 text-3xl leading-tight">
                      {stage.title}
                    </h3>
                    <p className="text-foreground-subtle mt-1 text-sm uppercase tracking-[0.2em]">
                      {stage.subtitle}
                    </p>
                  </div>

                  {/* Progress indicator */}
                  <div className="flex flex-col gap-2">
                    {stages.map((s) => (
                      <div
                        key={s.id}
                        className={cn(
                          "h-1 w-full rounded-full transition-all duration-500",
                          s.id === stage.id 
                            ? "bg-accent w-full" 
                            : "bg-border w-12"
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Center: Large editorial photography (desktop only) */}
                <div className="hidden lg:col-span-5 lg:block">
                  <div className="aspect-[4/5] w-full overflow-hidden rounded-2xl shadow-raised">
                    <PhotographyPlaceholder stage={stage} />
                  </div>
                </div>

                {/* Right: The human story */}
                <div className="w-full lg:col-span-4">
                  {/* Mobile stage header */}
                  <div className="mb-6 lg:hidden">
                    <p className="text-accent font-display text-[3rem] leading-none tracking-tighter sm:text-[3.5rem]">
                      {stage.step}
                    </p>
                    <h3 
                      id={stage.id === "land" ? "construction-journey-heading" : undefined}
                      className="font-display text-foreground mt-2 text-2xl leading-tight"
                    >
                      {stage.title}
                    </h3>
                    <p className="text-foreground-subtle mt-1 text-xs uppercase tracking-[0.2em]">
                      {stage.subtitle}
                    </p>
                  </div>

                  {/* Mobile photography */}
                  <div className="mb-6 lg:hidden">
                    <div className="aspect-4/3 w-full overflow-hidden rounded-xl shadow-raised">
                      <PhotographyPlaceholder stage={stage} />
                    </div>
                  </div>

                  {/* The story */}
                  <div className="max-w-xl">
                    <p className="text-foreground-muted text-base leading-relaxed sm:text-lg">
                      {stage.story}
                    </p>

                    {/* Stage counter (mobile) */}
                    <div className="mt-6 flex items-center gap-2 lg:hidden">
                      {stages.map((s) => (
                        <div
                          key={s.id}
                          className={cn(
                            "h-1 rounded-full transition-all duration-500",
                            s.id === stage.id 
                              ? "bg-accent w-12" 
                              : "bg-border w-8"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Scroll hint (only visible on first stage, desktop only) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-8 hidden justify-center lg:flex">
        <p className="text-foreground-subtle flex items-center gap-2 text-xs uppercase tracking-[0.2em] opacity-60 motion-safe:animate-pulse">
          <span>Scroll to see the transformation</span>
          <svg 
            className="h-4 w-4" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
            aria-hidden
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M19 14l-7 7m0 0l-7-7m7 7V3" 
            />
          </svg>
        </p>
      </div>
    </section>
  );
}
