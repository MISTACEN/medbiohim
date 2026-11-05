"use client";

/**
 * Просмотр PPTX: слайды, навигация, заметки и полноэкранный режим.
 * Анимации и переходы не воспроизводятся — показывается содержимое слайда.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, MessageSquare, X } from "lucide-react";
import { DEFAULT_LIMITS } from "../limits";
import { parsePptx, type Presentation } from "../office/pptx";
import { ViewerError, ViewerLoading, ViewerNotice } from "./parts";
import { useFileBytes } from "./useFileBytes";

export function PptxViewer({ url }: { url: string }) {
  const { status, bytes, error, reload } = useFileBytes(url, DEFAULT_LIMITS.maxOfficeBytes);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status !== "ready" || !bytes) return;
    let active = true;
    setParseError(null);
    parsePptx(bytes)
      .then((result) => {
        if (active) setPresentation(result);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setPresentation(null);
        setParseError(reason instanceof Error ? reason.message : "Не удалось разобрать PPTX.");
      });
    return () => {
      active = false;
    };
  }, [status, bytes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setIndex((value) => Math.min(value + 1, (presentation?.slides.length ?? 1) - 1));
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentation]);

  if (status === "loading") return <ViewerLoading label="Разбираем презентацию…" />;
  if (status === "error") return <ViewerError message={error ?? ""} onRetry={reload} />;
  if (parseError) return <ViewerError message={parseError} onRetry={reload} />;
  if (!presentation) return <ViewerLoading label="Разбираем презентацию…" />;
  if (!presentation.slides.length) {
    return <ViewerNotice tone="info">В презентации нет слайдов с текстом.</ViewerNotice>;
  }

  const slide = presentation.slides[Math.min(index, presentation.slides.length - 1)];

  async function toggleFullscreen() {
    const element = containerRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await element.requestFullscreen?.();
    } catch {
      // Полноэкранный режим может быть запрещён настройками браузера.
    }
  }

  return (
    <div className="space-y-2">
      {presentation.warnings.map((warning) => (
        <ViewerNotice key={warning}>{warning}</ViewerNotice>
      ))}

      <div
        ref={containerRef}
        className="flex min-h-[260px] flex-col justify-between rounded-xl border border-[var(--border)] bg-white p-5 dark:bg-slate-900"
      >
        <div>
          {slide.title ? <h3 className="text-lg font-extrabold">{slide.title}</h3> : null}
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            {slide.lines.map((line, lineIndex) => (
              <li key={lineIndex} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                <span className="min-w-0 whitespace-pre-wrap">{line}</span>
              </li>
            ))}
          </ul>
          {!slide.lines.length && !slide.title ? (
            <p className="text-sm text-slate-500">На слайде только изображения ({slide.images}).</p>
          ) : null}
        </div>

        {showNotes && slide.notes.length ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Заметки</div>
            {slide.notes.map((note, noteIndex) => (
              <p key={noteIndex} className="whitespace-pre-wrap">{note}</p>
            ))}
          </div>
        ) : null}

        <div className="mt-4 text-[11px] uppercase tracking-wide text-slate-400">
          Слайд {index + 1} из {presentation.slides.length}
          {slide.images ? ` · изображений: ${slide.images}` : ""}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-1 text-xs"
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0}
        >
          <ChevronLeft className="h-4 w-4" /> Назад
        </button>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-1 text-xs"
          onClick={() => setIndex((value) => Math.min(value + 1, presentation.slides.length - 1))}
          disabled={index >= presentation.slides.length - 1}
        >
          Вперёд <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="btn-pill inline-flex items-center gap-1 text-xs"
          onClick={() => setShowNotes((value) => !value)}
          aria-pressed={showNotes}
        >
          {showNotes ? <X className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />} Заметки
        </button>
        <button
          type="button"
          className="btn-pill inline-flex items-center gap-1 text-xs"
          onClick={() => void toggleFullscreen()}
        >
          <Maximize2 className="h-3.5 w-3.5" /> Во весь экран
        </button>
      </div>
    </div>
  );
}
