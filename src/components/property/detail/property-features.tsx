import type { Property } from "@/types";

export interface PropertyFeaturesProps {
  property: Property;
}

/**
 * Features and finishes, grouped as the record groups them.
 *
 * Each group is a real heading rather than a styled line, so the section is
 * navigable by heading in a screen reader and the structure survives without
 * CSS. Groups arrive already ordered and already filtered to published rows;
 * an empty group is dropped rather than rendered as a heading with nothing
 * under it.
 *
 * Entries with a value render as a definition pair. A label on its own —
 * "Double glazing throughout" — is a complete statement, so it renders as one
 * rather than being padded out with an empty value.
 */
export function PropertyFeatures({ property }: PropertyFeaturesProps) {
  const groups = (property.featureGroups ?? []).filter(
    (group) => group.features.length > 0,
  );

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="space-y-12">
      {groups.map((group) => (
        <section key={group.category}>
          <h3 className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
            {group.heading}
          </h3>

          <dl className="border-border mt-5 grid gap-x-8 border-t sm:grid-cols-2 lg:grid-cols-3">
            {group.features.map((feature) => (
              <div key={feature.id} className="border-border border-b py-4">
                <dt className="text-foreground text-sm font-medium">
                  {feature.label}
                </dt>
                {feature.value ? (
                  <dd className="text-foreground-muted mt-1 text-sm leading-relaxed">
                    {feature.value}
                  </dd>
                ) : (
                  // The label is the whole statement. An empty `dd` keeps the
                  // list valid without inventing a value.
                  <dd className="sr-only">Included</dd>
                )}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
