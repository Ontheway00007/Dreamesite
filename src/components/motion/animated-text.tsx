import { Fragment, type CSSProperties, type ElementType } from "react";

import { cn } from "@/lib/utils/cn";

export interface AnimatedTextProps {
  text: string;
  /** Semantic tag. Defaults to a paragraph. */
  as?: "h1" | "h2" | "h3" | "p" | "span";
  /** Seconds before the first word moves. */
  delay?: number;
  /** Seconds between words. */
  stagger?: number;
  className?: string;
}

/**
 * Rises each word of a headline out of its own mask.
 *
 * A Server Component: the words are plain server-rendered text, always
 * readable, selectable and available to search engines. The movement is the
 * shared `data-enter="word"` CSS animation, staged per word, so it begins with
 * the first paint and disappears entirely under reduced motion. Nothing here
 * depends on JavaScript, and no animation library is involved.
 */
export function AnimatedText({
  text,
  as = "p",
  delay = 0,
  stagger = 0.045,
  className,
}: AnimatedTextProps) {
  const Component = as as ElementType;

  return (
    <Component className={cn("text-balance", className)}>
      {text.split(" ").map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          {/* A real space between masks: it keeps the text content readable for
              screen readers and search engines, and gives the line somewhere to
              break. */}
          {index > 0 ? " " : null}
          <span className="-mb-[0.18em] inline-flex overflow-hidden pb-[0.18em]">
            <span
              data-enter="word"
              style={
                {
                  "--enter-delay": `${delay + index * stagger}s`,
                } as CSSProperties
              }
              className="inline-block"
            >
              {word}
            </span>
          </span>
        </Fragment>
      ))}
    </Component>
  );
}
