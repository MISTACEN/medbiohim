import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, invalid, accessibleSubjectIds, testQuestionFingerprint, normalizeChemistryItem } from "./shared";

import type { TestsRouter } from "./types";

export function registerCatalogRoutes(tests: TestsRouter) {
tests.get("/", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  let subjectId = c.req.query("subject_id") || "";
  const subjectSlug = String(c.req.query("subject_slug") || "").trim().toLowerCase();
  const rawCourse = c.req.query("course");
  const rawSemester = c.req.query("semester");
  const course = rawCourse ? Number(rawCourse) : 0;
  const semester = rawSemester ? Number(rawSemester) : 0;
  if (subjectId && !UUID.test(subjectId)) return invalid(c, rid, "Некорректный ID предмета");
  if ((rawCourse && (!Number.isInteger(course) || course < 1 || course > 8)) ||
      (rawSemester && (!Number.isInteger(semester) || semester < 1 || semester > 16))) {
    return invalid(c, rid, "Некорректный курс или семестр");
  }
  try {
    if (subjectSlug) {
      let subjectQuery = db.from("subjects").select("id").eq("slug", subjectSlug).eq("is_active", true);
      if (course > 0) subjectQuery = subjectQuery.eq("course_number", course);
      if (semester > 0) subjectQuery = subjectQuery.eq("semester", semester);
      const { data: subjects, error: subjectError } = await subjectQuery
        .order("course_number", { ascending: true }).order("semester", { ascending: true }).limit(1);
      if (subjectError) {
        const { body, status } = fail("DB_UNAVAILABLE", "Предметы тестов недоступны", 503, rid);
        return c.json(body, status as 503);
      }
      // An unresolved subject slug must never turn a scoped query into an all-tests query.
      if (!subjects?.[0]?.id) return c.json(ok({ items: [] }, rid));
      subjectId = String(subjects[0].id);
    }
    let q = db.from("tests")
      .select("id,title,subject_id,module_id,topic_id,time_limit_sec,max_attempts,is_published,created_at,source_key,order_index,subjects(name,slug,course_number,semester),topics(knowledge_level)")
      .eq("is_published", true).is("archived_at", null)
      .order("order_index", { ascending: true }).order("created_at", { ascending: false }).limit(200);
    if (subjectId) q = q.eq("subject_id", subjectId);
    const { data, error } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Тесты недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    const initialItems = data || [];
    const scopedIds = initialItems.map((item: any) => String(item.subject_id || "")).filter(Boolean);
    const allowedSubjectIds = await accessibleSubjectIds(db, user.id, scopedIds);
    const items = initialItems.filter((item: any) => !item.subject_id || allowedSubjectIds.has(String(item.subject_id)));
    const ids = items.map((item: any) => item.id).filter(Boolean);
    const counts = new Map<string, number>();
    // Состав каждого теста нужен, чтобы скрыть в меню полные дубли банков:
    // после импорта один и тот же набор публиковался под 2–3 названиями.
    const questionSets = new Map<string, Set<string>>();
    if (ids.length) {
      // PostgREST отдаёт не больше max-rows (обычно 1000) строк за запрос, а связей
      // у предмета тысячи: без постраничного чтения последние банки выглядели как
      // «0 вопросов». Раньше страницы читались последовательно — на 10 000 связей
      // это давало 12 круговых запросов и ~17 с ответа меню тестов. Теперь общее
      // число строк считается одним head-запросом, а страницы читаются
      // параллельно; если подсчёт не удался — прежний последовательный путь.
      const PAGE = 900;
      const pageQuery = (from: number) => db.from("test_questions")
        .select("test_id,question_id,questions!inner(id,text,answer,options,is_published,archived_at)")
        .in("test_id", ids)
        .eq("questions.is_published", true)
        .is("questions.archived_at", null)
        .order("test_id", { ascending: true })
        .order("question_id", { ascending: true })
        .range(from, from + PAGE - 1);
      const consume = (links: any[] | null) => {
        for (const link of links || []) {
          const tid = String(link.test_id);
          counts.set(tid, (counts.get(tid) || 0) + 1);
          let set = questionSets.get(tid);
          if (!set) { set = new Set<string>(); questionSets.set(tid, set); }
          const question = Array.isArray((link as any).questions) ? (link as any).questions[0] : (link as any).questions;
          set.add(testQuestionFingerprint(question, String((link as any).question_id)));
        }
      };
      const unavailable = () => {
        const { body, status } = fail("DB_UNAVAILABLE", "Состав тестов недоступен", 503, rid);
        return c.json(body, status as 503);
      };

      const { count: totalLinks, error: countError } = await db.from("test_questions")
        .select("test_id,questions!inner(id)", { count: "exact", head: true })
        .in("test_id", ids)
        .eq("questions.is_published", true)
        .is("questions.archived_at", null);

      if (!countError && typeof totalLinks === "number") {
        const pageCount = Math.ceil(totalLinks / PAGE);
        const pages = await Promise.all(
          Array.from({ length: pageCount }, (_, index) => pageQuery(index * PAGE)),
        );
        if (pages.some((page) => page.error)) return unavailable();
        for (const page of pages) consume(page.data as any[] | null);
      } else {
        for (let from = 0; ; from += PAGE) {
          const { data: links, error: linkError } = await pageQuery(from);
          if (linkError) return unavailable();
          consume(links as any[] | null);
          if (!links || links.length < PAGE) break;
        }
      }
    }
    // Банки из методичек созданы без test_questions, но у них есть тема/раздел.
    // Считаем вопросы по теме теста, иначе такой банк выглядит пустым («0 вопросов»).
    const emptyScoped = items.filter((item: any) => !(counts.get(String(item.id)) || 0) && (item.topic_id || item.module_id));
    if (emptyScoped.length) {
      const topicIds = [...new Set(emptyScoped.map((item: any) => String(item.topic_id || "")).filter((v: string) => UUID.test(v)))];
      const moduleIds = [...new Set(emptyScoped.map((item: any) => String(item.module_id || "")).filter((v: string) => UUID.test(v)))];
      const topicCounts = new Map<string, number>();
      const moduleCounts = new Map<string, number>();
      if (topicIds.length || moduleIds.length) {
        let q = db.from("questions").select("topic_id,module_id")
          .eq("is_published", true).is("archived_at", null).limit(20000);
        const filters: string[] = [];
        if (topicIds.length) filters.push("topic_id.in.(" + topicIds.join(",") + ")");
        if (moduleIds.length) filters.push("module_id.in.(" + moduleIds.join(",") + ")");
        q = q.or(filters.join(","));
        const { data: scopedQuestions } = await q;
        for (const row of scopedQuestions || []) {
          const topicKey = String((row as any).topic_id || "");
          const moduleKey = String((row as any).module_id || "");
          if (topicKey) topicCounts.set(topicKey, (topicCounts.get(topicKey) || 0) + 1);
          if (moduleKey) moduleCounts.set(moduleKey, (moduleCounts.get(moduleKey) || 0) + 1);
        }
      }
      for (const item of emptyScoped as any[]) {
        const fallback = topicCounts.get(String(item.topic_id || "")) || moduleCounts.get(String(item.module_id || "")) || 0;
        if (fallback) counts.set(String(item.id), fallback);
      }
    }
    // Дубли: тест, который на ≥90% состоит из вопросов более крупного теста,
    // считается его копией и не показывается отдельной карточкой.
    const duplicateOf = new Map<string, string>();
    const kept: { id: string; set: Set<string> }[] = [];
    const sourceKeyById = new Map(items.map((item: any) => [String(item.id), String(item.source_key || "")]));
    const bySize = items
      .map((item: any) => String(item.id))
      // Подразделы — намеренные срезы полного теста, это не дубли.
      .filter((id: string) => !(sourceKeyById.get(id) || "").startsWith("phys_sub:"))
      .filter((id: string) => (questionSets.get(id)?.size || 0) > 0)
      .sort((a: string, b: string) => {
        const bySize = questionSets.get(b)!.size - questionSets.get(a)!.size;
        if (bySize !== 0) return bySize;
        // При равном составе оставляем канонический «Полный тест» с подразделами.
        const rank = (id: string) => ((sourceKeyById.get(id) || "").startsWith("phys_full:") ? 0 : 1);
        return rank(a) - rank(b);
      });
    for (const id of bySize) {
      const set = questionSets.get(id)!;
      // Копия — тот же набор под другим названием: ≥90% вопросов входят в
      // другой банк, и он больше лишь на 30%. Более крупные сборники (мега-микс,
      // «все закрытые тесты») и тематические срезы дублями НЕ считаются.
      const container = kept.find((k) => {
        if (k.set.size > set.size * 1.3) return false;
        let inter = 0;
        for (const q of set) if (k.set.has(q)) inter++;
        return inter / set.size >= 0.9;
      });
      if (container) duplicateOf.set(id, container.id);
      else kept.push({ id, set });
    }
    return c.json(ok({ items: items.map((item: any) => {
      const subject = Array.isArray(item.subjects) ? item.subjects[0] : item.subjects;
      return {
        ...item,
        subject_name: subject?.name || "",
        subject_slug: subjectSlug || subject?.slug || null,
        course_number: course || subject?.course_number || null,
        semester: semester || subject?.semester || null,
        duration_sec: item.time_limit_sec,
        questions_count: counts.get(String(item.id)) || 0,
        duplicate_of: duplicateOf.get(String(item.id)) || null,
      };
    }) }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Тесты недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.get("/curriculum-map", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  try {
    const { data, error } = await db.from("test_curriculum_map").select("*").limit(500);
    if (error) throw error;
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Карта учебного плана временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.get("/chemistry-master", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const query = (c.req.query("q") || "").trim().toLowerCase().slice(0, 160);
  const kind = c.req.query("kind") || "";
  const formula = c.req.query("formula") || "";
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit")) || 12));
  if (kind && kind !== "test_question" && kind !== "open_task") {
    return invalid(c, rid, "Неизвестный тип задания");
  }
  try {
    const { data, error } = await db
      .from("chemistry_master_documents")
      .select("id,subject_slug,title,version,content,item_count,updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    const items: Record<string, unknown>[] = [];
    for (const doc of data || []) {
      const content = Array.isArray((doc as any).content) ? (doc as any).content : [];
      for (const raw of content) items.push(normalizeChemistryItem(raw, doc));
    }
    const filtered = items.filter((item) => {
      if (kind && item.kind !== kind) return false;
      if (formula === "true" && !item.formula_preserved) return false;
      if (formula === "false" && item.formula_preserved) return false;
      if (query) {
        const haystack = `${item.question || ""} ${item.topic || ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    const pages = Math.max(1, Math.ceil(filtered.length / limit));
    const safePage = Math.min(page, pages);
    const slice = filtered.slice((safePage - 1) * limit, safePage * limit);
    return c.json(ok({ items: slice, pagination: { total: filtered.length, page: safePage, pages, limit } }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Каталог заданий по химии временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.get("/chemistry-random", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const subjectSlug = (c.req.query("subject_slug") || "").trim().toLowerCase();
  const kind = c.req.query("kind") || "";
  const exclude = new Set(
    (c.req.query("exclude") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 20),
  );
  if (kind && kind !== "test_question" && kind !== "open_task") {
    return invalid(c, rid, "Неизвестный тип задания");
  }
  try {
    const { data, error } = await db
      .from("chemistry_master_documents")
      .select("id,subject_slug,title,version,content,item_count,updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    const items: Record<string, any>[] = [];
    for (const doc of data || []) {
      if (subjectSlug && String((doc as any).subject_slug || "").toLowerCase() !== subjectSlug) continue;
      const content = Array.isArray((doc as any).content) ? (doc as any).content : [];
      for (const raw of content) {
        const item = normalizeChemistryItem(raw, doc) as Record<string, any>;
        if (!item?.question || !item?.answer) continue;
        if (kind && item.kind !== kind) continue;
        if (exclude.has(String(item.item_id || ""))) continue;
        items.push(item);
      }
    }
    if (!items.length) return c.json(ok({ item: null, reason: exclude.size ? "ALL_SEEN" : "EMPTY" }, rid));
    const item = items[Math.floor(Math.random() * items.length)];
    return c.json(ok({ item, pool: items.length }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Задания по химии временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});
}
