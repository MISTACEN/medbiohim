"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Loader2, Search, X } from "lucide-react";
import { LectureRenderer } from "@/components/lectures/LectureRenderer";
import { loadLectureSet, type PortalLectureSet } from "@/lib/portalContent";

type LectureSetId = "bio" | "math" | "chem" | "chem-organic" | "phys" | "latin" | "english" | "history" | "hist";

type Props = {
  /** Один набор — обычный случай (биология, физика, латынь…). */
  setId?: LectureSetId;
  /**
   * Несколько наборов в одной ленте. Органическая химия раньше показывала две
   * отдельные карточки («Физическая химия» и «Органическая химия») с двумя
   * поисками — со стороны студента это выглядело как дубли непонятного
   * происхождения. Теперь это одна лента с одним поиском.
   */
  sets?: LectureSetId[];
};

type ArchiveItem = PortalLectureSet["items"][number];

/** Сравнимое название: без «Лекция 3:», «Тема 2.», регистра и пунктуации. */
function normalizeLectureTitle(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/^(?:тема|неделя)\s*[\d\s.,–\-—/]*/i, "")
    .replace(/(?:лекция|конспект|практика|семинар)\s*[\d\s.,–\-—/·:]*/gi, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

/** Слияние наборов: сначала по id, затем по нормализованному названию. */
function mergeLectureSets(sets: PortalLectureSet[]): { subject: string; items: ArchiveItem[] } {
  const byId = new Map<string, ArchiveItem>();
  for (const set of sets) {
    for (const item of set.items || []) {
      const id = String(item?.id || "");
      if (!id || byId.has(id)) continue;
      byId.set(id, item);
    }
  }
  const seenTitles = new Set<string>();
  const items = [...byId.values()].filter((item) => {
    const key = normalizeLectureTitle(item.title);
    if (!key) return true;
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
  const subjects = [...new Set(sets.map((set) => String(set.subject || "").trim()).filter(Boolean))];
  return { subject: subjects.join(" · "), items };
}

/** Статические конспекты (course/ + перенесённые материалы) — внутри вкладки «Портал». */
export default function ArchiveLectures({ setId, sets }: Props) {
  // Наборы фиксируем строкой: массив-литерал в пропсах менял бы ссылку каждый рендер.
  const requested = useMemo(() => {
    const list = sets?.length ? sets : setId ? [setId] : [];
    return [...new Set(list)];
  }, [setId, sets]);
  const requestedKey = requested.join(",");

  const [set, setSet] = useState<{ subject: string; items: ArchiveItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    const ids = requestedKey ? (requestedKey.split(",") as LectureSetId[]) : [];
    setSet(null);
    setActiveId(null);
    if (!ids.length) {
      setError("Не выбран ни один набор конспектов");
      return;
    }
    Promise.all(ids.map((id) => loadLectureSet(id)))
      .then((loaded) => {
        if (!alive) return;
        const merged = mergeLectureSets(loaded);
        setSet(merged);
        setActiveId(merged.items[0]?.id ?? null);
      })
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, [requestedKey]);

  // Поиск по заголовкам с мягкой нормализацией: «менделя» найдёт «Менделя»,
  // «харди-вайнберга» — «Харди–Вайнберга» (дефис и тире взаимозаменяемы).
  const filtered = useMemo(() => {
    if (!set) return [];
    const normalized = query.trim().toLowerCase().replace(/[–—−]/g, "-");
    if (!normalized) return set.items;
    return set.items.filter((item) => {
      const title = item.title.toLowerCase().replace(/[–—−]/g, "-");
      return title.includes(normalized) || normalizeAlnum(title).includes(normalizeAlnum(normalized));
    });
  }, [set, query]);

  if (error) return <div className="card p-5 text-sm text-[var(--status-critical-fg)]">{error}</div>;
  if (!set) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Загружаем лекции…
      </div>
    );
  }

  const active = set.items.find((t) => t.id === activeId) ?? set.items[0];

  return (
    <section className="space-y-4">
      <div className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <BookOpen className="size-5 text-indigo-500" /> {set.subject || "Конспекты"} · конспекты
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Архивные конспекты по предмету. Задания, прогресс и озвучка — в разделе{" "}
          <Link href="/lectures" className="font-semibold text-indigo-600 hover:text-indigo-500">
            «Лекции»
          </Link>
          .
        </p>
        {set.items.length > 6 ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 dark:bg-slate-900">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск конспекта по названию…"
              aria-label="Поиск конспекта по названию"
              className="w-full bg-transparent text-sm outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Очистить поиск"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveId(t.id)}
              className={
                "rounded-full px-3 py-1.5 text-xs font-bold transition " +
                (active?.id === t.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
              }
            >
              {t.title.replace(/^Тема \d+\.\s*/, "").replace(/^Лекция \d+:\s*/, "")}
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500">По запросу «{query}» конспектов нет.</p>
          ) : null}
        </div>
      </div>
      {active && (
        <article className="card p-5">
          <h3 className="mb-1 text-base font-bold text-slate-800">{active.title}</h3>
          {active.source || active.note ? (
            <p className="mb-3 text-xs text-slate-500">
              {active.source ? <>Источник: {active.source}. </> : null}
              {active.note}
            </p>
          ) : (
            <div className="mb-3" />
          )}
          <LectureRenderer markdown="" html={active.html} />
        </article>
      )}
    </section>
  );
}

/** Буквы и цифры без разделителей: «законменделя» совпадёт с «закон Менделя». */
function normalizeAlnum(text: string): string {
  return text.replace(/[^a-zа-яё0-9]/gi, "");
}
