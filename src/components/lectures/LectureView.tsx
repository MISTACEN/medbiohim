"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, FileDown, Printer } from "lucide-react";
import type { Lecture } from "@/lib/api";
import { LectureRenderer } from "@/components/lectures/LectureRenderer";
import { LectureLearningLinks } from "@/components/lectures/LectureLearningLinks";
import { LectureBlocksNav } from "@/components/lectures/LectureBlocksNav";
import { downloadLectureWord, printLecturePdf } from "@/lib/lectures/exportLecture";
import { useLectureProgress } from "@/hooks/useLectureProgress";
import { lectureSolvedCount, lectureTaskTotal, splitLectureBlocks } from "@/lib/lectureProgress";

/**
 * Оформление лекции в одном месте: отдельная страница /lectures/:id и чтение
 * лекции прямо внутри предмета (вкладка «Лекции») показывают один и тот же
 * блок: оглавление по блокам, шапку с названием, скачиванием и прогрессом,
 * текст, навигацию «предыдущий/следующий блок» и привязанные материалы.
 */
export type LectureViewProps = {
  lecture: Lecture;
  /** id лекции — ключ для локального прогресса мини-тестов. */
  lectureId?: string;
  /** Куда ведёт ссылка «назад» на отдельной странице лекции. */
  backHref?: string;
  backLabel?: string;
  /** В предмете лекция закрывается без перехода — кнопка вместо ссылки. */
  onBack?: () => void;
  className?: string;
};

export function LectureView({
  lecture,
  lectureId,
  backHref = "/lectures",
  backLabel = "К списку",
  onBack,
  className,
}: LectureViewProps) {
  const progress = useLectureProgress();
  const contentRef = useRef<HTMLDivElement>(null);
  const id = lectureId || String((lecture as any)?.id || "");

  // Внутри лекции меняются только блоки-подтемы: оглавление и рендер берут
  // один и тот же разбор markdown по H2/H3.
  const blocks = useMemo(() => splitLectureBlocks((lecture as any)?.body_markdown), [lecture]);
  const [activeBlock, setActiveBlock] = useState(0);

  useEffect(() => {
    setActiveBlock(0);
  }, [id]);

  const changeBlock = (next: number) => {
    setActiveBlock(next);
    contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const total = lectureTaskTotal((lecture as any)?.body_markdown);
  const solved = lectureSolvedCount(id, total, progress);
  const percent = total > 0 ? Math.round((solved / total) * 100) : 0;

  const media = Array.isArray(lecture.media) ? lecture.media : [];
  const moduleTitle = lecture.subject || lecture.subject_slug;
  const safeIndex = Math.min(Math.max(activeBlock, 0), Math.max(0, blocks.length - 1));
  const single = blocks.length > 1 ? safeIndex : undefined;
  const backClassName =
    "inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]";

  return (
    <div className={className || "space-y-4"}>
      {onBack ? (
        <button type="button" onClick={onBack} className={backClassName}>
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </button>
      ) : (
        <Link href={backHref} className={backClassName}>
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
      )}

      <section className="card overflow-hidden p-0">
        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          {blocks.length > 0 && (
            <LectureBlocksNav
              blocks={blocks}
              activeIndex={safeIndex}
              onSelect={changeBlock}
              lectureId={String((lecture as any).id || id)}
              lessonTitle={lecture.title}
              moduleTitle={moduleTitle}
            />
          )}

          <div ref={contentRef} className="min-w-0 scroll-mt-24">
            <header className="border-b border-[var(--border)] px-4 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">
                    {moduleTitle || "Лекция"}
                  </div>
                  <h1 className="page-title mt-1 break-words">{lecture.title}</h1>
                  {lecture.published_at && (
                    <p className="page-subtitle">
                      Опубликовано: {new Date(lecture.published_at).toLocaleString("ru-RU")}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => downloadLectureWord(lecture as any)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      <FileDown className="h-3.5 w-3.5" /> Скачать Word
                    </button>
                    <button
                      type="button"
                      onClick={() => printLecturePdf(lecture as any)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      <Printer className="h-3.5 w-3.5" /> Скачать PDF
                    </button>
                  </div>
                </div>
                {total > 0 && (
                  <div className="w-full sm:max-w-[200px]">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      <span>Задачи</span>
                      <span>
                        {solved} / {total}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[var(--primary)]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      Решено задач: {solved} из {total}
                    </p>
                  </div>
                )}
              </div>
            </header>

            <article className="px-4 py-4 sm:px-6 sm:py-5">
              <LectureRenderer
                markdown={lecture.body_markdown || lecture.body_md || ""}
                html={lecture.body_html || ""}
                lectureId={String((lecture as any).id || id)}
                activeBlock={single}
              />
            </article>

            <div className="space-y-4 px-4 pb-5 sm:px-6">
              {blocks.length > 1 && (
                <nav className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                  <button
                    type="button"
                    disabled={safeIndex === 0}
                    onClick={() => changeBlock(safeIndex - 1)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm font-semibold disabled:opacity-40 sm:flex-none"
                  >
                    <ArrowLeft className="h-4 w-4" /> Предыдущий блок
                  </button>
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    Блок {safeIndex + 1} из {blocks.length}
                  </span>
                  <button
                    type="button"
                    disabled={safeIndex >= blocks.length - 1}
                    onClick={() => changeBlock(safeIndex + 1)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 sm:flex-none"
                  >
                    Следующий блок <ArrowRight className="h-4 w-4" />
                  </button>
                </nav>
              )}

              <LectureLearningLinks relatedLearning={lecture.related_learning} />

              {media.length > 0 && (
                <section className="space-y-3 rounded-xl border border-[var(--border)] p-4">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
                    Поиск видео и схем
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    RuTube, VK, Яндекс — без VPN; YouTube — при доступе.
                  </p>
                  <ul className="space-y-2">
                    {[...media]
                      .sort(
                        (a, b) =>
                          (String(a.region) === "ru" ? 0 : 1) -
                          (String(b.region) === "ru" ? 0 : 1)
                      )
                      .map((m, i) => {
                        const title = String(m.title || m.type || `Ссылка ${i + 1}`);
                        const url = String(m.url || "");
                        const isRu = String(m.region || "") === "ru";
                        return (
                          <li key={i} className="rounded-xl border border-[var(--border)] p-3">
                            <span
                              className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isRu ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "bg-slate-100 text-slate-600"}`}
                            >
                              {isRu ? "без VPN" : "VPN?"}
                            </span>
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm font-medium text-[var(--primary)] hover:underline"
                              >
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
          </div>
        </div>
      </section>
    </div>
  );
}
