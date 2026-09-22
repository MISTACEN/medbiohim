/**
 * Единые slug предмета: каталог, планы, банки билетов, SRS.
 */

export const SUBJECT_SLUG_ALIASES: Record<string, string[]> = {
  organic_chemistry: ["organic_chemistry", "chemistry_organic_physical"],
  chemistry_organic_physical: ["organic_chemistry", "chemistry_organic_physical"],
  histology: ["histology", "histology_cytology"],
  histology_cytology: ["histology", "histology_cytology"],
  inorganic_chemistry: ["inorganic_chemistry"],
  physiology: ["physiology"],
  biology: ["biology"],
  physics: ["physics"],
  history: ["history", "history_russia"],
};

export function canonicalSubjectSlug(raw?: string | null): string {
  const s = (raw || "").trim();
  if (!s) return "";
  for (const [canon, list] of Object.entries(SUBJECT_SLUG_ALIASES)) {
    if (list.includes(s) || canon === s) return canon;
  }
  return s;
}

export function subjectSlugMatches(a?: string | null, b?: string | null): boolean {
  const ca = canonicalSubjectSlug(a);
  const cb = canonicalSubjectSlug(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const aliases = SUBJECT_SLUG_ALIASES[ca] || [ca];
  return aliases.includes(cb);
}

export const CATALOG_ID_TO_SLUG: Record<string, string> = {
  "sub-gist": "histology",
  "sub-org": "organic_chemistry",
  "sub-phys": "physiology",
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
  if (n.includes("гистол")) return "histology";
  if (n.includes("неорган")) return "inorganic_chemistry";
  if (n.includes("органическ") || n.includes("физическ")) return "organic_chemistry";
  if (n.includes("физиолог")) return "physiology";
  return canonicalSubjectSlug(raw);
}
