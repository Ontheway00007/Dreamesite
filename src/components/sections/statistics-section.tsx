import { Section } from "@/components/layout/section";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { Statistic } from "@/components/ui/statistic";
import { companyStatistics } from "@/content/statistics";

/**
 * Every figure here is derived from project data, so the section stays accurate
 * on its own. See `content/statistics.ts` for why no volume or history figures
 * are published.
 */
export function StatisticsSection() {
  return (
    <Section tone="alt" spacing="lg" divided>
      <SectionHeading
        eyebrow="At a glance"
        title="How the work is structured."
      />

      <RevealGroup
        className="mt-16 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-3"
        stagger={0.1}
      >
        {companyStatistics.map((statistic) => (
          <RevealItem key={statistic.id}>
            <Statistic
              value={statistic.value}
              suffix={statistic.suffix}
              label={statistic.label}
            />
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
