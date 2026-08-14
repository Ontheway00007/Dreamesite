import { Quote } from "lucide-react";

import type { Property } from "@/types";

export interface PropertyTestimonialsProps {
  property: Property;
}

/**
 * Customer quotes for this home.
 *
 * Returns null when there are none. Nothing is ever placed here that a customer
 * has not agreed to publish, which is why the demonstration data contains no
 * testimonials at all.
 */
export function PropertyTestimonials({ property }: PropertyTestimonialsProps) {
  const testimonials = property.testimonials ?? [];

  if (testimonials.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {testimonials.map((testimonial) => (
        <figure
          key={testimonial.id}
          className="border-border bg-surface rounded-xl border p-7"
        >
          <Quote size={18} className="text-accent" aria-hidden />
          <blockquote className="font-display mt-6 text-xl leading-relaxed font-light">
            {testimonial.quote}
          </blockquote>
          <figcaption className="text-foreground-subtle mt-6 text-xs font-medium tracking-label uppercase">
            {testimonial.attribution}
            {testimonial.year ? ` · ${testimonial.year}` : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
