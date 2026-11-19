"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAcademicState, getCurriculum, saveAcademicState } from "@/lib/api";
import { describeApiError } from "@/lib/errors";

import { type AcademicRow, type CurriculumItem, subjectName } from "./model";

/**
 * Данные страницы «Учебный план»: загрузка пунктов плана и академического
 * состояния, фильтры по курсу/семестру/типу и поиску, отметка пройденного.
 */
export function useCurriculumData() {
  const [items, setItems] = useState<CurriculumItem[]>([]);
  const [states, setStates] = useState<AcademicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("all");
  const [semester, setSemester] = useState("all");
  const [kind, setKind] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [curriculumResult, academicResult] = await Promise.all([getCurriculum(), getAcademicState()]);
    if (!curriculumResult.ok) {
      setError(describeApiError(curriculumResult.error) || "Не удалось загрузить учебный план");
      setItems([]);
    } else {
      const rows = Array.isArray(curriculumResult.data?.items) ? curriculumResult.data.items : [];
      setItems(rows);
      if (curriculumResult.data?.degraded || curriculumResult.data?.service_notice) {
        setError(String(curriculumResult.data.service_notice || "Учебный план загружен в ограниченном режиме."));
      } else if (rows.length === 0) {
        setError("В учебном плане пока нет активных пунктов. Если вы ожидаете список — обратитесь к администратору.");
      }
    }
    if (academicResult.ok) setStates(Array.isArray(academicResult.data?.states) ? academicResult.data.states : []);
    else if (curriculumResult.ok) setError((prev) => prev || "Учебный план загружен, но индивидуальный прогресс пока недоступен.");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stateByItem = useMemo(() => {
    const map = new Map<string, AcademicRow>();
    for (const row of states) if (row.target_type === "curriculum_item") map.set(String(row.target_id), row);
    return map;
  }, [states]);

  const courses = useMemo(() => [...new Set(items.map((x) => Number(x.course_number || 0)).filter((x) => x > 0))].sort((a, b) => a - b), [items]);
  const semesters = useMemo(() => [...new Set(items.filter((x) => course === "all" || String(x.course_number) === course).map((x) => Number(x.semester || 0)).filter((x) => x > 0))].sort((a, b) => a - b), [items, course]);
  const kinds = useMemo(() => [...new Set(items.map((x) => String(x.item_type || "other")))].sort(), [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (course !== "all" && String(item.course_number || "") !== course) return false;
      if (semester !== "all" && String(item.semester || "") !== semester) return false;
      if (kind !== "all" && String(item.item_type || "other") !== kind) return false;
      if (q && ![item.title, item.description, subjectName(item)].some((v) => String(v || "").toLocaleLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, course, semester, kind, query]);

  const totals = useMemo(() => {
    let completed = 0;
    for (const item of items) {
      const state = stateByItem.get(item.id);
      if (state?.learning_status === "completed" || state?.academic_status === "passed") completed++;
    }
    return { total: items.length, completed, remaining: Math.max(0, items.length - completed) };
  }, [items, stateByItem]);

  async function markDone(item: CurriculumItem) {
    setSavingId(item.id);
    setError(null);
    const previous = stateByItem.get(item.id);
    const result = await saveAcademicState({
      target_type: "curriculum_item",
      target_id: item.id,
      learning_status: "completed",
      academic_status: previous?.academic_status || "not_required",
      execution_status: "done",
      note: previous?.note || null,
      metadata: item.metadata || {},
    });
    setSavingId(null);
    if (!result.ok) setError(describeApiError(result.error) || "Не удалось сохранить прогресс");
    else {
      const refreshed = await getAcademicState();
      if (refreshed.ok) setStates(Array.isArray(refreshed.data?.states) ? refreshed.data.states : []);
    }
  }

  return {
    items, states, loading, savingId, error,
    query, setQuery, course, setCourse, semester, setSemester, kind, setKind,
    load, stateByItem, courses, semesters, kinds, visible, totals, markDone,
  };
}

export type CurriculumDataView = ReturnType<typeof useCurriculumData>;
