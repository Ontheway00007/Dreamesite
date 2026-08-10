/**
 * Price is intentionally stored as display copy. When an administrator enters
 * only a number, add the Australian currency sign so it cannot be mistaken for
 * a reference number; authored copy such as "Price on application" is untouched.
 */
export function publicPriceLabel(value?: string): string | undefined {
  const label = value?.trim();

  if (!label) {
    return undefined;
  }

  return /^\d[\d,]*(?:\.\d+)?$/.test(label) ? `$${label}` : label;
}
