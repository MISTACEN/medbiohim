/**
 * Общие куски диагностикума: загрузка препаратов и попыток, коды ошибок.
 *
 * Вынесено из `index.ts`, чтобы каждый файл маршрутов оставался в
 * архитектурном бюджете и читался целиком.
 */
import type { AuthVariables } from "../../middleware/auth";
import type { AnswerKey, CardRow, DiagnosticumMode, GuideRow } from "./model";

export const MODE_LABELS: Record<DiagnosticumMode, string> = {
  identify: "Определи препарат",
  structures: "Найди структуры",
  differential: "Отличи похожие",
  complex: "Разбор препарата",
  schema: "Схема препарата",
  exam: "Экзамен",
  electronogram: "Электронограмма",
};

export type SupabaseError = { code?: string; message?: string } | null;

export function isMissingTable(error: SupabaseError): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}

/**
 * Нарушение check-ограничения (SQLSTATE 23514). Для `diagnosticum_attempts.mode`
 * это значит, что новая миграция режимов ещё не применена: сообщение должно
 * говорить об этом, а не «БД недоступна».
 */
export function isConstraintViolation(error: SupabaseError): boolean {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  return String(error.code || "") === "23514" || message.includes("violates check constraint");
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Bank = {
  guides: GuideRow[];
  cards: CardRow[];
  structureTitles: Record<string, string>;
};

type Client = AuthVariables["supabase"];

/** Словарь диагностических структур: по нему подсказки и варианты получают подписи. */
export async function loadStructureTitles(client: Client): Promise<Record<string, string>> {
  const { data } = await client.from("preparation_structures").select("slug,title");
  const titles: Record<string, string> = {};
  for (const row of data || []) {
    titles[String((row as { slug?: string }).slug || "")] = String(
      (row as { title?: string }).title || "",
    );
  }
  return titles;
}

/** Загружает препараты, изображения и словарь структур для генерации задания. */
export async function loadBank(
  client: Client,
  rid: string,
): Promise<{ bank: Bank } | { error: "NOT_MIGRATED" | "DB_UNAVAILABLE" }> {
  const guidesQuery = await client.from("preparation_guides").select("*").order("section");
  if (guidesQuery.error) {
    if (isMissingTable(guidesQuery.error)) return { error: "NOT_MIGRATED" };
    console.error("[diagnosticum:guides]", guidesQuery.error.message, rid);
    return { error: "DB_UNAVAILABLE" };
  }

  const [cardsQuery, structureTitles] = await Promise.all([
    client
      .from("trainer_feed_cards")
      // `plan_topic_title` — алиас в RPC/вьюхе (`tt.title AS plan_topic_title`),
      // а не колонка `trainer_feed_cards`; в select на таблицу его быть не должно.
      .select("id,preparation,mode_set,is_published")
      .eq("subject_slug", "histology")
      .limit(800),
    loadStructureTitles(client),
  ]);

  if (cardsQuery.error) {
    console.error("[diagnosticum:cards]", cardsQuery.error.message, rid);
    return { error: "DB_UNAVAILABLE" };
  }

  const cards = (cardsQuery.data || []).filter(
    (row) => (row as { is_published?: boolean }).is_published !== false,
  ) as CardRow[];

  return { bank: { guides: (guidesQuery.data || []) as GuideRow[], cards, structureTitles } };
}

export type AttemptRow = {
  id: string;
  mode: DiagnosticumMode;
  section: string | null;
  guide_key: string;
  /** Форма как в /start: готовый AnswerKey ({parts: {...}}), не отдельные части. */
  answers: AnswerKey;
  hints: number[] | null;
  hints_used: number | null;
  answered_at: string | null;
  created_at: string;
};

/**
 * Попытка читается service-клиентом: колонка `answers` намеренно не выдана
 * грантами `authenticated`, поэтому user-клиент ловил permission denied
 * на колонке, и /hint с /answer маскировали это в NOT_FOUND (только на
 * реальной БД). Владение строкой проверяем явным user_id — эквивалент RLS
 * «только свои попытки» без обхода границы.
 */
export async function loadAttempt(
  client: Client,
  id: string,
  userId: string,
): Promise<{ row: AttemptRow } | { error: "NOT_FOUND" | "DB_UNAVAILABLE" }> {
  const { data, error } = await client
    .from("diagnosticum_attempts")
    .select("id,mode,section,guide_key,answers,hints,hints_used,answered_at,created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    if (error && !isMissingTable(error)) console.error("[diagnosticum:attempt]", error.message);
    return { error: error && isMissingTable(error) ? "DB_UNAVAILABLE" : "NOT_FOUND" };
  }
  return { row: data as AttemptRow };
}
