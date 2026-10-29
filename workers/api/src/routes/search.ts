import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  SEARCH_EXAMPLES,
  histologyTagLabel,
  matchesMaterialHint,
  normalizeSearchText,
  parseSearchIntent,
  scoreFields,
  type SearchIntentKind,
} from "../lib/search-query";

const search = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

type SearchKind = SearchIntentKind;

type SearchHit = {
  type: string;
  type_label: string;
  id: string;
  title: string;
  subject: string;
  subject_slug: string | null;
  topic: string;
  snippet: string;
  hint: string;
  has_answer: boolean;
  answer?: string;
  href: string;
  score: number;
  count?: number;
};

const TYPE_LABEL: Record<string, string> = {
  preparation: "Микропрепарат",
  subject: "Предмет",
  material: "Материал",
  lecture: "Лекция",
  question: "Вопрос",
  ticket: "Билет",
};

/** При равном счёте важнее предмет и препарат, чем вопрос из практики. */
const TYPE_PRIORITY: Record<string, number> = {
  subject: 6,
  preparation: 5,
  material: 4,
  lecture: 3,
  ticket: 2,
  question: 1,
};

const MATERIAL_TYPE_LABEL: Record<string, string> = {
  lecture: "Лекция",
  pdf: "PDF",
  pptx: "Презентация",
  docx: "Word",
  lab: "Лабораторная",
  table: "Таблица",
  html: "Страница",
  video: "Видео",
  other: "Материал",
};

const KIND_ALIASES: Record<string, SearchKind> = {
  question: "questions",
  questions: "questions",
  ticket: "tickets",
  tickets: "tickets",
  exam: "tickets",
  lecture: "lectures",
  lectures: "lectures",
  material: "materials",
  materials: "materials",
  textbook: "materials",
  textbooks: "materials",
  preparation: "preparations",
  preparations: "preparations",
  subject: "subjects",
  subjects: "subjects",
};

function materialHintLabel(title: string, type: string): string {
  const label = MATERIAL_TYPE_LABEL[String(type || "").toLowerCase()] || "Материал";
  const lower = title.toLowerCase();
  if (/учебник/.test(lower)) return `Учебник · ${label}`;
  if (/атлас/.test(lower)) return `Атлас · ${label}`;
  if (/лекц/.test(lower)) return `Курс лекций · ${label}`;
  if (/методич|пособ/.test(lower)) return `Методичка · ${label}`;
  return label;
}

function relation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function primaryTerm(query: string): string {
  return normalizeSearchText(query)
    .split(" ")
    .filter((word) => word.length >= 2)
    .sort((a, b) => b.length - a.length)[0] || "";
}

type SubjectRow = {
  id: string;
  name: string;
  slug: string | null;
  description?: string | null;
  course_number?: number | null;
  semester?: number | null;
};

type CollectOptions = {
  query: string;
  kind?: SearchKind;
  subjectSlug?: string;
  limit: number;
  /** «Учебник»/«атлас»: обязательный вид материала плюс бонус к ранжированию. */
  materialHint?: string;
  /** Для подсказок не трогаем тяжёлые разделы. */
  kinds?: SearchKind[];
};

