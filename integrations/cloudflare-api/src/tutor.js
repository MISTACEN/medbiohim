import { authenticateSupabaseRequest } from "./supabase-auth.js";
import { listSupabaseTrainerFeed } from "./trainer-feed.js";
import { generateAiCompletion, getAiProviderStatus, AiChatApiError } from "./ai-chat.js";

const TIMEOUT_MS = 7_000;
const MAX_QUESTION = 2_000;
const STOPWORDS = new Set([
  "это", "как", "что", "для", "или", "при", "его", "её", "их", "она", "они", "оно",
  "был", "была", "были", "есть", "быть", "также", "только", "может", "можно", "нужно",
  "между", "после", "перед", "через", "если", "тогда", "здесь", "там", "the", "and",
  "for", "with", "from", "that", "this", "are", "was", "were", "какой", "какая",
  "какие", "какое", "почему", "зачем", "откуда", "куда", "объясни", "расскажи",
  "напиши", "опиши", "пожалуйста", "подскажи",
]);
const RUSSIAN_ENDINGS = [
  "иями", "ями", "ами", "ией", "иям", "ием", "иях", "ов", "ев", "ём",
  "ие", "ия", "ию", "ий", "ый", "ой", "ая", "ое", "ые", "ых", "ым", "ом", "ем",
  "ах", "ях", "ам", "ям", "ей", "ии", "ть", "ти", "ла", "ли", "ло", "но", "на", "ны",
  "ить", "ать", "ять", "еть",
];

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

function safeString(value, max = 4_000) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeSubjectSlug(value) {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const slug = value.trim();
  if (!slug) return { ok: true, value: null };
  return /^[A-Za-z0-9_-]{1,120}$/.test(slug) ? { ok: true, value: slug } : { ok: false };
}

function stemRussian(word) {
  if (Array.from(word).length < 5) return word;
  for (const ending of RUSSIAN_ENDINGS) {
    if (Array.from(word).length > Array.from(ending).length + 3 && word.endsWith(ending)) {
      return word.slice(0, -ending.length);
    }
  }
  return word;
}

function tokenize(value) {
  const text = String(value ?? "").toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ");
  return text.split(/\s+/u).map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => Array.from(word).length >= 3 && !STOPWORDS.has(word))
    .map(stemRussian);
}

function makeChunk(id, subject, subjectSlug, topic, title, text, answer, source) {
  const cleanSlug = safeString(subjectSlug, 120) || "other";
  const body = safeString(text, 6_000);
  return {
    id: safeString(id, 180),
    subject: safeString(subject, 160),
    subject_slug: cleanSlug,
    topic: safeString(topic, 200),
    title: safeString(title, 280),
    text: body,
    answer: safeString(answer, 4_000),
    source,
    tokens: tokenize([subject, topic, title, body].join(" ")),
  };
}

function scoreChunk(queryTokens, chunk, originalQuery) {
  if (!queryTokens.length || !chunk.tokens.length) return 0;
  const docTokens = new Map();
  for (const token of chunk.tokens) docTokens.set(token, (docTokens.get(token) || 0) + 1);
  let score = 0;
  let matched = 0;
  for (const token of queryTokens) {
    const count = docTokens.get(token) || 0;
    if (!count) continue;
    score += (1 + Math.log(1 + count)) * (1 + Math.min(2, Array.from(token).length / 8));
    matched += 1;
  }
  if (!matched) return 0;
  score *= 0.5 + 0.5 * (matched / Math.max(1, new Set(queryTokens).size));
  if (chunk.answer) score *= 1.15;
  const haystack = [chunk.subject, chunk.topic, chunk.title, chunk.text].join(" ").toLocaleLowerCase("ru-RU");
  const substringMatches = queryTokens.filter((token) => Array.from(token).length >= 5 && haystack.includes(token)).length;
  if (substringMatches >= 2) score *= 1.6;
  else if (substringMatches === 1) score *= 1.2;
  const normalizedQuery = String(originalQuery || "").trim().toLocaleLowerCase("ru-RU");
  const titleAndText = [chunk.title, chunk.text, chunk.topic].join(" ").toLocaleLowerCase("ru-RU");
  if (normalizedQuery && titleAndText.includes(normalizedQuery)) score *= 3;
  else if (Array.from(normalizedQuery).length >= 12 && titleAndText.includes(Array.from(normalizedQuery).slice(0, 16).join(""))) score *= 2;
  return score;
}

