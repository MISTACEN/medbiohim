/**
 * VSEPR: стерическое число, геометрия, идеальные углы и гибридизация
 * по данным RDKit (UST JSON: атомы, заряды, неявные H, порядки связей).
 *
 * Это модель Льюиса для элементов главных подгрупп: резонанс (амиды,
 * карбоксилат) и d-металлы она не описывает — такие атомы пропускаются
 * или помечаются, а не получают выдуманную геометрию.
 */

export type VseprAtom = {
  /** Индекс атома в молекуле RDKit (для подсветки структуры). */
  index: number;
  symbol: string;
  neighbors: string;
  sigmaBonds: number;
  lonePairs: number | null;
  stericNumber: number;
  geometry: string;
  angles: string;
  hybridization: string;
  aromatic: boolean;
};

export type VseprReport = {
  atoms: VseprAtom[];
  notes: string[];
};

const SYMBOLS: Record<number, string> = {
  1: "H", 3: "Li", 4: "Be", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F",
  11: "Na", 12: "Mg", 13: "Al", 14: "Si", 15: "P", 16: "S", 17: "Cl",
  19: "K", 20: "Ca", 31: "Ga", 32: "Ge", 33: "As", 34: "Se", 35: "Br",
  37: "Rb", 38: "Sr", 49: "In", 50: "Sn", 51: "Sb", 52: "Te", 53: "I",
  54: "Xe", 55: "Cs", 56: "Ba", 81: "Tl", 82: "Pb", 83: "Bi", 84: "Po",
};

/** Валентные электроны нейтрального атома (главные подгруппы). */
const VALENCE: Record<number, number> = {
  1: 1, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7,
  11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6, 17: 7,
  19: 1, 20: 2, 31: 3, 32: 4, 33: 5, 34: 6, 35: 7,
  37: 1, 38: 2, 49: 3, 50: 4, 51: 5, 52: 6, 53: 7, 54: 8,
  55: 1, 56: 2, 81: 3, 82: 4, 83: 5, 84: 6,
};

type Shape = { geometry: string; angles: string; hybridization: string };

const SHAPES: Record<string, Shape> = {
  "2-0": { geometry: "линейная", angles: "180°", hybridization: "sp" },
  "2-1": { geometry: "линейная", angles: "180°", hybridization: "sp" },
  "3-0": { geometry: "тригональная плоская", angles: "120°", hybridization: "sp²" },
  "3-1": { geometry: "угловая", angles: "< 120°", hybridization: "sp²" },
  "4-0": { geometry: "тетраэдрическая", angles: "109,5°", hybridization: "sp³" },
  "4-1": { geometry: "тригонально-пирамидальная", angles: "≈ 107°", hybridization: "sp³" },
  "4-2": { geometry: "угловая", angles: "≈ 104,5°", hybridization: "sp³" },
  "5-0": { geometry: "тригонально-бипирамидальная", angles: "90° и 120°", hybridization: "sp³d" },
  "5-1": { geometry: "«качели»", angles: "≈ 89° и 117°", hybridization: "sp³d" },
  "5-2": { geometry: "Т-образная", angles: "≈ 87°", hybridization: "sp³d" },
  "5-3": { geometry: "линейная", angles: "180°", hybridization: "sp³d" },
  "6-0": { geometry: "октаэдрическая", angles: "90°", hybridization: "sp³d²" },
  "6-1": { geometry: "квадратно-пирамидальная", angles: "≈ 85°", hybridization: "sp³d²" },
  "6-2": { geometry: "квадратная плоская", angles: "90°", hybridization: "sp³d²" },
  "7-0": { geometry: "пентагонально-бипирамидальная", angles: "72° и 90°", hybridization: "sp³d³" },
};

const AROMATIC: Shape = { geometry: "плоская (ароматическая)", angles: "≈ 120°", hybridization: "sp²" };

type UstAtom = { z?: number; chg?: number; impHs?: number; nRad?: number };
type UstBond = { atoms?: number[]; bo?: number };
type UstDocument = {
  defaults?: { atom?: UstAtom; bond?: { bo?: number } };
  molecules?: Array<{ atoms?: UstAtom[]; bonds?: UstBond[] }>;
};

function countNeighbors(bonds: UstBond[], atoms: UstAtom[], index: number): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const bond of bonds) {
    const pair = bond.atoms || [];
    if (pair[0] !== index && pair[1] !== index) continue;
    const other = pair[0] === index ? pair[1] : pair[0];
    const symbol = SYMBOLS[atoms[other]?.z ?? 6] || "?";
    counts[symbol] = (counts[symbol] || 0) + 1;
  }
  return counts;
}

export function analyzeVsepr(ustJson: string, aromaticAtoms: number[] = []): VseprReport {
  const document = JSON.parse(ustJson) as UstDocument;
  const molecule = document.molecules?.[0];
  const atoms = molecule?.atoms || [];
  const bonds = molecule?.bonds || [];
  if (!atoms.length) throw new Error("В структуре нет атомов");

  const atomDefaults = document.defaults?.atom || {};
  const bondDefault = document.defaults?.bond?.bo ?? 1;
  const aromatic = new Set(aromaticAtoms);
  const result: VseprAtom[] = [];
  let skipped = 0;

  for (let index = 0; index < atoms.length; index += 1) {
    const atom = atoms[index];
    const z = atom.z ?? atomDefaults.z ?? 6;
    const symbol = SYMBOLS[z];
    const valence = VALENCE[z];
    const charge = atom.chg ?? atomDefaults.chg ?? 0;
    const implicitH = atom.impHs ?? atomDefaults.impHs ?? 0;
    if (!symbol || valence == null) { skipped += 1; continue; }

    const own = bonds.filter((bond) => (bond.atoms || []).includes(index));
    const sigmaBonds = own.length + implicitH;
    // Терминальные атомы (H, =O, –Cl) не центр стереохимии.
    if (sigmaBonds < 2) continue;

    const neighborCounts = countNeighbors(bonds, atoms, index);
    if (implicitH > 0) neighborCounts.H = (neighborCounts.H || 0) + implicitH;
    const neighbors = Object.entries(neighborCounts)
      .map(([key, count]) => (count > 1 ? `${key}×${count}` : key))
      .join(", ");

    if (aromatic.has(index)) {
      result.push({
        index, symbol, neighbors, sigmaBonds, lonePairs: null,
        stericNumber: sigmaBonds, ...AROMATIC, aromatic: true,
      });
      continue;
    }

    const bondOrderSum = own.reduce((sum, bond) => sum + (bond.bo ?? bondDefault), 0) + implicitH;
    const lonePairs = (valence - charge - bondOrderSum) / 2;
    if (!Number.isInteger(lonePairs) || lonePairs < 0) { skipped += 1; continue; }
    const stericNumber = sigmaBonds + lonePairs;
    const shape = SHAPES[`${stericNumber}-${lonePairs}`];
    if (!shape) { skipped += 1; continue; }

    result.push({
      index, symbol, neighbors, sigmaBonds, lonePairs,
      stericNumber, ...shape, aromatic: false,
    });
  }

  const notes = [
    "Оценка по числу σ-связей и неподелённых пар (VSEPR); резонанс в амидах и карбоксилатах модель не учитывает.",
  ];
  if (skipped > 0) notes.push(`Атомов вне модели (металлы, радикалы, редкие элементы): ${skipped}.`);

  return { atoms: result, notes };
}
