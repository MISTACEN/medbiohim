/** Прогресс мини-тестов лекций — модульная структура занятий.
 *
 *  Референс — курс Foxford: в списке занятий рядом с уроком видно
 *  «Решено задач: X из N». Сервер о решённых мини-тестах не знает, поэтому
 *  счётчик живёт локально: { [lectureId]: string[] } — id решённых вопросов.
 */

const STORAGE_KEY = "mb_lecture_quiz_v1";
export const LECTURE_PROGRESS_EVENT = "mb-lecture-progress";

export type LectureProgress = Record<string, string[]>;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLectureProgress(): LectureProgress {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: LectureProgress = {};
    for (const [lectureId, ids] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(ids)) out[lectureId] = ids.map(String).filter(Boolean);
    }
    return out;
  } catch {
    return {};
  }
}

export function solvedInLecture(lectureId: string): string[] {
  return readLectureProgress()[lectureId] ?? [];
}

export function markLectureQuizSolved(lectureId: string, questionId: string): void {
  const store = storage();
  if (!store || !lectureId || !questionId) return;
  const progress = readLectureProgress();
  const solved = new Set(progress[lectureId] ?? []);
  if (solved.has(String(questionId))) return;
  solved.add(String(questionId));
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ ...progress, [lectureId]: [...solved] }));
    window.dispatchEvent(new Event(LECTURE_PROGRESS_EVENT));
  } catch {
    /* хранилище недоступно — счётчик остаётся в состоянии компонента */
  }
}

function quizQuestionIds(markdown: string): string[] {
  const fence = String.fromCharCode(96).repeat(3);
  const re = new RegExp(fence + "quiz\\b\\s*\\r?\\n([\\s\\S]*?)\\r?\\n?" + fence, "gi");
  const ids: string[] = [];
  for (const match of markdown.matchAll(re)) {
    try {
      const spec = JSON.parse(match[1].trim()) as { questionIds?: unknown };
      if (Array.isArray(spec.questionIds)) ids.push(...spec.questionIds.map(String).filter(Boolean));
    } catch {
      /* битый блок задачей не считаем */
    }
  }
  return ids;
}

export type LectureBlock = { title: string; markdown: string; questionIds: string[] };

/** Режет лекцию на блоки по H2/H3 — те же границы, что у аккордеонов в
 *  LectureRenderer, поэтому список подтем в навигации совпадает с текстом. */
export function splitLectureBlocks(markdown?: string | null): LectureBlock[] {
  const source = String(markdown || "").split("\\`").join("`").replace(/\r\n?/g, "\n");
  const drafts: Array<{ title: string; md: string }> = [];
  let cur: { title: string; md: string } | null = null;
  for (const line of source.split("\n")) {
    const heading = line.match(/^#{2,3}\s+(.+)$/);
    if (heading) {
      if (cur) drafts.push(cur);
      cur = { title: heading[1].trim(), md: "" };
    } else if (cur) {
      cur.md += line + "\n";
    } else {
      cur = { title: "", md: line + "\n" };
    }
  }
  if (cur) drafts.push(cur);
  return drafts
    .filter((draft) => draft.title || draft.md.trim())
    .map((draft) => ({ title: draft.title || "Введение", markdown: draft.md, questionIds: quizQuestionIds(draft.md) }));
}

/** Сколько задач в лекции: сумма questionIds по всем блокам ```quiz. */
export function lectureTaskTotal(markdown?: string | null): number {
  return splitLectureBlocks(markdown).reduce((sum, block) => sum + block.questionIds.length, 0);
}

export function lectureSolvedCount(lectureId: string, total: number, progress?: LectureProgress): number {
  const ids = (progress ?? readLectureProgress())[lectureId] ?? [];
  return Math.max(0, Math.min(total, ids.length));
}