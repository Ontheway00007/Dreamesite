import { Section } from "@/components/layout/section";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Statistic } from "@/components/ui/statistic";
import { companyStatistics } from "@/content/statistics";

export function StatisticsSection() {
  return (
    <Section tone="alt" spacing="lg" divided>
      <RevealGroup
        className="grid grid-cols-2 gap-x-8 gap-y-14 lg:grid-cols-4"
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
