import { processStages } from "@/content/process";
import { propertyStatusOrder } from "@/lib/design/property-status";
import { serviceAreas } from "@/lib/site-config";

export interface CompanyStatistic {
  readonly id: string;
  readonly value: number;
  readonly suffix?: string;
  readonly label: string;
}

/**
 * Only figures that are true by construction are published here: each one is
 * derived from data in this repository, so it cannot drift out of date.
 *
 * Business figures — homes delivered, years operating, satisfaction rates — are
 * deliberately absent. Nothing goes on the page as a company achievement until
 * the business confirms it in writing; at that point add the entry here and it
 * appears in the section automatically.
 */
export const companyStatistics: readonly CompanyStatistic[] = [
  {
    id: "areas",
    value: serviceAreas.length,
    label: "Core suburbs we build in",
  },
  {
    id: "statuses",
    value: propertyStatusOrder.length,
    label: "Statuses tracked per home",
  },
  {
    id: "stages",
    value: processStages.length,
    label: "Documented build stages",
  },
];
