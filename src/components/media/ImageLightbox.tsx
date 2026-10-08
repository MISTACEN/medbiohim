"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

type Props = {
  src: string;
  alt?: string;
  caption?: string;
  className?: string;
  imageClassName?: string;
};

export function ImageLightbox({
  src,
  alt = "",
  caption,
  className = "",
  imageClassName = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))));
      if (event.key === "-") setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))));
      if (event.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setZoom(1);
  }, [open]);

  async function enterFullscreen() {
    const element = viewerRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (element.requestFullscreen) await element.requestFullscreen();
    } catch {
      // The viewport-sized modal remains the fallback, including on iOS Safari.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={"group relative block w-full cursor-zoom-in text-left " + className}
        aria-label={caption ? `Открыть изображение: ${caption}` : "Открыть изображение на весь экран"}
      >
        <img
          src={src}
          alt={alt}
          className={"block max-w-full " + imageClassName}
          draggable={false}
        />
        <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white opacity-80 backdrop-blur transition group-hover:opacity-100">
          <Maximize2 className="h-3.5 w-3.5" /> Увеличить
        </span>
      </button>

      {open ? (
        <div
          ref={viewerRef}
          className="fixed inset-0 z-[120] flex min-h-[100dvh] w-full items-center justify-center bg-black/90 p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label={caption || alt || "Просмотр изображения"}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <div className="flex h-full w-full max-w-[1600px] flex-col items-center justify-center gap-3">
            <div className="flex w-full items-center justify-between gap-2 text-white">
              <div className="min-w-0 flex-1 truncate text-xs font-medium text-white/80 sm:text-sm">
                {caption || alt || "Просмотр изображения"}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} className="rounded-xl bg-white/10 p-2 hover:bg-white/20" aria-label="Уменьшить"><Minus className="h-4 w-4" /></button>
                <span className="min-w-12 text-center text-xs font-semibold">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))} className="rounded-xl bg-white/10 p-2 hover:bg-white/20" aria-label="Увеличить"><Plus className="h-4 w-4" /></button>
                <button type="button" onClick={() => setZoom(1)} className="rounded-xl bg-white/10 p-2 hover:bg-white/20" aria-label="Сбросить масштаб"><RotateCcw className="h-4 w-4" /></button>
                <button type="button" onClick={() => void enterFullscreen()} className="hidden rounded-xl bg-white/10 p-2 hover:bg-white/20 sm:inline-flex" aria-label="Во весь экран"><Maximize2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-white/10 p-2 hover:bg-white/20" aria-label="Закрыть"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-2xl bg-black/30 p-1 sm:p-2">
              <div className="flex min-h-full min-w-full items-center justify-center">
                <img
                  src={src}
                  alt={alt}
                  className="max-h-[calc(100dvh-7rem)] max-w-[calc(100vw-2rem)] select-none object-contain transition-transform duration-150 sm:max-h-[calc(100dvh-8rem)] sm:max-w-[calc(100vw-3rem)]"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
                  draggable={false}
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
            </div>

            <div className="text-center text-[11px] text-white/55">
              Нажми на фон или ✕ для закрытия · + / − или кнопки для масштаба
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
