"use client";

import { useEffect, useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { LectureRenderer } from "@/components/lectures/LectureRenderer";
import { loadLectureSet, type PortalLectureSet } from "@/lib/portalContent";

/** Архивные HTML-лекции старого портала course/ — внутри вкладки «Портал». */
export default function ArchiveLectures({ setId }: { setId: "bio" | "math" | "chem" }) {
  const [set, setSet] = useState<PortalLectureSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSet(null);
    setActiveId(null);
    loadLectureSet(setId)
      .then((data) => {
        if (!alive) return;
        setSet(data);
        setActiveId(data.items[0]?.id ?? null);
      })
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, [setId]);

  if (error) return <div className="card p-5 text-sm text-rose-600">{error}</div>;
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
          <BookOpen className="size-5 text-indigo-500" /> {set.subject} · конспекты
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {set.items.map((t) => (
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
        </div>
      </div>
      {active && (
        <article className="card p-5">
          <h3 className="mb-3 text-base font-bold text-slate-800">{active.title}</h3>
          <LectureRenderer markdown="" html={active.html} />
        </article>
      )}
    </section>
  );
}
