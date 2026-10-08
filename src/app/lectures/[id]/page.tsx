"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getLecture, type Lecture } from "@/lib/api";
import { LectureRenderer } from "@/components/lectures/LectureRenderer";
import { LectureLearningLinks } from "@/components/lectures/LectureLearningLinks";

export default function LectureViewPage() {
  const params = useParams();
  const id = String(params?.id || "");
  const [lec, setLec] = useState<Lecture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void getLecture(id).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setLec(r.data.lecture);
        setError(null);
      } else {
        setLec(null);
        setError(r.error.message || "Не найдено");
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="card p-6 text-sm text-[var(--muted)]">Загрузка лекции…</div>;
  if (error || !lec) {
    return (
      <div className="space-y-4">
        <Link href="/lectures" className="inline-flex items-center gap-2 text-sm text-[var(--primary)]">
          <ArrowLeft className="h-4 w-4" /> К списку
        </Link>
        <div className="card p-6 text-sm text-rose-700">{error || "Лекция не найдена"}</div>
      </div>
    );
  }

  const media = Array.isArray(lec.media) ? lec.media : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/lectures" className="inline-flex items-center gap-2 text-sm text-[var(--primary)]">
        <ArrowLeft className="h-4 w-4" /> Все лекции
      </Link>
      <header>
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{lec.subject}</div>
        <h1 className="page-title mt-1">{lec.title}</h1>
        {lec.published_at && (
          <p className="page-subtitle">Опубликовано: {new Date(lec.published_at).toLocaleString("ru-RU")}</p>
        )}
      </header>

      <article className="card p-6">
        <LectureRenderer markdown={lec.body_md || ""} html={lec.body_html || ""} />
      </article>

      <LectureLearningLinks relatedLearning={lec.related_learning} />

      {media.length > 0 && (
        <section className="card space-y-3 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Поиск видео и схем</h2>
          <p className="text-xs text-[var(--muted)]">RuTube, VK, Яндекс — без VPN; YouTube — при доступе.</p>
          <ul className="space-y-2">
            {[...media]
              .sort((a, b) => (String(a.region) === "ru" ? 0 : 1) - (String(b.region) === "ru" ? 0 : 1))
              .map((m, i) => {
                const title = String(m.title || m.type || `Ссылка ${i + 1}`);
                const url = String(m.url || "");
                const isRu = String(m.region || "") === "ru";
                return (
                  <li key={i} className="rounded-xl border border-[var(--border)] p-3">
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isRu ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                      {isRu ? "без VPN" : "VPN?"}
                    </span>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--primary)] hover:underline">
                        {title} <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      title
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      )}
    </div>
  );
}
