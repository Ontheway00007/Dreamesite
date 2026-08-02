import { Section } from "@/components/layout/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { processStages } from "@/content/process";

/**
 * Icons are rendered here, on the server, and handed to the timeline as
 * elements. That keeps the timeline agnostic about which icon set is used.
 */
const timelineItems: readonly TimelineItem[] = processStages.map(
  ({ id, step, title, body, icon: Icon }) => ({
    id,
    step,
    title,
    body,
    icon: <Icon size={20} aria-hidden />,
  }),
);

export function ProcessSection() {
  return (
    <Section id="process" spacing="lg" divided>
      <SectionHeading
        eyebrow="How a home gets built"
        title="Four stages, documented end to end."
        description="The same sequence every time, so you always know which stage your home is in and what happens next."
      />

      <Timeline items={timelineItems} className="mt-16 max-w-4xl" />
    </Section>
  );
}
