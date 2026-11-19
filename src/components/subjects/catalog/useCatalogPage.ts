"use client";

/** Каталог предметов: фильтры курса/семестра, поиск, группировка по категориям. */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { listSubjects, listSubjectsCatalog } from "@/lib/api";
import { getScheduleMeta } from "@/lib/api/schedule";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";
import { subjectCategory } from "@/lib/subjectCategories";
import { compareRu } from "@/lib/collation";
import { CATEGORY_ORDER, type ExamWindow, type Item, type Tool } from "@/components/subjects/catalog/model";

export function useCatalogPage() {
  const { user } = useAuth();
  const [course, setCourse] = useState<number | "">(user?.course ?? "");
  const [semester, setSemester] = useState<number | "">(user?.semester ?? "");
  const [q, setQ] = useState("");
  // Окна экзаменационных сессий по курсам/семестрам — для подсветки предметов с близкой аттестацией
  const [examWindows, setExamWindows] = useState<Record<string, ExamWindow[]>>({});

  useEffect(() => {
    let alive = true;
    getScheduleMeta()
      .then((r: any) => {
        if (!alive || !r?.ok || !r.data?.periods) return;
        const map: Record<string, ExamWindow[]> = {};
        for (const p of r.data.periods) {
          if (p.type !== "exam_session" || !p.start_date) continue;
          const key = `${p.course_number ?? ""}/${p.semester ?? ""}`;
          (map[key] ??= []).push({ start: p.start_date, end: p.end_date || p.start_date, title: p.title || "Сессия" });
        }
        for (const k of Object.keys(map)) map[k].sort((a, b) => a.start.localeCompare(b.start));
        setExamWindows(map);
      })
      .catch(() => { /* подсветка не критична */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (user?.course != null) setCourse(user.course);
    if (user?.semester != null) setSemester(user.semester);
  }, [user?.course, user?.semester]);

  const { data, loading } = useApiRequest<{ items: Item[]; tools: Tool[]; note: string | null }>(async () => {
    try {
      const [cat, r] = await Promise.all([
        listSubjectsCatalog(),
        listSubjects(
          course === "" ? undefined : course,
          semester === "" ? undefined : semester
        ),
      ]);
      const catalogMeta = cat.ok ? (cat.data as { items?: Item[]; tools?: Tool[] }) : null;
      const tools = catalogMeta?.tools || [];

      if (r.ok && (r.data.items || []).length > 0) {
        const byName = new Map((catalogMeta?.items || []).map((x) => [x.name.toLowerCase(), x]));
        return {
          tools,
          note: null,
          items: (r.data.items || []).map((s: any) => {
            const meta = byName.get((s.name || "").toLowerCase());
            return {
              ...s,
              category: meta?.category || subjectCategory(s.name, s.slug),
              icon: meta?.icon,
              blurb: meta?.blurb,
              slug: s.slug || meta?.slug || s.id,
            };
          }),
        };
      }
      if (cat.ok) {
        return {
          items: [],
          tools,
          note: "Для выбранного курса и семестра данные из основной БД недоступны. Устаревший каталог не подставляется.",
        };
      }
      return { items: [], tools, note: r.ok ? "Пусто" : describeApiError(r.error) };
    } catch {
      return { items: [], tools: [], note: "Не удалось загрузить предметы" };
    }
  }, [course, semester]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const tools = data?.tools ?? [];
  const note = data?.note ?? null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.blurb || "").toLowerCase().includes(needle) ||
        (s.category || "").toLowerCase().includes(needle)
    );
  }, [items, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const s of filtered) {
      const cat = s.category || "Другое";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    const order = [...CATEGORY_ORDER];
    // Категории вне CATEGORY_ORDER раньше молча пропадали со страницы.
    for (const cat of map.keys()) if (!order.includes(cat)) order.push(cat);
    const byName = (a: Item, b: Item) => compareRu(a.name, b.name);
    return order
      .filter((c) => map.has(c))
      .map((c) => ({ category: c, items: map.get(c)!.slice().sort(byName) }));
  }, [filtered]);

  const sems = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  function openTutor(name: string) {
    try { sessionStorage.setItem("tutor_prefill", `Объясни тему по предмету «${name}»`); } catch { /* ignore */ }
  }

  return {
    course, setCourse,
    semester, setSemester,
    q, setQ,
    examWindows,
    items,
    tools,
    note,
    filtered,
    grouped,
    sems,
    loading,
    openTutor,
  };
}

export type CatalogPageState = ReturnType<typeof useCatalogPage>;
