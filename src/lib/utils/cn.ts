import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge has to be told about the custom font sizes declared in
 * globals.css, otherwise it treats classes like `text-lead` as text colours and
 * silently drops them when a colour is also applied.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "eyebrow",
            "display",
            "heading-1",
            "heading-2",
            "heading-3",
            "lead",
          ],
        },
      ],
    },
  },
});

/**
 * Merges conditional class names and resolves conflicting Tailwind utilities,
 * so component variants can always be overridden by a caller's `className`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
