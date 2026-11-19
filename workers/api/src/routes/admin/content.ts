import { requireAuth } from "../../middleware/auth";
import { ok, requestId } from "../../lib/response";
import { IMPORT_TABLES, STRICT_ADMINS, UUID, bodyJson, error, gate, validText, type AdminApp } from "./shared";

/**
 * Пакетный импорт контента: рабочие книги и legacy-пакеты.
 */
export function registerContent(admin: AdminApp) {

  // Admin content import: bounded, allowlisted and repeatable by source_key/primary key.
  admin.post("/content/import", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase"), input = await bodyJson(c);
    if (!await gate(c, STRICT_ADMINS)) return;
    if (!input) return error(c, rid, 422, "VALIDATION_ERROR", "Передайте пакет импорта в JSON");
    // Workbook importer contract: { tests, questions, test_questions, dry_run }.
    if (Array.isArray(input.tests) || Array.isArray(input.questions) || Array.isArray(input.test_questions)) {
      const tests = Array.isArray(input.tests) ? input.tests : [];
      const questions = Array.isArray(input.questions) ? input.questions : [];
      const links = Array.isArray(input.test_questions) ? input.test_questions : [];
      if (tests.length + questions.length + links.length < 1 || tests.length + questions.length + links.length > 500) return error(c, rid, 422, "VALIDATION_ERROR", "Пакет должен содержать от 1 до 500 строк");
      const dryRun = input.dry_run === true;
      try {
        const subjectCache = new Map<string, string>();
        async function subjectId(key: unknown) {
          const slug = String(key || "").trim();
          if (!slug) return null;
          if (subjectCache.has(slug)) return subjectCache.get(slug);
          if (!/^[a-zA-Z0-9 _.-]{1,120}$/.test(slug)) throw new Error("subject mapping invalid");
          const { data: bySlug, error: slugError } = await db.from("subjects").select("id,slug,name").eq("slug", slug).limit(2);
          if (slugError) throw slugError;
          let matches = bySlug || [];
          if (matches.length === 0) {
            const { data: byName, error: nameError } = await db.from("subjects").select("id,slug,name").eq("name", slug).limit(2);
            if (nameError) throw nameError;
            matches = byName || [];
          }
          if (matches.length !== 1) throw new Error("subject mapping ambiguous or missing");
          subjectCache.set(slug, String(matches[0].id));
          return String(matches[0].id);
        }
        async function academicRef(table: "modules" | "topics", key: unknown) {
          const value = String(key || "").trim();
          if (!value) return null;
          if (UUID.test(value)) {
            const { data, error: lookupError } = await db.from(table).select("id").eq("id", value).maybeSingle();
            if (lookupError) throw lookupError;
            if (!data) throw new Error("academic mapping missing");
            return String(data.id);
          }
          if (!/^[a-zA-Z0-9 _.-]{1,120}$/.test(value)) throw new Error("academic mapping invalid");
          const { data: bySlug, error: slugError } = await db.from(table).select("id,slug,name").eq("slug", value).limit(2);
          if (slugError) throw slugError;
          let matches = bySlug || [];
          if (!matches.length) {
            const { data: byName, error: nameError } = await db.from(table).select("id,slug,name").eq("name", value).limit(2);
            if (nameError) throw nameError;
            matches = byName || [];
          }
          if (matches.length !== 1) throw new Error("academic mapping ambiguous or missing");
          return String(matches[0].id);
        }
        const mappedTests: any[] = [];
        const mappedQuestions: any[] = [];
        for (const row of tests) {
          if (!row || typeof row !== "object" || !validText(row.test_key, 180) || !validText(row.title, 500)) throw new Error("invalid test row");
          const sid = await subjectId(row.subject_key);
          if (!sid) throw new Error("subject missing");
          const moduleId = await academicRef("modules", row.module_key);
          const topicId = await academicRef("topics", row.topic_key);
          const timeLimit = row.time_limit_sec == null || row.time_limit_sec === "" ? null : Number(row.time_limit_sec);
          const maxAttempts = row.max_attempts == null || row.max_attempts === "" ? 3 : Number(row.max_attempts);
          if ((timeLimit !== null && (!Number.isInteger(timeLimit) || timeLimit < 0 || timeLimit > 86400)) || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) throw new Error("invalid test limits");
          mappedTests.push({ source_key: row.test_key, title: row.title, subject_id: sid, module_id: moduleId, topic_id: topicId, time_limit_sec: timeLimit, max_attempts: maxAttempts, is_published: row.is_published === true || row.is_published === "true" });
        }
        for (const row of questions) {
          if (!row || typeof row !== "object" || !validText(row.question_key, 180) || !validText(row.text, 30000)) throw new Error("invalid question row");
          const sid = await subjectId(row.subject_key);
          if (!sid) throw new Error("subject missing");
          let options = row.options;
          if (typeof options === "string" && options.trim()) { try { options = JSON.parse(options); } catch { throw new Error("invalid options JSON"); } }
          if (options == null || options === "") options = [];
          if (!Array.isArray(options)) throw new Error("invalid options");
          const moduleId = await academicRef("modules", row.module_key);
          const topicId = await academicRef("topics", row.topic_key);
          const difficulty = row.difficulty == null || row.difficulty === "" ? null : Number(row.difficulty);
          if (difficulty !== null && (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 10)) throw new Error("invalid difficulty");
          mappedQuestions.push({ source_key: row.question_key, text: row.text, subject_id: sid, module_id: moduleId, topic_id: topicId, type: String(row.type || "open"), answer: String(row.answer || ""), options, difficulty, is_published: row.is_published === true || row.is_published === "true" });
        }
        if (dryRun) return c.json(ok({ dry_run: true, valid: true, errors: [], counts: { tests: mappedTests.length, questions: mappedQuestions.length, test_questions: links.length } }, rid));
        if (mappedQuestions.length) {
          const { error: writeError } = await db.from("questions").upsert(mappedQuestions, { onConflict: "source_key" });
          if (writeError) return error(c, rid, 503, "IMPORT_FAILED", "Не удалось импортировать вопросы; проверьте уникальность source_key");
        }
        if (mappedTests.length) {
          const { error: writeError } = await db.from("tests").upsert(mappedTests, { onConflict: "source_key" });
          if (writeError) return error(c, rid, 503, "IMPORT_FAILED", "Не удалось импортировать тесты; проверьте уникальность source_key");
        }
        for (const link of links) {
          if (!link || typeof link !== "object" || !validText(link.test_key, 180) || !validText(link.question_key, 180)) throw new Error("invalid test link");
          const { data: test, error: testError } = await db.from("tests").select("id").eq("source_key", link.test_key).maybeSingle();
          const { data: question, error: questionError } = await db.from("questions").select("id").eq("source_key", link.question_key).maybeSingle();
          if (testError || questionError || !test || !question) throw new Error("unresolved test link");
          const { error: linkError } = await db.from("test_questions").upsert({ test_id: test.id, question_id: question.id, order_index: Number(link.order_index || 0) }, { onConflict: "test_id,question_id" });
          if (linkError) return error(c, rid, 503, "IMPORT_FAILED", "Не удалось связать вопросы с тестами");
        }
        return c.json(ok({ created: { tests: mappedTests.length, questions: mappedQuestions.length, test_questions: links.length }, imported: { tests: mappedTests.length, questions: mappedQuestions.length, test_questions: links.length }, dry_run: false }, rid), 201);
      } catch (e) {
        const message = e instanceof Error && e.message.includes("subject") ? "Предмет не найден или его slug неоднозначен; укажите уникальный subject_key" : e instanceof Error && e.message.includes("academic") ? "Модуль или тема не найдены либо имеют неоднозначное имя" : e instanceof Error && e.message.includes("options") ? "Поле options содержит некорректный JSON-массив" : "Пакет содержит некорректные строки или неизвестные ссылки";
        return error(c, rid, 422, "VALIDATION_ERROR", message);
      }
    }
    // Explicit single-table import for internal admin tooling.
    const table = String(input.table || ""), rows = Array.isArray(input.rows) ? input.rows : (input.row && typeof input.row === "object" ? [input.row] : []);
    if (!IMPORT_TABLES.has(table) || !rows.length || rows.length > 500) return error(c, rid, 422, "VALIDATION_ERROR", "Разрешены только поддерживаемые таблицы и пакет до 500 строк");
    try {
      const safeRows = rows.map((row: any) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("invalid row");
        const copy = { ...row };
        for (const key of ["created_by","updated_by","actor_user_id","user_id","owner_id","is_admin"]) delete copy[key];
        if (table === "trainer_feed_cards" && copy.subject_slug === "histology" && copy.specialty_slug !== "mbh") throw new Error("histology scope must be mbh");
        return copy;
      });
      if (input.dry_run === true) return c.json(ok({ dry_run: true, valid: true, table, count: safeRows.length }, rid));
      const conflict = table === "test_questions" ? "test_id,question_id" : "id";
      const { error: dbError } = await db.from(table).upsert(safeRows, { onConflict: conflict, ignoreDuplicates: false });
      if (dbError) return error(c, rid, 503, "IMPORT_FAILED", "Импорт не выполнен; проверьте схему и уникальные ключи");
      return c.json(ok({ imported: safeRows.length, table }, rid), 201);
    } catch (e) {
      const message = e instanceof Error && e.message.includes("histology scope") ? "Пакет гистологии должен иметь specialty_slug=mbh" : "Некорректная строка импорта";
      return error(c, rid, 422, "VALIDATION_ERROR", message);
    }
  });

  // Legacy content-package import, deliberately bounded and scoped.
  admin.post("/content/package/import", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase"), input = await bodyJson(c);
    if (!await gate(c, STRICT_ADMINS)) return;
    if (!input) return error(c, rid, 422, "VALIDATION_ERROR", "Передайте пакет в JSON");
    const subjectSlug = String(input.subject_slug || ""), specialty = String(input.specialty_slug || "");
    if (subjectSlug === "histology" && specialty !== "mbh") return error(c, rid, 422, "VALIDATION_ERROR", "Пакет гистологии должен быть ограничен specialty_slug=mbh");
    let packageSubjectId = String(input.subject_id || "");
    if (!packageSubjectId && subjectSlug) {
      const { data: subjects, error: subjectError } = await db.from("subjects").select("id").eq("slug", subjectSlug).limit(2);
      if (subjectError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сопоставить предмет пакета");
      if ((subjects || []).length > 1) return error(c, rid, 422, "AMBIGUOUS_SUBJECT", "Укажите subject_id: slug предмета неоднозначен");
      packageSubjectId = String(subjects?.[0]?.id || "");
    }
    const allowed = ["sources","materials","trainer_cards","tests","questions","test_questions"];
    const total = allowed.reduce((n, key) => n + (Array.isArray(input[key]) ? input[key].length : 0), 0);
    if (total < 1 || total > 500) return error(c, rid, 422, "VALIDATION_ERROR", "Пакет должен содержать от 1 до 500 записей");
    const stats: Record<string, number> = {};
    const tableMap: Record<string, string> = { sources: "content_sources", materials: "materials", trainer_cards: "trainer_feed_cards", tests: "tests", questions: "questions", test_questions: "test_questions" };
    try {
      for (const key of allowed) {
        const rows = Array.isArray(input[key]) ? input[key] : [];
        if (!rows.length) continue;
        const table = tableMap[key];
        const safeRows = rows.map((row: any) => {
          if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("invalid row");
          const copy = { ...row };
          for (const field of ["created_by","updated_by","actor_user_id","user_id","owner_id"]) delete copy[field];
          if (["materials","tests","trainer_cards"].includes(key) && !copy.subject_id && packageSubjectId) copy.subject_id = packageSubjectId;
          if (key === "trainer_cards") { if (!copy.subject_slug) copy.subject_slug = subjectSlug; if (!copy.specialty_slug) copy.specialty_slug = specialty; }
          if (key === "questions" && !copy.subject_slug) copy.subject_slug = subjectSlug;
          if (subjectSlug === "histology") {
            if (key === "trainer_cards" && (copy.specialty_slug || specialty) !== "mbh") throw new Error("histology scope");
            if (key === "questions" && copy.subject_slug && copy.subject_slug !== "histology") throw new Error("histology scope");
          }
          return copy;
        });
        const conflict = key === "test_questions" ? "test_id,question_id" : key === "sources" ? "id" : key === "materials" || key === "tests" ? "source_key" : "id";
        const { error: dbError } = await db.from(table).upsert(safeRows, { onConflict: conflict, ignoreDuplicates: false });
        if (dbError) return error(c, rid, 503, "IMPORT_FAILED", "Импорт прерван на наборе " + key + "; проверьте схему/уникальные ключи");
        stats[key] = safeRows.length;
      }
      return c.json(ok({ imported: stats, total }, rid), 201);
    } catch (e) {
      const message = e instanceof Error && e.message.includes("histology scope") ? "Пакет гистологии вышел за разрешённую область" : "Некорректный пакет импорта";
      return error(c, rid, 422, "VALIDATION_ERROR", message);
    }
  });
}
