/**
 * GET /diagnosticum/stats — сводка по своим попыткам и слабые разделы.
 *
 * Вынесено из `session.ts`, чтобы файл маршрутов оставался в архитектурном
 * бюджете: обработчик только читает `diagnosticum_attempts` и ничего не меняет,
 * поэтому живёт отдельно от «хода попытки» (подсказки и ответ).
 */
import type { Context } from "hono";
import { ok, fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import type { AuthVariables } from "../../middleware/auth";
import type { Env } from "../../env";
import type { DiagnosticumMode } from "./model";
import { MODE_LABELS, isMissingTable, type SupabaseError } from "./shared";

type StatsRow = {
  mode: string;
  section: string | null;
  guide_key: string;
  correct: boolean | null;
  score: number | null;
  hints_used: number | null;
};

type LegacyRow = {
  status: string | null;
  score: number | null;
  total_questions: number | null;
  content_type: string | null;
};

/**
 * Сводка по старым тренировкам карточного движка (`trainings`).
 *
 * Отдельный блок: там процент по карточкам, здесь балл разбора. Складывать их в
 * один средний — значит показывать неправду. Ошибка чтения не ломает основную
 * статистику: блок просто помечается недоступным.
 */
async function legacySummary(c: Context<{ Bindings: Env; Variables: AuthVariables }>) {
  // Сервис-клиент с явным user_id: у `trainings` колоночные гранты и RLS завязаны
  // на RPC карточного движка, поэтому пользовательский клиент здесь не читает
  // таблицу. Владение проверяем сами — как в `/sessions/:id`.
  const service = createServiceClient(c.env);
  if (!service) return { available: false, total: 0, completed: 0, avg_percent: 0 };

  const { data, error } = await service
    .from("trainings")
    .select("status,score,total_questions,content_type")
    .eq("user_id", c.get("user").id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    if (!isMissingTable(error as SupabaseError)) {
      console.warn("[diagnosticum:stats:legacy]", error.message);
    }
    return { available: false, total: 0, completed: 0, avg_percent: 0 };
  }

  const rows = (data || []) as LegacyRow[];
  const completed = rows.filter((row) => String(row.status) === "completed");
  const percents = completed.map((row) => {
    const score = Number(row.score || 0);
    const total = Number(row.total_questions || 0);
    // `score` у старого движка уже процент (0…100) в завершённых тренировках,
    // но старые строки могли хранить число верных ответов. Различаем по шкале,
    // чтобы не получить «854 %».
    if (score <= 100) return Math.round(score);
    return total > 0 ? Math.round((score / total) * 100) : Math.round(score);
  });
  const avgPercent = percents.length
    ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length)
    : 0;

  return { available: true, total: rows.length, completed: completed.length, avg_percent: avgPercent };
}

export async function stats(c: Context<{ Bindings: Env; Variables: AuthVariables }>) {
  const rid = requestId();
  const { data, error } = await c
    .get("supabase")
    .from("diagnosticum_attempts")
    .select("mode,section,guide_key,correct,score,hints_used")
    .not("answered_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    if (isMissingTable(error as SupabaseError)) {
      return c.json(ok({ migrated: false, answered: 0 }, rid));
    }
    console.error("[diagnosticum:stats]", error.message, rid);
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Статистика недоступна", 503, rid);
    return c.json(errorBody, status as 503);
  }

  const rows = (data || []) as StatsRow[];
  const answered = rows.length;
  const correct = rows.filter((row) => row.correct).length;
  const hints = rows.reduce((sum, row) => sum + Number(row.hints_used || 0), 0);
  const avgScore = answered
    ? Math.round(rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / answered)
    : 0;

  const bySection = new Map<string, { section: string; total: number; correct: number }>();
  const byMode = new Map<string, { mode: string; total: number; correct: number }>();
  for (const row of rows) {
    const section = String(row.section || "Без раздела");
    const sectionEntry = bySection.get(section) ?? { section, total: 0, correct: 0 };
    sectionEntry.total += 1;
    if (row.correct) sectionEntry.correct += 1;
    bySection.set(section, sectionEntry);

    const modeEntry = byMode.get(row.mode) ?? { mode: row.mode, total: 0, correct: 0 };
    modeEntry.total += 1;
    if (row.correct) modeEntry.correct += 1;
    byMode.set(row.mode, modeEntry);
  }

  const withRate = <T extends { total: number; correct: number }>(entry: T) => ({
    ...entry,
    correct_rate: Math.round((entry.correct / entry.total) * 100),
  });

  const sections = Array.from(bySection.values()).map(withRate);
  const weakSections = [...sections]
    .filter((entry) => entry.total >= 2)
    .sort((a, b) => a.correct_rate - b.correct_rate)
    .slice(0, 3)
    .map((entry) => entry.section);

  // Старые тренировки карточного движка: отдельный блок, а не общий счётчик.
  // Смешивать две разные шкалы (процент карточек и балл разбора) нельзя,
  // поэтому «ранние» показываем отдельно и честно называем источник.
  const legacy = await legacySummary(c);

  return c.json(
    ok(
      {
        migrated: true,
        answered,
        correct,
        correct_rate: answered ? Math.round((correct / answered) * 100) : 0,
        avg_score: avgScore,
        hints,
        by_mode: Array.from(byMode.values()).map((entry) => ({
          ...withRate(entry),
          title: MODE_LABELS[entry.mode as DiagnosticumMode] || entry.mode,
        })),
        by_section: sections,
        weak_sections: weakSections,
        // Ранние тренировки карточного движка: свои числа, своя шкала.
        legacy,
      },
      rid,
    ),
  );
}