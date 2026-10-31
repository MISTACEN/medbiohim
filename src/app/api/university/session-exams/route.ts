/**
 * `GET /api/university/session-exams?faculty=<id>` — сессионное расписание
 * (§4): экзаменационные PDF факультета разбираются в строки
 * «группы → дата → время → примечание» через unpdf.
 *
 * Честная деградация: нет экзаменационных документов у факультета → items: [];
 * PDF недоступен/не разобрался → ok:false с ошибкой; сеть не падает наружу.
 */
import { getFacultySchedule } from "@/lib/university/fesmu";
import { jsonResponse } from "@/lib/university/http";
import { parseExamPdfText, type SessionExamRow } from "@/lib/university/session-exams";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_DOCUMENTS = 3;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const faculty = (url.searchParams.get("faculty") || "").trim();
  if (!faculty) return jsonResponse({ ok: false, error: "Укажите факультет (?faculty=)" }, 400);

  try {
    const schedule = await getFacultySchedule(faculty);
    if (!schedule) return jsonResponse({ ok: false, error: "Неизвестный факультет" }, 404);

    // Экзаменационные и зачётные документы — сессия.
    const examDocs = schedule.items.filter(
      (document) => document.kind === "exams" || document.kind === "credits"
    );
    if (!examDocs.length) return jsonResponse({ ok: true, faculty, items: [], note: "Экзаменационных расписаний у факультета сейчас нет." });

    const items: Array<{
      title: string;
      source_url: string;
      rows: SessionExamRow[];
      course_number: number | null;
      program: string | null;
    }> = [];
    let parseErrors = 0;

    const { fesmuFetch } = await import("@/lib/university/fesmu");
    const { extractText, getDocumentProxy } = await import("unpdf");

    for (const document of examDocs.slice(0, MAX_DOCUMENTS)) {
      const sourceUrl = String(document.url || "");
      if (!/\.pdf(\?|$)/i.test(sourceUrl)) continue;
      try {
        const response = await fesmuFetch(sourceUrl, { timeoutMs: 20000, maxAttempts: 2 });
        if (!response.ok || !response.body) {
          parseErrors += 1;
          continue;
        }
        const bytes = new TextEncoder().encode(response.body);
        const pdf = await getDocumentProxy(new Uint8Array(bytes));
        const { text } = await extractText(pdf, { mergePages: true });
        const parsed = parseExamPdfText(text);
        if (parsed.rows.length) {
          items.push({
            title: document.title || parsed.title || "Экзамены",
            source_url: sourceUrl,
            rows: parsed.rows,
            course_number: document.course_number ?? parsed.course_hint,
            program: document.program ?? parsed.faculty_hint,
          });
        }
      } catch (cause) {
        console.error("[session-exams]", sourceUrl, cause);
        parseErrors += 1;
      }
    }

    if (!items.length && parseErrors >= 1) {
      return jsonResponse({ ok: false, error: "Не удалось разобрать экзаменационные расписания (PDF недоступен)" }, 502);
    }
    return jsonResponse({ ok: true, faculty, items, parse_errors: parseErrors });
  } catch (cause) {
    return jsonResponse({ ok: false, error: cause instanceof Error && cause.message ? cause.message : "Не удалось загрузить сессионное расписание" }, 500);
  }
}
