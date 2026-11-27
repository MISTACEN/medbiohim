/**
 * Модель серверной серии диагностикума: сборка вопросов, разбор и загрузка.
 *
 * Вынесено из `sessions.ts`, чтобы маршрутный файл оставался в архитектурном
 * бюджете. Здесь нет Hono — только правила отбора и чтения сессии.
 */
import { createServiceClient } from "../../lib/supabase";
import {
  MIN_MATCH_LENGTH,
  preparationContains,
  preparationKey,
  preparationNames,
} from "../../../../../src/shared/histology/preparation-match";
import {
  DIAGNOSTICUM_MODES,
  buildElectronogramQuestion,
  buildQuestion,
  hasImage,
  normalizeName,
  shuffle,
  type AnswerKey,
  type CardRow,
  type DiagnosticumMode,
  type GuideRow,
  type Question,
} from "./model";
import type { Bank } from "./shared";
import { FIRST_DIAGNOSTICUM, isSetSection, setGuides } from "./sets";

/** Потолок серии: 30 вопросов — предел и для экзамена, и для «своей серии». */
export const MAX_SESSION_LENGTH = 30;
export const DEFAULT_SESSION_LENGTH = 10;

export type SeriesItem = {
  section: string;
  guideKey: string;
  question: Question;
  answers: AnswerKey;
};

export function isMode(value: unknown): value is DiagnosticumMode {
  return typeof value === "string" && (DIAGNOSTICUM_MODES as string[]).includes(value);
}

/**
 * Собирает серию из банка: один препарат — один вопрос, без повторов.
 *
 * Пул тот же, что у одиночного старта (набор первой диагностики, раздел или
 * весь банк), поэтому серия и одиночное задание не расходятся по правилам.
 */
export function buildSeries(
  bank: Bank,
  mode: DiagnosticumMode,
  section: string,
  length: number,
): SeriesItem[] {
  const items: SeriesItem[] = [];
  const used = new Set<string>();

  if (mode === "electronogram") {
    for (const card of shuffle(bank.cards, Math.random)) {
      if (items.length >= length) break;
      if (card.mode_set !== "electronogram") continue;
      const built = buildElectronogramQuestion([card]);
      if (!built || used.has(built.guideKey)) continue;
      used.add(built.guideKey);
      items.push(built);
    }
    return items;
  }

  const setRequested = isSetSection(FIRST_DIAGNOSTICUM, section);
  const pool = setRequested
    ? setGuides(FIRST_DIAGNOSTICUM, bank.guides).guides
    : section
      ? bank.guides.filter((guide) => normalizeName(guide.section) === normalizeName(section))
      : bank.guides;

  for (const guide of shuffle(pool, Math.random)) {
    if (items.length >= length) break;
    if (used.has(guide.key)) continue;
    const built = buildQuestion({
      guide,
      guides: bank.guides,
      cards: bank.cards,
      mode,
      structureTitles: bank.structureTitles,
    });
    if (!built) continue;
    used.add(guide.key);
    items.push({
      section: setRequested ? FIRST_DIAGNOSTICUM.title : String(guide.section || ""),
      guideKey: guide.key,
      question: built.question,
      answers: built.answers,
    });
  }
  return items;
}

/** Гид для конкретной карточки: сначала точное имя, затем вхождение названия. */
function guideForCard(guides: GuideRow[], card: CardRow): GuideRow | undefined {
  const name = preparationKey(card.preparation?.name);
  if (!name) return undefined;
  const exact = guides.find((guide) => preparationNames(guide).includes(name));
  if (exact) return exact;
  return guides.find((guide) =>
    preparationNames(guide).some(
      (candidate) => candidate.length >= MIN_MATCH_LENGTH && preparationContains(candidate, name),
    ),
  );
}

/**
 * «Своя серия»: вопросы строятся ровно по выбранным карточкам, в их порядке.
 *
 * Карточки без изображения, электронограммы и карточки без методички не
 * подменяются другими — они возвращаются в `missing`, чтобы клиент честно
 * сказал, что часть выбора недоступна.
 */
export function buildCardSeries(
  bank: Bank,
  cardIds: string[],
  mode: DiagnosticumMode,
): { items: SeriesItem[]; missing: string[] } {
  const items: SeriesItem[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const id of cardIds.slice(0, MAX_SESSION_LENGTH)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const card = bank.cards.find((entry) => String(entry.id || "") === id);
    if (!card || card.mode_set === "electronogram" || !hasImage(card)) {
      missing.push(id);
      continue;
    }
    const guide = guideForCard(bank.guides, card);
    if (!guide) {
      missing.push(id);
      continue;
    }
    const built = buildQuestion({
      guide,
      guides: bank.guides,
      cards: bank.cards,
      mode,
      structureTitles: bank.structureTitles,
      card,
    });
    if (!built) {
      missing.push(id);
      continue;
    }
    items.push({ section: "Своя серия", guideKey: guide.key, question: built.question, answers: built.answers });
  }

  return { items, missing };
}

export type AttemptRow = {
  id: string;
  session_index: number | null;
  guide_key: string | null;
  section: string | null;
  question: Question | null;
  answers: { parts?: Record<string, { correct?: string[]; explanation?: string }> } | null;
  feedback: { parts?: unknown } | null;
  correct: boolean | null;
  score: number | null;
  answered_at: string | null;
};

/** Разбор попытки: эталон отдаётся только после завершения серии. */
export function reviewOf(row: AttemptRow) {
  const parts = row.feedback && Array.isArray(row.feedback.parts) ? row.feedback.parts : [];
  return {
    attempt_id: row.id,
    index: Number(row.session_index ?? 0),
    guide_key: String(row.guide_key || ""),
    section: String(row.section || ""),
    question: row.question,
    answered: Boolean(row.answered_at),
    correct: row.correct === true,
    score: Number(row.score ?? 0),
    parts,
    answers: row.answers?.parts ?? {},
  };
}

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

/** Загружает сессию владельца; чужая сессия неотличима от несуществующей. */
export async function loadOwnedSession(
  service: ServiceClient,
  sessionId: string,
  userId: string,
) {
  const found = await service
    .from("diagnosticum_sessions")
    .select("id,user_id,mode,section,timer_sec,status,score,correct_count,total_count,created_at,finished_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (found.error || !found.data) return { error: "NOT_FOUND" as const };
  if (String(found.data.user_id) !== userId) return { error: "NOT_FOUND" as const };

  const attempts = await service
    .from("diagnosticum_attempts")
    .select("id,session_index,guide_key,section,question,answers,feedback,correct,score,answered_at")
    .eq("session_id", sessionId)
    .order("session_index", { ascending: true });
  if (attempts.error) return { error: "DB_UNAVAILABLE" as const };

  return { session: found.data, attempts: (attempts.data || []) as AttemptRow[] };
}
