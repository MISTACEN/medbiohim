import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const progress = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
progress.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const [subjects, topics] = await Promise.all([
      supabase
        .from("user_subject_progress")
        .select("user_id,subject_id,percent,completed_topics_count,last_activity_at,updated_at")
        .eq("user_id", user.id)
        .limit(200),
      supabase
        .from("user_topic_progress")
        .select("user_id,topic_id,status,percent,last_activity_at")
        .eq("user_id", user.id)
        .limit(500),
    ]);
    if (subjects.error && topics.error) {
      console.error("[progress:read]", { subjectError: subjects.error.message, topicError: topics.error.message });
      const { body, status } = fail("DB_UNAVAILABLE", "Прогресс недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({
      items: subjects.data || [],
      topics: topics.data || [],
      summary: {
        subjects_count: (subjects.data || []).length,
        topics_count: (topics.data || []).length,
        completed_topics_count: (subjects.data || []).reduce((sum, row) => sum + Number(row.completed_topics_count || 0), 0),
      },
    }, rid));
  } catch (error) {
    console.error("[progress:read]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Прогресс недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

/**
 * FA3 (прогресс v2): сводка «что подтянуть» из уже пишущихся данных.
 * По предметам: точность тестов (средний percent завершённых попыток),
 * точность тренажёра (slug из карточек), посещаемость (attendance_records
 * по занятиям предмета), SRS (всего/к повтору). Плюс активность за 30 дней
 * по датам попыток и ответов тренажёра. Данные независимы: если какой-то
 * источник пуст, его вклад просто отсутствует.
 */
progress.get("/summary", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const [attemptsRes, answersRes, attendanceRes, srsRes] = await Promise.all([
      supabase.from("test_attempts")
        .select("test_id,percent,status,started_at,tests(subject_id)")
        .eq("user_id", user.id)
        .eq("status", "submitted")
        .gte("started_at", new Date(Date.now() - 90 * 86400000).toISOString())
        .limit(1000),
      supabase.from("trainer_feed_answers")
        .select("card_id,is_correct,is_skipped,created_at")
        .eq("user_id", user.id)
        .gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString())
        .limit(5000),
      supabase.from("attendance_records")
        .select("schedule_entry_id,status,schedule_entries(subject_id)")
        .eq("user_id", user.id)
        .limit(2000),
      supabase.from("srs_cards")
        .select("subject_id,subject_slug,due_at")
        .eq("user_id", user.id)
        .limit(2000),
    ]);
    if (attemptsRes.error && answersRes.error) {
      console.error("[progress:summary]", { attempts: attemptsRes.error, answers: answersRes.error });
      const { body, status } = fail("DB_UNAVAILABLE", "Сводка прогресса недоступна", 503, rid);
      return c.json(body, status as 503);
    }

    const subjectIds = new Set<string>();
    const testAgg = new Map<string, { attempts: number; percentSum: number }>();
    for (const row of attemptsRes.data || []) {
      const subjectId = String((row as any).tests?.subject_id || "");
      if (!subjectId) continue;
      subjectIds.add(subjectId);
      const agg = testAgg.get(subjectId) || { attempts: 0, percentSum: 0 };
      agg.attempts += 1;
      agg.percentSum += Number(row.percent || 0);
      testAgg.set(subjectId, agg);
    }

    // Тренажёр хранит slug предмета — резолвим в subject_id.
    const trainerAgg = new Map<string, { answered: number; correct: number }>();
    const cardIds = Array.from(new Set((answersRes.data || []).map((row: any) => String(row.card_id))));
    if (cardIds.length) {
      const { data: cards } = await supabase.from("trainer_feed_cards").select("id,subject_slug").in("id", cardIds).limit(500);
      const slugByCard = new Map((cards || []).map((row: any) => [String(row.id), String(row.subject_slug || "")]));
      const slugs = Array.from(new Set(Array.from(slugByCard.values()).filter(Boolean)));
      if (slugs.length) {
        const { data: slugSubjects } = await supabase.from("subjects").select("id,slug").in("slug", slugs).limit(500);
        const idBySlug = new Map((slugSubjects || []).map((row: any) => [String(row.slug), String(row.id)]));
        for (const row of answersRes.data || []) {
          if (row.is_skipped === true) continue;
          const subjectId = idBySlug.get(slugByCard.get(String(row.card_id)) || "");
          if (!subjectId) continue;
          subjectIds.add(subjectId);
          const agg = trainerAgg.get(subjectId) || { answered: 0, correct: 0 };
          agg.answered += 1;
          if (row.is_correct === true) agg.correct += 1;
          trainerAgg.set(subjectId, agg);
        }
      }
    }

    // Посещаемость по предметам: статус занятия — явный факт самоотчёта.
    const attendanceAgg = new Map<string, { present: number; total: number }>();
    for (const row of attendanceRes.data || []) {
      const subjectId = String((row as any).schedule_entries?.subject_id || "");
      if (!subjectId) continue;
      subjectIds.add(subjectId);
      const agg = attendanceAgg.get(subjectId) || { present: 0, total: 0 };
      agg.total += 1;
      if (String(row.status) === "present") agg.present += 1;
      attendanceAgg.set(subjectId, agg);
    }

    const srsAgg = new Map<string, { total: number; due: number }>();
    let srsTotal = 0;
    let srsDue = 0;
    const nowIso = new Date().toISOString();
    for (const row of srsRes.data || []) {
      const subjectId = String(row.subject_id || "");
      srsTotal += 1;
      const due = Boolean(row.due_at && row.due_at <= nowIso);
      if (due) srsDue += 1;
      if (!subjectId) continue;
      const agg = srsAgg.get(subjectId) || { total: 0, due: 0 };
      agg.total += 1;
      if (due) agg.due += 1;
      srsAgg.set(subjectId, agg);
    }

    const subjectIdList = Array.from(subjectIds);
    const { data: subjectRows } = subjectIdList.length
      ? await supabase.from("subjects").select("id,name,slug").in("id", subjectIdList).limit(500)
      : { data: [] };
    const nameById = new Map((subjectRows || []).map((row: any) => [String(row.id), { name: row.name, slug: row.slug }]));

    const subjectsOut = subjectIdList.map((subjectId) => {
      const t = testAgg.get(subjectId);
      const tr = trainerAgg.get(subjectId);
      const at = attendanceAgg.get(subjectId);
      const srs = srsAgg.get(subjectId);
      const testAccuracy = t && t.attempts > 0 ? Math.round(t.percentSum / t.attempts) : null;
      const trainerAccuracy = tr && tr.answered > 0 ? Math.round((tr.correct / tr.answered) * 100) : null;
      return {
        subject_id: subjectId,
        name: nameById.get(subjectId)?.name || null,
        slug: nameById.get(subjectId)?.slug || null,
        test_attempts: t?.attempts || 0,
        test_accuracy: testAccuracy,
        trainer_answered: tr?.answered || 0,
        trainer_accuracy: trainerAccuracy,
        attendance: at && at.total > 0 ? { present: at.present, total: at.total, percent: Math.round((at.present / at.total) * 100) } : null,
        srs: srs ? srs : undefined,
      };
    }).sort((a, b) => (a.test_accuracy ?? a.trainer_accuracy ?? 101) - (b.test_accuracy ?? b.trainer_accuracy ?? 101));

    // «Что подтянуть»: предметы с низкой точностью, где есть данные.
    const focus = subjectsOut
      .filter((s) => {
        const accuracy = s.test_accuracy ?? s.trainer_accuracy;
        return accuracy != null && accuracy < 80;
      })
      .slice(0, 3)
      .map((s) => {
        const accuracy = s.test_accuracy ?? s.trainer_accuracy;
        const source = s.test_accuracy != null ? "тесты" : "тренажёр";
        return { subject_id: s.subject_id, name: s.name, slug: s.slug, accuracy, source };
      });

    // Активность за 30 дней по датам попыток и ответов тренажёра.
    const activity = new Map<string, number>();
    const pushActivity = (iso: string | null | undefined) => {
      if (!iso) return;
      const date = String(iso).slice(0, 10);
      if (date < new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)) return;
      activity.set(date, (activity.get(date) || 0) + 1);
    };
    for (const row of attemptsRes.data || []) pushActivity((row as any).started_at);
    for (const row of answersRes.data || []) pushActivity((row as any).created_at);
    const activity30 = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
      return { date, count: activity.get(date) || 0 };
    });

    return c.json(ok({
      subjects: subjectsOut,
      focus,
      activity30,
      srs: { total: srsTotal, due: srsDue },
    }, rid));
  } catch (error) {
    console.error("[progress:summary]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Сводка прогресса недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

export default progress;