async function collect(c: any, options: CollectOptions) {
  const db = c.get("supabase");
  const { query, subjectSlug, limit, materialHint } = options;
  const include = (kind: SearchKind) => !options.kind || options.kind === kind;
  const allowed = (kind: SearchKind) => !options.kinds || options.kinds.includes(kind);
  const term = primaryTerm(query);
  const results: SearchHit[] = [];

  // Предметы нужны не только как результат, но и как «мостик»: по ним
  // находятся материалы, лекции и билеты, если запрос содержит название предмета.
  const { data: subjectRows, error: subjectError } = await db
    .from("subjects")
    .select("id,name,slug,description,course_number,semester")
    .eq("is_active", true)
    .limit(500);
  if (subjectError) throw subjectError;

  const subjects = ((subjectRows || []) as SubjectRow[]).map((row) => ({
    ...row,
    id: String(row.id),
    name: String(row.name || ""),
    slug: row.slug ? String(row.slug) : null,
    score: scoreFields([row.name, row.slug], query),
  }));
  const matchedSubjects = subjects.filter((row) => row.score > 0);
  const matchedIds = [...new Set(matchedSubjects.map((row) => row.id))];
  const matchedSlugs = [...new Set(matchedSubjects.map((row) => row.slug).filter((slug): slug is string => Boolean(slug)))];
  const subjectNameBySlug = new Map(subjects.filter((row) => row.slug).map((row) => [row.slug as string, row.name]));

  if (include("subjects") && allowed("subjects")) {
    for (const row of matchedSubjects) {
      if (!row.slug) continue; // без слага ссылка на предмет невозможна
      const hint = [
        row.course_number ? `${row.course_number} курс` : "",
        row.semester ? `${row.semester} семестр` : "",
      ].filter(Boolean).join(" · ");
      results.push({
        type: "subject",
        type_label: TYPE_LABEL.subject,
        id: row.id,
        title: row.name,
        subject: row.name,
        subject_slug: row.slug,
        topic: "",
        snippet: String(row.description || `Предмет «${row.name}»: материалы, тесты и аттестации.`),
        hint: hint || "предмет",
        has_answer: false,
        href: `/subjects/${encodeURIComponent(row.slug)}`,
        score: row.score,
      });
    }
  }

  if (include("preparations") && allowed("preparations") && (!subjectSlug || subjectSlug === "histology")) {
    // Карточек около тысячи; фильтруем в памяти, чтобы JSONB-поля
    // (preparation->>name, organ) не зависели от синтаксиса PostgREST.
    const { data: cardRows, error: cardError } = await db
      .from("trainer_feed_cards")
      .select("id,subject_slug,preparation,mode_set,tags,question")
      .eq("subject_slug", "histology")
      .eq("is_published", true)
      .limit(1000);
    if (cardError) throw cardError;

    const groups = new Map<string, { hit: SearchHit; count: number }>();
    for (const raw of (cardRows || []) as Array<Record<string, any>>) {
      const preparation = raw.preparation && typeof raw.preparation === "object" ? raw.preparation : {};
      const name = String(preparation.name || preparation.organ || "").trim();
      const organ = String(preparation.organ || "").trim();
      const stain = String(preparation.stain || "").trim();
      const tags = Array.isArray(raw.tags) ? raw.tags.map(histologyTagLabel) : [];
      const prompt = String(raw.question?.prompt || "").trim();
      const score = scoreFields([name, organ, stain, ...tags, prompt], query);
      if (!score) continue;

      const isElectronogram = String(raw.mode_set || "") === "electronogram";
      const section = tags.find((tag) => tag && tag.toLowerCase() !== "identify" && tag.toLowerCase() !== "mbh") || "";
      const key = normalizeSearchText(name || organ || String(raw.id));
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        existing.hit.score = Math.max(existing.hit.score, score);
        continue;
      }
      const kindLabel = isElectronogram ? "Электронограмма" : "Микропрепарат";
      groups.set(key, {
        count: 1,
        hit: {
          type: "preparation",
          type_label: TYPE_LABEL.preparation,
          id: String(raw.id),
          title: name || organ || "Препарат",
          subject: "Гистология",
          subject_slug: "histology",
          topic: section,
          snippet: prompt || [kindLabel, stain, section].filter(Boolean).join(" · "),
          hint: [kindLabel, stain, section].filter(Boolean).join(" · "),
          has_answer: false,
          href: `/trainers/feed/histology?card=${encodeURIComponent(String(raw.id))}`,
          score,
        },
      });
    }
    for (const { hit, count } of groups.values()) {
      results.push(count > 1
        ? { ...hit, count, hint: `${hit.hint} · ${count} ${count < 5 ? "карточки" : "карточек"}` }
        : hit);
    }
  }

  if (include("materials") && allowed("materials")) {
    const { data: materialRows, error: materialError } = await db
      .from("materials")
      .select("id,title,type,subject_id,subjects(name,slug)")
      .eq("is_published", true)
      .limit(500);
    if (materialError) throw materialError;

    for (const raw of (materialRows || []) as Array<Record<string, any>>) {
      const subject = relation<{ name?: string; slug?: string }>(raw.subjects);
      const slug = subject?.slug ? String(subject.slug) : null;
      if (subjectSlug && slug !== subjectSlug) continue;
      const title = String(raw.title || "");
      const type = String(raw.type || "");
      const hint = materialHintLabel(title, type);
      const baseScore = scoreFields([title, subject?.name, slug, hint], query);
      // Вид материала — отдельный фильтр: «учебник по гистологии» не должен
      // приносить все таблицы и сборники тестов по этому предмету.
      const hintMatch = matchesMaterialHint([title, type, hint], materialHint);
      // Если назван вид материала («учебник», «атлас»), оставляем только его:
      // иначе запрос «учебник по гистологии» приносит все таблицы и сборники
      // тестов по этому предмету.
      if (query ? !baseScore : !hintMatch) continue;
      if (materialHint && !hintMatch) continue;
      const score = baseScore ? baseScore + (hintMatch ? 50 : 0) : 70;
      results.push({
        type: "material",
        type_label: TYPE_LABEL.material,
        id: String(raw.id),
        title,
        subject: subject?.name || "",
        subject_slug: slug,
        topic: hint,
        snippet: [hint, subject?.name].filter(Boolean).join(" · "),
        hint,
        has_answer: false,
        href: `/materials?q=${encodeURIComponent(title)}${slug ? `&subject_slug=${encodeURIComponent(slug)}` : ""}`,
        score,
      });
    }
  }

  if (include("lectures") && allowed("lectures")) {
    const { data: lectureRows, error: lectureError } = await db
      .from("histology_lectures")
      .select("id,title,description_algorithm_ref,body_markdown,subject_slug")
      .eq("is_published", true)
      .limit(300);
    if (lectureError) throw lectureError;

    for (const raw of (lectureRows || []) as Array<Record<string, any>>) {
      const slug = raw.subject_slug ? String(raw.subject_slug) : null;
      if (subjectSlug && slug !== subjectSlug) continue;
      const title = String(raw.title || "");
      const body = String(raw.body_markdown || "");
      const description = String(raw.description_algorithm_ref || "");
      const subjectName = (slug && subjectNameBySlug.get(slug)) || slug || "";
      const score = scoreFields([title, description, body.slice(0, 4000), subjectName, slug], query);
      if (!score) continue;
      results.push({
        type: "lecture",
        type_label: TYPE_LABEL.lecture,
        id: String(raw.id),
        title,
        subject: subjectName,
        subject_slug: slug,
        topic: "",
        snippet: String(description || body.replace(/[#*_>`]/g, " ")).replace(/\s+/g, " ").slice(0, 200),
        hint: "конспект лекции",
        has_answer: false,
        href: "/lectures",
        score,
      });
    }
  }

  if (include("questions") && allowed("questions")) {
    let queryBuilder = db
      .from("questions")
      .select("id,text,answer,subject_id,topic_id,subjects(name,slug),topics(title)")
      .eq("is_published", true)
      .limit(80);
    if (subjectSlug) {
      const ids = subjects.filter((row) => row.slug === subjectSlug).map((row) => row.id);
      if (ids.length) queryBuilder = queryBuilder.in("subject_id", ids);
    } else if (matchedIds.length) {
      queryBuilder = queryBuilder.in("subject_id", matchedIds);
    } else if (term) {
      queryBuilder = queryBuilder.ilike("text", `%${term}%`);
    }
    const { data: questionRows, error: questionError } = await queryBuilder;
    if (questionError) throw questionError;

    for (const raw of (questionRows || []) as Array<Record<string, any>>) {
      const subject = relation<{ name?: string; slug?: string }>(raw.subjects);
      const topic = relation<{ title?: string }>(raw.topics);
      const text = String(raw.text || "");
      const score = scoreFields([text, subject?.name, topic?.title], query);
      if (!score) continue;
      results.push({
        type: "question",
        type_label: TYPE_LABEL.question,
        id: String(raw.id),
        title: text.slice(0, 160),
        subject: subject?.name || "",
        subject_slug: subject?.slug || null,
        topic: topic?.title || "",
        snippet: text.slice(0, 200),
        hint: "вопрос из банка",
        has_answer: Boolean(String(raw.answer || "").trim()),
        answer: raw.answer || undefined,
        href: "/practice",
        score,
      });
    }
  }

  if (include("tickets") && allowed("tickets")) {
    let queryBuilder = db
      .from("exam_questions")
      .select("id,text,answer,subject_slug,type")
      .eq("is_published", true)
      .limit(80);
    if (subjectSlug) queryBuilder = queryBuilder.eq("subject_slug", subjectSlug);
    else if (matchedSlugs.length) queryBuilder = queryBuilder.in("subject_slug", matchedSlugs);
    else if (term) queryBuilder = queryBuilder.ilike("text", `%${term}%`);
    const { data: ticketRows, error: ticketError } = await queryBuilder;
    if (ticketError) throw ticketError;

    for (const raw of (ticketRows || []) as Array<Record<string, any>>) {
      const slug = raw.subject_slug ? String(raw.subject_slug) : null;
      const text = String(raw.text || "");
      const subjectName = (slug && subjectNameBySlug.get(slug)) || slug || "";
      const score = scoreFields([text, subjectName, slug], query);
      if (!score) continue;
      results.push({
        type: "ticket",
        type_label: TYPE_LABEL.ticket,
        id: String(raw.id),
        title: text.slice(0, 160),
        subject: subjectName,
        subject_slug: slug,
        topic: "",
        snippet: text.slice(0, 200),
        hint: "экзаменационный билет",
        has_answer: Boolean(String(raw.answer || "").trim()),
        answer: raw.answer || undefined,
        href: "/tickets",
        score,
      });
    }
  }

  results.sort((a, b) => (
    b.score - a.score
    || (TYPE_PRIORITY[b.type] || 0) - (TYPE_PRIORITY[a.type] || 0)
    || a.title.localeCompare(b.title, "ru")
  ));

  const subjectCounts = new Map<string, { subject: string; subject_slug: string; count: number }>();
  const typeCounts: Record<string, number> = {};
  for (const result of results) {
    typeCounts[result.type] = (typeCounts[result.type] || 0) + 1;
    if (result.subject_slug) {
      const current = subjectCounts.get(result.subject_slug)
        || { subject: result.subject || result.subject_slug, subject_slug: result.subject_slug, count: 0 };
      current.count += 1;
      subjectCounts.set(result.subject_slug, current);
    }
  }

  return {
    items: results.slice(0, limit),
    total: results.length,
    facets: { subjects: [...subjectCounts.values()], types: typeCounts },
  };
}

function readKind(raw: string): SearchKind | undefined | "invalid" {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized || normalized === "all") return undefined;
  return KIND_ALIASES[normalized] || "invalid";
}

search.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const rawQuery = (c.req.query("q") || c.req.query("query") || "").trim().slice(0, 160);
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 20), 1), 50);
  const subjectSlug = c.req.query("subject_slug")?.trim().toLowerCase() || undefined;
  const requestedKind = readKind(c.req.query("type") || "");
  if (requestedKind === "invalid") {
    const { body, status } = fail("VALIDATION_ERROR", "Неизвестный тип поиска", 422, rid);
    return c.json(body, status as 422);
  }

  const intent = parseSearchIntent(rawQuery);
  const kind = requestedKind || intent.kind;
  const query = intent.query || (kind ? rawQuery : "");
  const queryTooShort = normalizeSearchText(query).length < 2;
  // «Учебники» без предмета — допустимый запрос: вид материала сам по себе
  // достаточный фильтр. Всё остальное короче двух букв не ищем.
  if (queryTooShort && !intent.materialHint) {
    return c.json(ok({
      items: [],
      query,
      original: rawQuery,
      total: 0,
      intent: { kind: kind || null, hint: intent.hint },
      facets: { subjects: [], types: {} },
      examples: SEARCH_EXAMPLES,
    }, rid));
  }

  try {
    const effectiveQuery = queryTooShort ? "" : query;
    const collected = await collect(c, {
      query: effectiveQuery,
      kind,
      subjectSlug,
      limit,
      materialHint: intent.materialHint,
    });
    return c.json(ok({
      items: collected.items,
      query: effectiveQuery,
      original: rawQuery,
      total: collected.total,
      intent: { kind: kind || null, hint: intent.hint },
      facets: collected.facets,
      examples: SEARCH_EXAMPLES,
    }, rid));
  } catch (error) {
    console.error("[search]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Поиск временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

/**
 * Подсказки для поля поиска: предметы, препараты и материалы — три быстрых
 * запроса. Без вопросов и лекций, чтобы список не превращался в свалку.
 */
search.get("/suggest", requireAuth, async (c) => {
  const rid = requestId();
  const rawQuery = (c.req.query("q") || "").trim().slice(0, 120);
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 8), 1), 12);
  const intent = parseSearchIntent(rawQuery);
  const query = intent.query || rawQuery;
  const queryTooShort = normalizeSearchText(query).length < 2;

  if (queryTooShort && !intent.materialHint) {
    return c.json(ok({
      items: [],
      query,
      hint: "Введите название препарата, учебника или предмета",
      examples: SEARCH_EXAMPLES,
    }, rid));
  }

  try {
    const collected = await collect(c, {
      query: queryTooShort ? "" : query,
      kind: intent.kind,
      limit,
      materialHint: intent.materialHint,
      kinds: ["subjects", "preparations", "materials"],
    });
    return c.json(ok({
      items: collected.items.map((item) => ({
        id: item.id,
        type: item.type,
        type_label: item.type_label,
        title: item.title,
        subject: item.subject,
        hint: item.hint,
        href: item.href,
        count: item.count || 1,
      })),
      query,
      hint: intent.hint,
      examples: SEARCH_EXAMPLES,
    }, rid));
  } catch (error) {
    console.error("[search:suggest]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Подсказки временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

export default search;
