/**
 * История серий диагностикума.
 *
 * Раньше завершённую серию можно было открыть только сразу после финиша: список
 * серий не отдавался, и в «Истории» висели лишь старые тренировки карточного
 * движка. Теперь у серии есть короткая карточка для списка, а сам разбор
 * по-прежнему читается через `GET /diagnosticum/sessions/:id`.
 */
import { Hono } from "hono";
import { ok, fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import { requireAuth, type AuthVariables } from "../../middleware/auth";
import type { Env } from "../../env";
import { isMissingTable } from "./shared";
import { MODE_LABELS } from "./shared";
import type { DiagnosticumMode } from "./model";

const list = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const LIMIT = 40;

type SessionRow = {
  id: string;
  mode: string;
  section: string | null;
  status: string;
  score: number | null;
  correct_count: number | null;
  total_count: number | null;
  timer_sec: number | null;
  created_at: string | null;
  finished_at: string | null;
};

/** GET /diagnosticum/sessions — свои серии, новые сверху. */
list.get("/sessions", requireAuth, async (c) => {
  const rid = requestId();
  const service = createServiceClient(c.env);
  if (!service) {
    const { body, status } = fail("DB_UNAVAILABLE", "Сервис данных недоступен", 503, rid);
    return c.json(body, status as 503);
  }

  const { data, error } = await service
    .from("diagnosticum_sessions")
    .select("id,mode,section,status,score,correct_count,total_count,timer_sec,created_at,finished_at")
    .eq("user_id", c.get("user").id)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    if (isMissingTable(error)) {
      // Миграция серий ещё не применена: пустая история — не ошибка.
      return c.json(ok({ items: [], total: 0, migrated: false }, rid));
    }
    console.error("[diagnosticum:sessions:list]", error.message, rid);
    const { body, status } = fail("DB_UNAVAILABLE", "История серий недоступна", 503, rid);
    return c.json(body, status as 503);
  }

  return c.json(
    ok(
      {
        migrated: true,
        total: (data || []).length,
        items: ((data || []) as SessionRow[]).map((row) => ({
          session_id: row.id,
          mode: row.mode,
          title: MODE_LABELS[row.mode as DiagnosticumMode] || row.mode,
          section: String(row.section || ""),
          status: row.status,
          total: Number(row.total_count ?? 0),
          score: row.score ?? null,
          correct_count: row.correct_count ?? null,
          timer_sec: row.timer_sec ?? null,
          created_at: row.created_at,
          finished_at: row.finished_at,
        })),
      },
      rid,
    ),
  );
});

export default list;
