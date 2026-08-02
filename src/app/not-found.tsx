import { Section } from "@/components/layout/section";
import { Button } from "@/components/ui/button";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";

export default function NotFound() {
  return (
    <Section spacing="lg" width="content" className="min-h-dvh content-center">
      <div className="text-center">
        <Eyebrow>404</Eyebrow>
        <Heading level={1} className="mt-6">
          This page has not been built.
        </Heading>
        <Text size="lead" className="mx-auto mt-6 max-w-md">
          The page you are looking for does not exist or has been moved.
        </Text>
        <div className="mt-10 flex justify-center">
          <Button href="/" variant="outline" size="lg">
            Return home
          </Button>
        </div>
      </div>
    </Section>
  );
}
