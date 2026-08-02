import { FileCheck2, HardHat, KeyRound, PencilRuler } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ProcessStage {
  readonly id: string;
  readonly step: string;
  readonly title: string;
  readonly body: string;
  readonly icon: LucideIcon;
}

/**
 * The four stages every build moves through. Descriptions are deliberately
 * factual: they explain what happens, not how well we do it.
 */
export const processStages: readonly ProcessStage[] = [
  {
    id: "design",
    step: "01",
    title: "Site and design",
    body: "The plan is set out for the block, its orientation and the streetscape, then priced before anything is signed.",
    icon: PencilRuler,
  },
  {
    id: "documentation",
    step: "02",
    title: "Documentation and permits",
    body: "Working drawings, engineering and energy ratings are completed, then building and council permits are lodged.",
    icon: FileCheck2,
  },
  {
    id: "construction",
    step: "03",
    title: "Construction",
    body: "Slab, frame, lock-up and fixing stages progress in sequence, each one recorded and shared as it completes.",
    icon: HardHat,
  },
  {
    id: "handover",
    step: "04",
    title: "Handover",
    body: "A defects walk-through is documented and resolved before keys, certificates and warranty paperwork are handed over.",
    icon: KeyRound,
  },
] as const;
