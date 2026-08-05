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
 * The four stages a build moves through. Each description states what happens
 * at that stage — the standard sequence for a Victorian residential build — and
 * makes no claim about how the company performs.
 */
export const processStages: readonly ProcessStage[] = [
  {
    id: "design",
    step: "01",
    title: "Site and design",
    body: "The plan is set out for the block, its orientation and the streetscape.",
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
    body: "Slab, frame, lock-up and fixing stages progress in sequence on site.",
    icon: HardHat,
  },
  {
    id: "handover",
    step: "04",
    title: "Handover",
    body: "Final inspection and a defects walk-through, then keys, certificates and warranty documents.",
    icon: KeyRound,
  },
] as const;
