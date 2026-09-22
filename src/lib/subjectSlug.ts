/**
 * Единые slug: каталог 2 курса, планы, банки билетов, SRS.
 * Только явные алиасы — без fuzzy (история медицины ≠ история России).
 */

export const SUBJECT_SLUG_ALIASES: Record<string, string[]> = {
  physiology: ["physiology"],
  histology: ["histology", "histology_cytology"],
  organic_chemistry: ["organic_chemistry", "chemistry_organic_physical"],
  chemistry_organic_physical: ["organic_chemistry", "chemistry_organic_physical"],
  optics: ["optics", "atomic_physics"],
  informatics: ["informatics", "medical_informatics"],
  it_health: ["it_health", "it_healthcare"],
  probability: ["probability", "probability_statistics"],
  history_medicine: ["history_medicine"],
  philosophy: ["philosophy"],
  first_aid: ["first_aid"],
  physical_education: ["physical_education", "pe"],
  inorganic_chemistry: ["inorganic_chemistry"],
  biology: ["biology"],
  physics: ["physics"],
  math: ["math", "математический_анализ"],
  history: ["history", "history_russia"],
};

export const SUBJECT_HAS_TICKET_BANK: Record<string, boolean> = {
  physiology: true,
  organic_chemistry: true,
  chemistry_organic_physical: true,
  inorganic_chemistry: true,
  biology: true,
  physics: true,
  math: true,
  history: true,
  математический_анализ: true,
  histology: false,
  optics: false,
  informatics: false,
  it_health: false,
  probability: false,
  history_medicine: false,
  philosophy: false,
  first_aid: false,
  physical_education: false,
};

export function canonicalSubjectSlug(raw?: string | null): string {
  const s = (raw || "").trim();
  if (!s) return "";
  if (s === "chemistry_organic_physical") return "organic_chemistry";
  if (s === "histology_cytology") return "histology";
  return s;
}

export function subjectSlugMatches(a?: string | null, b?: string | null): boolean {
  const ca = canonicalSubjectSlug(a);
  const cb = canonicalSubjectSlug(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const listA = SUBJECT_SLUG_ALIASES[ca] || [ca];
  const listB = SUBJECT_SLUG_ALIASES[cb] || [cb];
  return listA.some((x) => listB.includes(x) || x === cb) || listB.some((x) => listA.includes(x) || x === ca);
}

export const CATALOG_ID_TO_SLUG: Record<string, string> = {
  "sub-phys": "physiology",
  "sub-gist": "histology",
  "sub-org": "organic_chemistry",
  "sub-opt": "optics",
  "sub-inf": "informatics",
  "sub-it": "it_health",
  "sub-tv": "probability",
  "sub-hist": "history_medicine",
  "sub-phil": "philosophy",
  "sub-pmp": "first_aid",
  "sub-pe": "physical_education",
};

export function resolveSubjectSlug(idOrSlug?: string | null, name?: string | null): string {
  const raw = (idOrSlug || "").trim();
  if (CATALOG_ID_TO_SLUG[raw]) return CATALOG_ID_TO_SLUG[raw];
  if (raw && !raw.startsWith("sub-")) return canonicalSubjectSlug(raw);
  const n = (name || "").toLowerCase();
  if (n.includes("гистол") || n.includes("цитолог")) return "histology";
  if (n.includes("неорган")) return "inorganic_chemistry";
  if (n.includes("органическ") || (n.includes("физическ") && n.includes("хим"))) return "organic_chemistry";
  if (n.includes("физиолог")) return "physiology";
  if (n.includes("оптик") || n.includes("атомн")) return "optics";
  if (n.includes("информатик") && !n.includes("технолог")) return "informatics";
  if (n.includes("информационн") && n.includes("здрав")) return "it_health";
  if (n.includes("вероятн") || n.includes("статистик")) return "probability";
  if (n.includes("истори") && n.includes("медицин")) return "history_medicine";
  if (n.includes("философ")) return "philosophy";
  if (n.includes("перв") && n.includes("помощ")) return "first_aid";
  if (n.includes("физическ") && n.includes("культур")) return "physical_education";
  if (n.includes("биологи")) return "biology";
  if (n.includes("истори") && n.includes("росси")) return "history";
  return canonicalSubjectSlug(raw);
}

export function ticketBankAvailable(slug?: string | null): boolean {
  const s = resolveSubjectSlug(slug) || (slug || "");
  if (SUBJECT_HAS_TICKET_BANK[s] === true) return true;
  if (SUBJECT_HAS_TICKET_BANK[s] === false) return false;
  return false;
}
