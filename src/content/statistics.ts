import { serviceAreas } from "@/lib/site-config";

export interface CompanyStatistic {
  readonly id: string;
  readonly value: number;
  readonly suffix?: string;
  readonly label: string;
}

/**
 * UNCONFIRMED FIGURES.
 *
 * Only `suburbs` is derived from data in this repository. The other three are
 * placeholders for layout purposes and must be confirmed by the business before
 * launch — see "Content to confirm" in the README. Do not publish them as-is.
 */
export const companyStatistics: readonly CompanyStatistic[] = [
  { id: "homes", value: 120, suffix: "+", label: "Homes delivered" },
  { id: "suburbs", value: serviceAreas.length, label: "Suburbs we build in" },
  { id: "years", value: 12, label: "Years building in the north" },
  { id: "build-time", value: 9, suffix: " mo", label: "Typical build duration" },
] as const;