function related(value) {
  return Array.isArray(value) ? (value[0] || null) : (value || null);
}

async function createClient(request, env, fetcher) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(String(env.SUPABASE_URL || "").trim());
    if (base.protocol !== "https:" || !base.hostname.endsWith(".supabase.co") || !anonKey || !token) {
      throw new Error("Configuration");
    }
  } catch {
    return failure(503, "TUTOR_DATA_UNAVAILABLE", "База знаний временно недоступна");
  }

  async function rows(table, query = {}) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") endpoint.searchParams.set(key, String(value));
    }
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: "GET",
        headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw Object.assign(new Error("TUTOR_UPSTREAM"), { status: 0 });
    }
    if (response.status >= 300 && response.status < 400) {
      throw Object.assign(new Error("TUTOR_UPSTREAM"), { status: response.status });
    }
    if (!response.ok) {
      throw Object.assign(new Error("TUTOR_UPSTREAM"), { status: response.status });
    }
    const payload = await response.json().catch(() => null);
    if (!Array.isArray(payload)) throw Object.assign(new Error("TUTOR_UPSTREAM"), { status: 0 });
    return payload;
  }
  return { userId: String(identity.user.id), rows };
}

async function loadChunks(client, request, env, subjectSlug, fetcher) {
  const subjects = await client.rows("subjects", {
    is_active: "eq.true",
    select: "id,name,slug,description",
    order: "name.asc",
    limit: "500",
  });
  const subjectById = new Map(subjects.map((subject) => [String(subject.id || ""), subject]));
  const chunks = [];

  const questions = await client.rows("questions", {
    is_published: "eq.true",
    archived_at: "is.null",
    select: "id,subject_id,topic,text,answer",
    order: "created_at.desc",
    limit: "1000",
  });
  for (const row of questions) {
    const subject = subjectById.get(String(row.subject_id || "")) || {};
    const slug = safeString(subject.slug, 120) || "other";
    if (subjectSlug && slug !== subjectSlug) continue;
    const questionText = safeString(row.text, 4_000);
    if (!questionText) continue;
    const answer = safeString(row.answer, 4_000);
    const topic = safeString(row.topic, 200);
    chunks.push(makeChunk(
      "q:" + safeString(row.id, 160), subject.name || "Без предмета", slug,
      topic, topic || Array.from(questionText).slice(0, 80).join(""),
      questionText + (answer ? "\nОтвет: " + answer : ""), answer, "question",
    ));
  }

  const tickets = await client.rows("exam_questions", {
    is_published: "eq.true",
    select: "id,subject_id,subject_name,subject_slug,topic,text,answer",
    order: "created_at.desc",
    limit: "1000",
  });
  for (const row of tickets) {
    const subject = subjectById.get(String(row.subject_id || "")) || {};
    const slug = safeString(row.subject_slug || subject.slug, 120) || "other";
    if (subjectSlug && slug !== subjectSlug) continue;
    const questionText = safeString(row.text, 4_000);
    if (!questionText) continue;
    const answer = safeString(row.answer, 4_000);
    const topic = safeString(row.topic, 200);
    const name = safeString(row.subject_name || subject.name, 160) || "Без предмета";
    chunks.push(makeChunk(
      "tkt:" + safeString(row.id, 160), name, slug, topic,
      topic || Array.from(questionText).slice(0, 80).join(""),
      questionText + (answer ? "\nОтвет: " + answer : ""), answer, "ticket",
    ));
  }

  // Always use the sanitized trainer endpoint/view. It has its own explicit MBH
  // membership guard and removes correctness/explanation fields before returning.
  const trainerResult = await listSupabaseTrainerFeed(request, env, {
    subject: subjectSlug || "",
    limit: 500,
    offset: 0,
  }, fetcher);
  if (trainerResult.ok) {
    for (const row of trainerResult.data.items || []) {
      const prep = row.preparation && typeof row.preparation === "object" ? row.preparation : {};
      const question = row.question && typeof row.question === "object" ? row.question : {};
      const slug = safeString(row.subject_slug, 120) || "other";
      if (subjectSlug && slug !== subjectSlug) continue;
      const title = safeString(prep.name || question.prompt || "Тренажёр", 280);
      const tags = Array.isArray(row.tags) ? row.tags.map((tag) => safeString(tag, 80)).filter(Boolean) : [];
      const hotspots = Array.isArray(row.hotspots) ? row.hotspots : [];
      const hotspotText = hotspots.slice(0, 80).map((item) => {
        if (!item || typeof item !== "object") return "";
        return [item.label, item.description, item.title].map((value) => safeString(value, 200)).filter(Boolean).join(": ");
      }).filter(Boolean).join("; ");
      const prompt = safeString(question.prompt, 2_000);
      const body = [title, prompt, tags.join(", "), hotspotText].filter(Boolean).join("\n");
      if (!body.trim()) continue;
      chunks.push(makeChunk("tr:" + safeString(row.id, 160), slug === "histology" ? "Гистология, цитология" : slug,
        slug, tags.join(", "), title, body, "", "trainer"));
    }
  } else if (subjectSlug === "histology" && trainerResult.status === 403) {
    return trainerResult;
  }

  // Plans are optional, just as in the PHP KnowledgeIndex. The signed-in caller's
  // JWT and RLS are used; missing table/permission does not disable other sources.
  try {
    const plans = await client.rows("site_content", {
      key: "like.subject_plan:*",
      select: "key,payload",
      limit: "500",
    });
    for (const row of plans) {
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      const slug = safeString(payload.subject_slug || String(row.key || "").replace(/^subject_plan:/, ""), 120) || "other";
      if (subjectSlug && slug !== subjectSlug) continue;
      const subject = safeString(payload.subject || slug, 160);
      const weeks = Array.isArray(payload.weeks) ? payload.weeks : [];
      for (let i = 0; i < weeks.length; i += 1) {
        const week = weeks[i];
        if (!week || typeof week !== "object") continue;
        const lecture = safeString(week.lecture, 1200);
        const practice = safeString(week.practice, 1200);
        const study = Array.isArray(week.study) ? week.study.map((x) => safeString(x, 300)).filter(Boolean).join("; ") : safeString(week.study, 1200);
        const parts = [lecture, practice, study].filter(Boolean);
        if (!parts.length) continue;
        const title = "Неделя " + String(week.week || i + 1) + (week.date ? " (" + safeString(week.date, 80) + ")" : "");
        chunks.push(makeChunk("plan:" + slug + ":" + i, subject, slug, title, title, subject + " — " + title + "\n" + parts.join("\n"), "", "plan"));
      }
    }
  } catch {
    // Optional source, no fabricated content on failure.
  }

  // Subject descriptions are supplemental chunks for discovery questions.
  for (const subject of subjects) {
    const slug = safeString(subject.slug, 120) || "other";
    const description = safeString(subject.description, 1200);
    if (subjectSlug && slug !== subjectSlug) continue;
    if (description) chunks.push(makeChunk(
      "s:" + safeString(subject.id, 160), subject.name, slug, "", subject.name, description, "", "subject",
    ));
  }

  return { ok: true, data: { chunks, subjects } };
}

