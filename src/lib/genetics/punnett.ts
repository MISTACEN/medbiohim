/**
 * Тренажёр решётки Пеннета: чистая логика без зависимостей.
 *
 * Поддерживает моногибридное и дигибридное скрещивание при полном
 * доминировании (законы Менделя: единообразие F1, расщепление 3:1 и 9:3:3:1).
 * Рецессивные аллели сцепления, летальные гены и неполное доминирование
 * не моделируются.
 */

export type PunnettInput = {
  /** Генотип первого родителя, например "Aa" или "AaBb". */
  parentA: string;
  /** Генотип второго родителя, например "aa" или "aabb". */
  parentB: string;
};

export type PunnettGene = {
  /** Буква признака, например "A". */
  name: string;
  /** Доминантный и рецессивный аллели признака. */
  dominant: string;
  recessive: string;
  /** Аллели, реально присутствующие у родителя, в каноническом порядке. */
  alleles: [string, string];
};

export type PunnettGametes = {
  genes: PunnettGene[];
  gametesA: string[];
  gametesB: string[];
};

export type PunnettCount = {
  genotype: string;
  count: number;
  probability: number;
};

export type PunnettPhenotype = {
  phenotype: string;
  description: string;
  count: number;
  probability: number;
};

export type PunnettCell = {
  /** Гамета родителя A (строка). */
  gameteA: string;
  /** Гамета родителя B (столбец). */
  gameteB: string;
  /** Генотип потомка в канонической записи. */
  genotype: string;
};

export type PunnettOk = {
  ok: true;
  genes: PunnettGene[];
  gametesA: string[];
  gametesB: string[];
  grid: PunnettCell[][];
  genotypes: PunnettCount[];
  phenotypes: PunnettPhenotype[];
  offspringCount: number;
};

export type PunnettError = {
  ok: false;
  error: string;
};

export type PunnettResult = PunnettOk | PunnettError;

/**
 * Разбирает генотип из 1–2 пар аллелей: "Aa", "aa", "AaBb", "aabb".
 * Возвращает null и текст ошибки, если запись невалидна.
 */
export function parseGenotype(raw: string): { genes: PunnettGene[]; error?: string } | null {
  const text = raw.replace(/\s+/g, "");
  if (!text) return { genes: [], error: "Введите генотип, например Aa или AaBb." };
  if (!/^[A-Za-z]+$/.test(text)) {
    return { genes: [], error: "Генотип состоит только из латинских букв: Aa, aa, AaBb." };
  }
  if (text.length % 2 !== 0) {
    return { genes: [], error: "Каждый ген задаётся парой аллелей: Aa, aa, AaBb, aabb." };
  }
  if (text.length > 4) {
    return { genes: [], error: "Поддерживаются 1–2 гена: Aa или AaBb." };
  }

  const genes: PunnettGene[] = [];
  for (let index = 0; index < text.length; index += 2) {
    const first = text[index];
    const second = text[index + 1];
    const letter = first.toUpperCase();
    if (second.toUpperCase() !== letter) {
      return {
        genes: [],
        error: `Аллеи одного гена должны быть одной буквой: пара «${first}${second}» неверна.`,
      };
    }
    if (genes.some((gene) => gene.name === letter)) {
      return { genes: [], error: `Ген ${letter} встречается дважды.` };
    }
    const dominant = letter;
    const recessive = letter.toLowerCase();
    const alleles: [string, string] = first === second
      ? [first, second]
      : [dominant, recessive];
    genes.push({ name: letter, dominant, recessive, alleles });
  }
  return { genes };
}

