// @ts-expect-error The knowledge module is plain JavaScript without type declarations.
import { getCnsKnowledgeEntries } from "../../../../../../integrations/cloudflare-api/src/knowledge/cns.js";
import { selectLectureExcerpts } from "../../../lib/lecture-rag";
import { trackedGeneration } from "./providers";

/** Источник под ответом тьютора: номер сноски и лекция, на которую она ведёт. */
export type LectureCitation = { n: number; title: string; lecture_id: string | null; subject_slug: string | null };

/**
 * FA9: RAG-контекст тьютора — топ-5 фрагментов лекций курса в system prompt.
 * Корпус небольшой (десятки лекций, ~75 КБ на предмет), поэтому скоринг по
 * вхождениям слов запроса делается в памяти воркера на каждое сообщение;
 * фрагменты вырезаются вокруг первых вхождений.
 */

/**
 * FA9: RAG-контекст тьютора — топ-5 фрагментов лекций курса в system prompt.
 * Корпус небольшой (десятки лекций, ~75 КБ на предмет), поэтому скоринг по
 * вхождениям слов запроса делается в памяти воркера на каждое сообщение;
 * фрагменты вырезаются вокруг первых вхождений.
 */
export async function buildLectureContext(
  supabase: any,
  subjectSlug: string | null | undefined,
  query: string
): Promise<{ block: string; sources: string[]; citations: LectureCitation[] }> {
  // Без явного предмета материалы курса не подмешиваем: иначе в ответ попадают
  // случайные фрагменты из всех лекций (см. lib/ai-scope.ts).
  if (!String(subjectSlug || "").trim()) return { block: "", sources: [], citations: [] };
  try {
    let lectureQuery = supabase
      .from("histology_lectures")
      .select("id,title,body_markdown,subject_slug")
      .eq("is_published", true)
      .limit(40);
    if (subjectSlug) lectureQuery = lectureQuery.eq("subject_slug", subjectSlug);
    const { data: lectures, error } = await lectureQuery;
    if (error) return { block: "", sources: [], citations: [] };

    // Корпус «Подготовка к ЦНС» (шпаргалка/конспекты/задачи/банк тестов из
    // методички) живёт вне таблицы лекций и подмешивается только к физиологии —
    // скоринг lib/lecture-rag сам отберёт релевантные записи наравне с лекциями.
    const cnsEntries = String(subjectSlug).toLowerCase() === "physiology" ? getCnsKnowledgeEntries() : [];
    const docs = (lectures ?? []).map((lecture: any) => ({
      id: String(lecture.id || ""),
      title: String(lecture.title || ""),
      body: String(lecture.body_markdown || ""),
      subjectSlug: lecture.subject_slug ?? null,
    })).concat(cnsEntries);
    if (!docs.length) return { block: "", sources: [], citations: [] };

    // Отбор — в lib/lecture-rag.ts: основы слов, редкость в корпусе, порог
    // релевантности и приоритет совпадений в названии темы.
    const scored = selectLectureExcerpts(docs, query);
    if (!scored.length) return { block: "", sources: [], citations: [] };

    const FRAGMENT = 600;
    const parts: string[] = [];
    const sources: string[] = [];
    const citations: LectureCitation[] = [];
    scored.forEach((entry, position) => {
      const n = position + 1;
      let fragment: string;
      if (entry.anchor >= 0) {
        const start = Math.max(0, entry.anchor - 120);
        fragment = (start > 0 ? "…" : "") + entry.body.slice(start, start + FRAGMENT).trim() + (start + FRAGMENT < entry.body.length ? "…" : "");
      } else {
        fragment = entry.body.slice(0, FRAGMENT).trim() + (entry.body.length > FRAGMENT ? "…" : "");
      }
      // Номер в начале фрагмента = номер сноски [N] в ответе и в блоке «Источники».
      parts.push(`[${n}] Лекция «${entry.title}»:\n${fragment}`);
      sources.push(entry.title);
      citations.push({ n, title: entry.title, lecture_id: entry.id || null, subject_slug: entry.subjectSlug });
    });
    const block =
      "\n\nМатериалы курса (фрагменты лекций, пронумерованы). Используй их как первоисточник по предмету; " +
      "после каждого утверждения из фрагмента ставь его номер в квадратных скобках — [1], [2] и т.д. " +
      "Не ссылайся на номера, которых нет в списке. " +
      "фрагменты покрывают тему лишь частично: чего в них нет — дополняй медицинскими знаниями без сноски,"
      + " не сообщай о нехватке материалов и не отказывайся от ответа:\n\n" +
      parts.join("\n\n") +
      // Инструкция повторена после фрагментов: маленькая модель лучше слушает последнее правило.
      "\n\nНАПОМИНАНИЕ: в тексте ответа после каждого утверждения из фрагмента обязателен его номер — [1], [2]. " +
      "В квадратных скобках — только цифра, без слов и пометок. Ответ без сносок не принимается.";
    return { block, sources, citations };
  } catch (error) {
    // RAG — украшение: чат работает и без фрагментов.
    console.error("[ai:rag-context]", error);
    return { block: "", sources: [], citations: [] };
  }
}

/**
 * Честный /providers: провайдер, чей последний живой вызов провалился
 * (диагностика админа или реальный вызов студента), помечается degraded на
 * 10 минут — и в /tutor он больше не предлагается, пока сам не ответит.
 * Кэш в Redis: пишется при diagnostics и при фолбэке в trackedGeneration.
 */
