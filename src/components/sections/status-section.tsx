import { Section } from "@/components/layout/section";
import { StatusShowcase } from "@/components/sections/status-showcase";
import { SectionHeading } from "@/components/ui/section-heading";

export function StatusSection() {
  return (
    <Section id="status" spacing="lg" divided>
      <SectionHeading
        eyebrow="The status system"
        title="Four states. No ambiguity."
        description="Every home sits in exactly one state. Select one to see what it means before you enquire."
      />

      <StatusShowcase />
    </Section>
  );
}