/** Гаметы генотипа: по одной аллели из каждого гена, без повторов. */
export function gametesFor(genes: PunnettGene[]): string[] {
  let result: string[] = [""];
  for (const gene of genes) {
    const next: string[] = [];
    for (const prefix of result) {
      for (const allele of new Set(gene.alleles)) {
        next.push(prefix + allele);
      }
    }
    result = next;
  }
  // Канонический порядок гамет: доминантные аллели раньше рецессивных.
  return result.sort((a, b) => {
    const aScore = a.split("").filter((ch) => ch === ch.toUpperCase()).length;
    const bScore = b.split("").filter((ch) => ch === ch.toUpperCase()).length;
    if (bScore !== aScore) return bScore - aScore;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
}

/** Каноническая запись генотипа: доминантная аллель в паре первая. */
function canonical(genes: PunnettGene[], alleles: string[]): string {
  let genotype = "";
  genes.forEach((gene, index) => {
    const pair = [alleles[index], alleles[index + genes.length]];
    const ordered = pair[0] === gene.dominant
      ? [pair[0], pair[1]]
      : [pair[1], pair[0]];
    genotype += ordered.join("");
  });
  return genotype;
}

/** Фенотип потомка при полном доминировании: A_, aa. */
export function phenotypeFor(genes: PunnettGene[], genotype: string): {
  phenotype: string;
  description: string;
} {
  const phenotype: string[] = [];
  const description: string[] = [];
  genes.forEach((gene, index) => {
    const pair = genotype.slice(index * 2, index * 2 + 2);
    if (pair.includes(gene.dominant)) {
      phenotype.push(`${gene.name}_`);
      description.push(`${gene.name} — доминантный признак`);
    } else {
      phenotype.push(`${gene.recessive}${gene.recessive}`);
      description.push(`${gene.name}${gene.name} — рецессивный признак`);
    }
  });
  return { phenotype: phenotype.join(""), description: description.join("; ") };
}

/** Полное решение скрещивания: гаметы, решётка, генотипы и фенотипы. */
export function solvePunnett(input: PunnettInput): PunnettResult {
  const parsedA = parseGenotype(input.parentA);
  if (parsedA?.error) return { ok: false, error: `Родитель 1: ${parsedA.error}` };
  const parsedB = parseGenotype(input.parentB);
  if (parsedB?.error) return { ok: false, error: `Родитель 2: ${parsedB.error}` };
  if (!parsedA || !parsedB) return { ok: false, error: "Введите оба генотипа." };

  const genesA = parsedA.genes;
  const genesB = parsedB.genes;
  if (genesA.length !== genesB.length) {
    return {
      ok: false,
      error: "Число генов у родителей должно совпадать: скрещивайте Aa с aa, AaBb с aabb и т. п.",
    };
  }
  for (let index = 0; index < genesA.length; index += 1) {
    if (genesA[index].name !== genesB[index].name) {
      return {
        ok: false,
        error: `Позиция ${index + 1}: ген ${genesA[index].name} у родителя 1 не совпадает с геном ${genesB[index].name} у родителя 2.`,
      };
    }
  }

  const genes = genesA;
  const gametesA = gametesFor(genesA);
  const gametesB = gametesFor(genesB);
  const grid: PunnettCell[][] = gametesA.map((gameteA) =>
    gametesB.map((gameteB) => {
      const alleles = gameteA.split("").concat(gameteB.split(""));
      return {
        gameteA,
        gameteB,
        genotype: canonical(genes, alleles),
      };
    }),
  );

  const genotypeCounts = new Map<string, number>();
  for (const row of grid) {
    for (const cell of row) {
      genotypeCounts.set(cell.genotype, (genotypeCounts.get(cell.genotype) ?? 0) + 1);
    }
  }
  const offspringCount = gametesA.length * gametesB.length;
  const genotypes: PunnettCount[] = [...genotypeCounts.entries()]
    .map(([genotype, count]) => ({
      genotype,
      count,
      probability: (count / offspringCount) * 100,
    }))
    .sort((a, b) => a.genotype.localeCompare(b.genotype));

  const phenotypeMap = new Map<string, { description: string; count: number }>();
  for (const [genotype, count] of genotypeCounts) {
    const { phenotype, description } = phenotypeFor(genes, genotype);
    const existing = phenotypeMap.get(phenotype);
    phenotypeMap.set(phenotype, {
      description,
      count: (existing?.count ?? 0) + count,
    });
  }
  const phenotypes: PunnettPhenotype[] = [...phenotypeMap.entries()]
    .map(([phenotype, value]) => ({
      phenotype,
      description: value.description,
      count: value.count,
      probability: (value.count / offspringCount) * 100,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    ok: true,
    genes,
    gametesA,
    gametesB,
    grid,
    genotypes,
    phenotypes,
    offspringCount,
  };
}
