"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getLecture, type Lecture } from "@/lib/api";

function renderMd(md: string): string {
  let s = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  s = s.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
  s = s.replace(/^- (.+)$/gm, "<li>$1</li>");
  s = s.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  s = s.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  s = s.replace(/\n\n/g, "</p><p>");
  return `<p>${s}</p>`;
}

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

      <article
        className="card prose prose-slate max-w-none p-6 text-sm leading-relaxed dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: renderMd(lec.body_md || "") }}
      />

      {media.length > 0 && (
        <section className="card space-y-3 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Видео и материалы по теме</h2>
          <p className="text-xs text-[var(--muted)]">Сначала площадки без VPN (RuTube, VK, Яндекс), затем YouTube при доступе.</p>
          <ul className="space-y-3">
            {[...media].sort((a, b) => (String(a.region) === "ru" ? 0 : 1) - (String(b.region) === "ru" ? 0 : 1)).map((m, i) => {
              const title = String(m.title || m.type || `Ссылка ${i + 1}`);
              const url = String(m.url || "");
              const isRu = String(m.region || "") === "ru";
              return (
                <li key={i} className="rounded-xl border border-[var(--border)] p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isRu ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                      {isRu ? "без VPN" : "может нужен VPN"}
                    </span>
                    <span className="text-xs text-[var(--muted)]">{String(m.type || "")}</span>
                  </div>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)] hover:underline">
                      {title} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="text-sm">{title}</span>
                  )}
                  {m.note ? <div className="mt-1 text-xs text-[var(--muted)]">{String(m.note)}</div> : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
