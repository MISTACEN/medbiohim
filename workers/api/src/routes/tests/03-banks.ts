import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { callerRoles, canAdminister, requireTeachingCapability } from "../../lib/permissions";
import { UUID, invalid, accessibleSubjectIds, recentAttemptTestIds } from "./shared";
import { normalizeQuestion, publicOptions } from "../../../../../integrations/cloudflare-api/src/question-format.js";

import type { TestsRouter } from "./types";

export function registerBankRoutes(tests: TestsRouter) {
tests.get("/preview/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный ID теста");
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  try {
    const { data, error } = await db.from("tests")
      .select("id,title,subject_id,module_id,topic_id,time_limit_sec,max_attempts,is_published,created_by,created_at,source_key,order_index,subjects(name,slug)")
      .eq("id", id).is("archived_at", null).maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Тест недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Тест не найден или не опубликован", 404, rid);
      return c.json(body, status as 404);
    }
    // Директива владельца 2026-11-08: превью — только автор теста или админ;
    // чужие тесты (в т.ч. каталогные) преподавателю больше не отдаются.
    const roles = await callerRoles(db, c.get("user").id);
    if (!canAdminister(roles) && String((data as any).created_by || "") !== c.get("user").id) {
      const { body, status } = fail("NOT_FOUND", "Тест не найден или не опубликован", 404, rid);
      return c.json(body, status as 404);
    }
    const { data: links, error: linkError } = await db.from("test_questions")
      .select("order_index,question:questions(id,subject_id,module_id,topic_id,type,text,answer,options,difficulty,is_published,archived_at,topic:topics(title))")
      .eq("test_id", id)
      .order("order_index", { ascending: true });
    if (linkError) {
      const { body, status } = fail("DB_UNAVAILABLE", "Состав теста временно недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    const subject = Array.isArray((data as any).subjects) ? (data as any).subjects[0] : (data as any).subjects;
    const test = {
      id: (data as any).id,
      title: (data as any).title,
      subject_id: (data as any).subject_id,
      subject_name: subject?.name || null,
      time_limit_sec: (data as any).time_limit_sec,
      max_attempts: (data as any).max_attempts,
      is_published: (data as any).is_published,
    };
    const questions = (links || []).flatMap((link: any) => {
      const q = Array.isArray(link.question) ? link.question[0] : link.question;
      if (!q || q.is_published !== true || q.archived_at != null) return [];
      const topic = Array.isArray(q.topic) ? q.topic[0] : q.topic;
      const normalized = normalizeQuestion({
        type: q.type,
        text: q.text,
        answer: q.answer,
        options: q.options,
      }, { extractTextOptions: true });
      // Эталон нужен автору всегда: это предпросмотр, а не попытка студента.
      return [{
        id: q.id,
        topic_title: topic?.title || null,
        type: normalized.type,
        text: normalized.text,
        is_closed: normalized.is_closed,
        options: publicOptions(normalized, true),
        option_count: normalized.options.length,
        allow_multiple: normalized.allow_multiple,
        requires_order: normalized.order_indexes.length > 0,
        difficulty: q.difficulty ?? null,
        answer: normalized.answer || null,
        answer_display: normalized.answer_display || "",
        answer_resolution: normalized.resolution,
        answer_indexes: normalized.correct_indexes,
      }];
    });
    return c.json(ok({ test, questions, mode: "author_preview" }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Тест недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.get("/recommended", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  try {
    const { data: progress, error: progressError } = await db
      .from("user_topic_progress")
      .select("topic_id,percent,status")
      .eq("user_id", user.id)
      .lt("percent", 60)
      .order("percent", { ascending: true })
      .limit(20);
    if (progressError) throw progressError;
    const weak = (progress || []).filter((row: any) => row.topic_id);
    if (!weak.length) return c.json(ok({ items: [], reason: "NO_PROGRESS" }, rid));
    const percentByTopic = new Map(weak.map((row: any) => [String(row.topic_id), Number(row.percent) || 0]));

    const { data: candidates, error: testsError } = await db
      .from("tests")
      .select("id,title,subject_id,topic_id,subjects(name,slug)")
      .eq("is_published", true)
      .is("archived_at", null)
      .in("topic_id", Array.from(percentByTopic.keys()))
      .limit(40);
    if (testsError) throw testsError;
    if (!candidates?.length) return c.json(ok({ items: [], reason: "NO_TESTS" }, rid));

    const allowed = await accessibleSubjectIds(db, user.id, candidates.map((row: any) => String(row.subject_id || "")));
    const recentIds = await recentAttemptTestIds(db, user.id, 3);

    const items = (candidates as any[])
      .filter((test) => !test.subject_id || allowed.has(String(test.subject_id)))
      .filter((test) => !recentIds.has(String(test.id)))
      .map((test) => {
        const percent = percentByTopic.get(String(test.topic_id)) ?? 0;
        const subject = Array.isArray(test.subjects) ? test.subjects[0] : test.subjects;
        return {
          test_id: String(test.id),
          title: String(test.title || "Тест"),
          subject_slug: subject?.slug ? String(subject.slug) : null,
          subject_name: subject?.name ? String(subject.name) : null,
          topic_id: String(test.topic_id || ""),
          percent: Math.round(percent),
          reason: `Тема освоена на ${Math.round(percent)}% — стоит закрепить`,
        };
      })
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 3);

    return c.json(ok({ items, reason: items.length ? "OK" : "ALL_RECENT" }, rid));
  } catch (error) {
    console.error("[tests:recommended]", error);
    const { body, status } = fail("RECOMMENDED_UNAVAILABLE", "Не удалось подобрать практику", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.get("/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user"), id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный ID теста");
  const bankView = c.req.query("view") === "bank";
  try {
    const { data, error } = await db.from("tests")
      .select("id,title,subject_id,module_id,topic_id,time_limit_sec,max_attempts,is_published,created_at,source_key,order_index")
      .eq("id", id).eq("is_published", true).is("archived_at", null).maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Тест недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Тест не найден или не опубликован", 404, rid);
      return c.json(body, status as 404);
    }
    if (data.subject_id) {
      const allowed = await accessibleSubjectIds(db, user.id, [String(data.subject_id)]);
      if (!allowed.has(String(data.subject_id))) {
        const { body, status } = fail("FORBIDDEN", "Этот тест недоступен для вашей специальности", 403, rid);
        return c.json(body, status as 403);
      }
    }
    const { data: links, error: linkError } = await db.from("test_questions")
      .select("order_index,question:questions(id,subject_id,module_id,topic_id,type,text,answer,options,difficulty,is_published,archived_at,topic:topics(title))")
      .eq("test_id", id)
      .order("order_index", { ascending: true });
    if (linkError) {
      const { body, status } = fail("DB_UNAVAILABLE", "Состав теста временно недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    const questions = (links || []).flatMap((link: any) => {
      const q = Array.isArray(link.question) ? link.question[0] : link.question;
      if (!q || q.is_published !== true || q.archived_at != null) return [];
      const topic = Array.isArray(q.topic) ? q.topic[0] : q.topic;
      // Любой исторический формат (0-based цифра, читаемый эталон, буква,
      // варианты внутри текста) превращаем в одинаковые key/label/correct.
      const normalized = normalizeQuestion({
        type: q.type,
        text: q.text,
        answer: q.answer,
        options: q.options,
      }, { extractTextOptions: true });
      const item: Record<string, unknown> = {
        id: q.id,
        subject_id: q.subject_id,
        module_id: q.module_id,
        topic_id: q.topic_id,
        topic_title: topic?.title || null,
        type: normalized.type,
        text: normalized.text,
        body: normalized.text,
        is_closed: normalized.is_closed,
        closed: normalized.is_closed,
        options: publicOptions(normalized, bankView),
        option_count: normalized.options.length,
        allow_multiple: normalized.allow_multiple,
        requires_order: normalized.order_indexes.length > 0,
        has_answer: Boolean(String(normalized.answer || "").trim()),
        difficulty: q.difficulty ?? null,
      };
      // Answers/correct option markers are available only in the dedicated study bank view.
      if (bankView) {
        item.answer = normalized.answer || null;
        item.answer_display = normalized.answer_display || "";
        item.answer_resolution = normalized.resolution;
        item.answer_indexes = normalized.correct_indexes;
      }
      return [item];
    });
    const test = { ...data, duration_sec: data.time_limit_sec };
    return c.json(ok({ test, questions, source: "db", view: bankView ? "bank" : "test" }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Тест недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});
}
