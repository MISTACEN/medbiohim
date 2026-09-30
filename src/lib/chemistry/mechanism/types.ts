/** Reaction mechanism model — independent of RDKit; UI draws SVG arrows. */

export type ElectronArrowType =
  | "curly"
  | "single-electron"
  | "resonance";

export interface MechanismAtomRef {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface MechanismBondRef {
  id: string;
  from: string;
  to: string;
  order?: 1 | 2 | 3;
}

export interface ElectronArrow {
  id: string;
  type: ElectronArrowType;
  from: { x: number; y: number } | { atomId: string };
  to: { x: number; y: number } | { atomId: string };
  curvature?: number;
  label?: string;
}

export interface MechanismStep {
  id: string;
  title: string;
  description?: string;
  atoms: MechanismAtomRef[];
  bonds: MechanismBondRef[];
  arrows: ElectronArrow[];
  note?: string;
}

export interface Mechanism {
  id: string;
  name: string;
  reactionSummary: string;
  steps: MechanismStep[];
  provenance?: { source?: string; note?: string };
}