function summarize(chunks) {
  const subjects = new Map();
  const bySource = {};
  for (const chunk of chunks) {
    const source = safeString(chunk.source, 40) || "other";
    bySource[source] = (bySource[source] || 0) + 1;
    const slug = chunk.subject_slug || "other";
    const entry = subjects.get(slug) || { subject: chunk.subject || slug, subject_slug: slug, chunks: 0 };
    entry.chunks += 1;
    subjects.set(slug, entry);
  }
  const sortedSubjects = [...subjects.values()].sort((a, b) => b.chunks - a.chunks);
  return {
    stats: { chunks: chunks.length, subjects: sortedSubjects.length, by_source: bySource },
    subjects: sortedSubjects,
  };
}

export async function getSupabaseTutorMeta(request, env, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (client.ok === false) return client;
  try {
    const result = await loadChunks(client, request, env, null, fetcher);
    if (!result.ok) return result;
    const { stats, subjects } = summarize(result.data.chunks);
    const llm = getAiProviderStatus(env);
    const candidates = Object.values(llm.providers || {});
    const llmEnabled = candidates.some((provider) => provider.available === true);
    const selected = llm.providers?.[llm.default] || {};
    return {
      ok: true,
      data: {
        index: stats,
        llm_enabled: llmEnabled,
        llm,
        model: selected.model || candidates.find((provider) => provider.available)?.model || null,
        subjects,
      },
    };
  } catch {
    return failure(503, "TUTOR_DATA_UNAVAILABLE", "Не удалось загрузить индекс учебных материалов");
  }
}

