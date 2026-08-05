import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/reveal";
import {
  Eyebrow,
  Heading,
  Text,
  type HeadingLevel,
} from "@/components/ui/typography";
import { cn } from "@/lib/utils/cn";

export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Visual size of the title. */
  level?: HeadingLevel;
  /** Semantic tag for the title. */
  as?: "h1" | "h2" | "h3";
  align?: "left" | "center";
  /** Optional trailing content, such as a link or button. */
  action?: ReactNode;
  className?: string;
}

/** Eyebrow, title and supporting copy, revealed as one unit. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  level = 2,
  as = "h2",
  align = "left",
  action,
  className,
}: SectionHeadingProps) {
  return (
    <Reveal
      className={cn(
        "flex flex-col gap-6",
        align === "center" && "items-center text-center",
        action && "md:flex-row md:items-end md:justify-between md:gap-12",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Heading level={level} as={as} className={eyebrow ? "mt-5" : undefined}>
          {title}
        </Heading>
        {description ? <Text className="mt-6">{description}</Text> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </Reveal>
  );
}
