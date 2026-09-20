/** Feature API: tutor, calculators, search, SRS — extends core client. */
import { api } from "./api";

/* —— Tutor (RAG) —— */
export type TutorSource = {
  id: string;
  subject: string;
  topic: string;
  title: string;
  source: string;
  score: number;
  excerpt: string;
};
export type TutorAnswer = {
  answer: string;
  mode: string;
  sources: TutorSource[];
  subject_filter?: string | null;
  model?: string | null;
  retrieved: number;
};
export async function tutorMeta() {
  return api<{
    index: { chunks: number; subjects: number; by_source?: Record<string, number> };
    llm_enabled: boolean;
    model?: string | null;
    subjects: Array<{ subject: string; subject_slug: string; chunks: number }>;
  }>("/tutor/meta");
}
export async function tutorAsk(
  question: string,
  opts?: { subject_slug?: string; history?: Array<{ role: string; content: string }>; top_k?: number }
) {
  return api<TutorAnswer>("/tutor/ask", {
    method: "POST",
    body: JSON.stringify({
      question,
      subject_slug: opts?.subject_slug || undefined,
      history: opts?.history || [],
      top_k: opts?.top_k ?? 6,
    }),
  });
}

/* —— Calculators —— */
export type CalcField = {
  key: string;
  label: string;
  type: "number" | "select";
  min?: number;
  max?: number;
  step?: number;
  default?: string | number;
  optional?: boolean;
  options?: Array<{ value: string; label: string }>;
};
export type CalculatorDef = {
  id: string;
  name: string;
  category: string;
  description: string;
  fields: CalcField[];
};
export async function listCalculators() {
  return api<{
    items: CalculatorDef[];
    categories: Record<string, Array<{ id: string; name: string; category: string; description: string }>>;
    count: number;
  }>("/calculators");
}
export async function getCalculator(id: string) {
  return api<{ calculator: CalculatorDef }>(`/calculators/${encodeURIComponent(id)}`);
}
export async function computeCalculator(id: string, input: Record<string, string | number>) {
  return api<{
    id: string;
    result: Record<string, unknown>;
    interpretation: string;
    warnings: string[];
  }>(`/calculators/${encodeURIComponent(id)}/compute`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/* —— Global search —— */
export type SearchHit = {
  id: string;
  title: string;
  snippet: string;
  subject: string;
  subject_slug: string;
  topic: string;
  type: string;
  score: number;
  has_answer: boolean;
  href: string;
};
export async function globalSearch(q: string, opts?: { limit?: number; subject_slug?: string; type?: string }) {
  const p = new URLSearchParams();
  p.set("q", q);
  if (opts?.limit) p.set("limit", String(opts.limit));
  if (opts?.subject_slug) p.set("subject_slug", opts.subject_slug);
  if (opts?.type) p.set("type", opts.type);
  return api<{
    query: string;
    total: number;
    items: SearchHit[];
    facets: { subjects: Array<{ subject: string; subject_slug: string; count: number }>; types: Record<string, number> };
  }>(`/search?${p.toString()}`);
}

/* —— SRS cards —— */
export type SrsCard = {
  id: string;
  front: string;
  back: string;
  subject: string;
  subject_slug: string;
  topic: string;
  source: string;
  ease: number;
  interval: number;
  reps: number;
  due_at: number;
  due_in_hours: number;
  reviewed_at?: string | null;
};
export type SrsSummary = {
  due: number;
  learning: number;
  total: number;
  new_available: number;
  subjects: Array<{ subject: string; subject_slug: string; count: number }>;
};
export async function srsSummary() {
  return api<SrsSummary>("/srs/summary");
}
export async function srsEnsure(count = 20, subject_slug?: string) {
  return api<{ added: number; total: number }>("/srs/ensure", {
    method: "POST",
    body: JSON.stringify({ count, subject_slug }),
  });
}
export async function srsDue(limit = 20, subject_slug?: string) {
  const p = new URLSearchParams();
  p.set("limit", String(limit));
  if (subject_slug) p.set("subject_slug", subject_slug);
  return api<{ items: SrsCard[]; count: number }>(`/srs/due?${p}`);
}
export async function srsReview(card_id: string, rating: 1 | 2 | 3 | 4) {
  return api<{ card: SrsCard; summary: SrsSummary }>("/srs/review", {
    method: "POST",
    body: JSON.stringify({ card_id, rating }),
  });
}
export async function srsAddCard(payload: {
  id?: string;
  front?: string;
  back?: string;
  subject?: string;
  subject_slug?: string;
  topic?: string;
}) {
  return api<{ card: SrsCard }>("/srs/cards", { method: "POST", body: JSON.stringify(payload) });
}
export async function srsListCards(limit = 100, subject_slug?: string) {
  const p = new URLSearchParams();
  p.set("limit", String(limit));
  if (subject_slug) p.set("subject_slug", subject_slug);
  return api<{ items: SrsCard[]; count: number }>(`/srs/cards?${p}`);
}