export async function listSupabaseTutorSubjects(request, env, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (client.ok === false) return client;
  try {
    const result = await loadChunks(client, request, env, null, fetcher);
    if (!result.ok) return result;
    const { subjects } = summarize(result.data.chunks);
    return { ok: true, data: { items: subjects } };
  } catch {
    return failure(503, "TUTOR_DATA_UNAVAILABLE", "Не удалось загрузить предметы базы знаний");
  }
}

function localAnswer(query, hits) {
  if (!hits.length) {
    return "По вашему вопросу в базе знаний платформы пока нет достаточно близких материалов.\n\n" +
      "Попробуйте:\n" +
      "• переформулировать вопрос конкретнее (термин, механизм, тема);\n" +
      "• указать предмет в фильтре;\n" +
      "• открыть раздел «Билеты» / «Тесты» по теме.";
  }
  const ordered = [...hits.filter((hit) => Boolean(hit.chunk.answer)), ...hits.filter((hit) => !hit.chunk.answer)];
  const lines = ["Краткий разбор по материалам платформы (все предметы):", ""];
  let shown = 0;
  for (const hit of ordered) {
    if (shown >= 4) break;
    const chunk = hit.chunk;
    const header = [chunk.subject, chunk.topic || chunk.title].filter(Boolean).join(" · ");
    lines.push("**" + header + "**");
    let text = safeString(chunk.text, 6_000);
    if (Array.from(text).length > 500) text = Array.from(text).slice(0, 500).join("") + "…";
    lines.push(text);
    if (chunk.answer) {
      let answer = safeString(chunk.answer, 4_000);
      if (Array.from(answer).length > 400) answer = Array.from(answer).slice(0, 400).join("") + "…";
      lines.push("→ " + answer);
    }
    lines.push("");
    shown += 1;
  }
  lines.push("_Источников найдено: " + hits.length + ". Ответ собран из базы платформы без внешней генерации._");
  return lines.join("\n");
}

function makeSources(hits) {
  return hits.map(({ score, chunk }) => ({
    id: chunk.id,
    subject: chunk.subject,
    topic: chunk.topic,
    title: chunk.title,
    source: chunk.source,
    score: Math.round(score * 1000) / 1000,
    excerpt: Array.from(chunk.text).slice(0, 400).join(""),
  }));
}

