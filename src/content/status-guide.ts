import type { PropertyStatus } from "@/types";

export interface StatusGuideEntry {
  /** What the status means for a buyer, in one line. */
  readonly headline: string;
  /** What happens next for a home in this state. */
  readonly detail: string;
  /** The practical next step available to a visitor. */
  readonly nextStep: string;
}

/**
 * Definitional copy for each status. It describes the state of a home, so it
 * stays accurate regardless of what is currently on the market.
 */
export const statusGuide: Readonly<Record<PropertyStatus, StatusGuideEntry>> = {
  "move-in-ready": {
    headline: "Finished, titled and ready to occupy.",
    detail:
      "Construction is complete and the home has passed handover. Walk through it as it will be lived in, with nothing left to imagine.",
    nextStep: "Arrange a walk-through",
  },
  "under-construction": {
    headline: "On site, with stages still to come.",
    detail:
      "The build is progressing through its trade stages. Some selections may still be open, and the completion window narrows as work advances.",
    nextStep: "Ask what is still selectable",
  },
  completed: {
    headline: "Built and handed over.",
    detail:
      "The home is finished and lived in. It stays on record as a reference for how a floor plan resolves once it is standing.",
    nextStep: "Use it as a reference build",
  },
  sold: {
    headline: "No longer available.",
    detail:
      "The home has found its owner. It stays listed so the build record remains complete rather than disappearing.",
    nextStep: "Ask about similar homes",
  },
};
