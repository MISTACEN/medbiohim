/**
 * GET /diagnosticum/stats — сводка по своим попыткам и слабые разделы.
 *
 * Вынесено из `session.ts`, чтобы файл маршрутов оставался в архитектурном
 * бюджете: обработчик только читает `diagnosticum_attempts` и ничего не меняет,
 * поэтому живёт отдельно от «хода попытки» (подсказки и ответ).
 */
import type { Context } from "hono";
import { ok, fail, requestId } from "../../lib/response";
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
      },
      rid,
    ),
  );
}