export async function askSupabaseTutor(request, env, input = {}, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (client.ok === false) return client;
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const question = typeof body.question === "string" ? body.question.trim()
    : (typeof body.q === "string" ? body.q.trim() : "");
  if (!question) return failure(422, "VALIDATION_ERROR", "Вопрос не может быть пустым");
  if (Array.from(question).length > MAX_QUESTION) return failure(422, "VALIDATION_ERROR", "Вопрос слишком длинный (макс. 2000 символов)");
  const slugResult = normalizeSubjectSlug(body.subject_slug);
  if (!slugResult.ok) return failure(422, "VALIDATION_ERROR", "Некорректный предмет");
  const topK = Number.isFinite(Number(body.top_k)) ? Math.max(1, Math.min(20, Math.trunc(Number(body.top_k)))) : 6;
  const history = Array.isArray(body.history) ? body.history.slice(-8).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const content = safeString(entry.content, 1_500);
    if (!content) return [];
    return [{ role: entry.role === "assistant" ? "assistant" : "user", content }];
  }) : [];

  let loaded;
  try {
    loaded = await loadChunks(client, request, env, slugResult.value, fetcher);
  } catch {
    return failure(503, "TUTOR_DATA_UNAVAILABLE", "Не удалось загрузить материалы для ответа");
  }
  if (!loaded.ok) return loaded;
  const queryTokens = tokenize(question);
  const hits = loaded.data.chunks.map((chunk) => ({
    chunk,
    score: scoreChunk(queryTokens, chunk, question),
  })).filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score);
  const seen = new Set();
  const unique = [];
  for (const hit of hits) {
    const key = hit.chunk.text.toLocaleLowerCase("ru-RU").slice(0, 160);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
    if (unique.length >= topK) break;
  }

  const sources = makeSources(unique);
  if (unique.length) {
    const context = unique.slice(0, 8).map(({ chunk }) => {
      const label = [chunk.subject, chunk.topic || chunk.title].filter(Boolean).join(" / ");
      let text = chunk.text.slice(0, 2_500);
      if (chunk.answer) text += "\nЭталонный ответ: " + chunk.answer.slice(0, 2_500);
      return "[" + label + "]\n" + text;
    }).join("\n\n---\n\n").slice(0, 12_000);
    const messages = [{
      role: "system",
      content: "Ты — академический тьютор медицинской образовательной платформы. Отвечай на русском, опирайся ТОЛЬКО на предоставленные фрагменты базы знаний. Если данных мало — честно скажи, чего не хватает. Не выдумывай дозировки, численные значения или источники. Чётко отделяй подтверждённое в материалах от выводов.",
    }];
    if (slugResult.value) messages[0].content += " Текущий предмет: " + slugResult.value + ".";
    for (const entry of history.slice(-6)) messages.push(entry);
    messages.push({ role: "user", content: "Контекст из базы знаний:\n\n" + context + "\n\n---\nВопрос студента:\n" + question });
    try {
      const completion = await generateAiCompletion(env, messages, "auto", fetcher);
      return {
        ok: true,
        data: {
          answer: completion.content,
          mode: "rag+llm",
          sources,
          subject_filter: slugResult.value,
          model: completion.model,
          provider: completion.provider,
          retrieved: unique.length,
        },
      };
    } catch {
      return {
        ok: true,
        data: {
          answer: localAnswer(question, unique) + "\n\n_(ИИ временно недоступен — ответ собран из локальной базы)_",
          mode: "rag-local-fallback",
          sources,
          subject_filter: slugResult.value,
          model: null,
          provider: "spaceweb-local",
          retrieved: unique.length,
        },
      };
    }
  }

  return {
    ok: true,
    data: {
      answer: localAnswer(question, unique),
      mode: "rag-local",
      sources,
      subject_filter: slugResult.value,
      model: null,
      provider: "spaceweb-local",
      retrieved: 0,
    },
  };
}
