"use client";

/** Каталог лекций: поиск, фильтр модуля и группировка занятий с прогрессом. */
import { useMemo, useState } from "react";
import { listLectures, type LectureListItem } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";
import { useLectureProgress } from "@/hooks/useLectureProgress";
import { lectureSolvedCount, lectureTaskTotal } from "@/lib/lectureProgress";
import { compareRu } from "@/lib/collation";
import { groupBySubmodule, resolveLectureSubjectKey, subjectTitle } from "@/lib/lectures/submodules";
import { type LectureRow } from "@/components/lectures/model";

export function useLecturesPage() {
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");
  const progress = useLectureProgress();

  // D9: единый слой отмены вместо ручного cancelled-флага.
  const { data, loading, error } = useApiRequest<LectureListItem[]>(async () => {
    const r = await listLectures(subject || undefined);
    if (!r.ok) throw new Error(describeApiError(r.error) || "Не удалось загрузить лекции");
    return r.data.items || [];
  }, [subject]);
  const items = useMemo(() => (data ?? []) as LectureRow[], [data]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return items;
    return items.filter(
      (x) =>
        String(x.title || "").toLowerCase().includes(n) ||
        String(x.topic || "").toLowerCase().includes(n) ||
        String(x.subject || x.subject_slug || "").toLowerCase().includes(n)
    );
  }, [items, q]);

  /**
   * Модуль = предмет, внутри — подмодули программы: в списке API приходит только
   * subject_slug, поэтому он ведущий, а тематические блоки берутся из реестра
   * (@/lib/lectures/submodules). Лекция без подмодуля попадает в «Прочие занятия».
   */
  const modules = useMemo(() => {
    const groups = new Map<string, LectureRow[]>();
    for (const item of filtered) {
      const key = String(item.subject || item.subject_slug || "Без модуля");
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([title, lessons]) => {
      const subjectKey = resolveLectureSubjectKey(lessons[0] ?? {});
      const rows = new Map<string, { lesson: LectureRow; total: number; solved: number }>();
      for (const lesson of lessons) {
        const total = lectureTaskTotal(lesson.body_markdown);
        rows.set(lesson.id, {
          lesson,
          total,
          solved: lectureSolvedCount(lesson.id, total, progress),
        });
      }
      const submodules = groupBySubmodule(subjectKey, lessons).map((group) => {
        const groupRows = group.lectures.map((lesson) => rows.get(lesson.id)!).filter(Boolean);
        return {
          title: group.title,
          subtitle: group.subtitle ?? group.submodule?.subtitle,
          rows: groupRows,
          tasks: groupRows.reduce((sum, row) => sum + row.total, 0),
          solved: groupRows.reduce((sum, row) => sum + row.solved, 0),
        };
      });
      const all = submodules.flatMap((group) => group.rows);
      return {
        title: subjectTitle(subjectKey, title),
        submodules,
        count: all.length,
        tasks: all.reduce((sum, row) => sum + row.total, 0),
        solved: all.reduce((sum, row) => sum + row.solved, 0),
      };
    });
  }, [filtered, progress]);

  const subjects = useMemo(() => {
    const s = new Set(items.map((x) => x.subject || x.subject_slug).filter(Boolean) as string[]);
    return Array.from(s).sort(compareRu);
  }, [items]);

  return {
    q, setQ,
    subject, setSubject,
    loading,
    error,
    filtered,
    modules,
    subjects,
  };
}

export type LecturesPageState = ReturnType<typeof useLecturesPage>;
