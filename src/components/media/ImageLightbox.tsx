"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

type Props = {
  src: string;
  alt?: string;
  caption?: string;
  className?: string;
  imageClassName?: string;
  openOnMount?: boolean;
  showTrigger?: boolean;
  onClose?: () => void;
  title?: string;
  details?: ReactNode;
};

export function ImageLightbox({
  src,
  alt = "",
  caption,
  className = "",
  imageClassName = "",
  openOnMount = false,
  showTrigger = true,
  onClose,
  title,
  details,
}: Props) {
  const [open, setOpen] = useState(openOnMount);
  const [zoom, setZoom] = useState(1);
  const [mounted, setMounted] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const close = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setOpen(false);
    setZoom(1);
    onClose?.();
  };

  const changeZoom = (next: number) => {
    setZoom(Math.min(3, Math.max(1, Number(next.toFixed(2)))));
  };

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "+" || event.key === "=") changeZoom(zoom + 0.25);
      if (event.key === "-") changeZoom(zoom - 0.25);
      if (event.key === "0") changeZoom(1);
    };

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, zoom]);

  useEffect(() => {
    if (openOnMount) setOpen(true);
  }, [openOnMount]);

  async function enterFullscreen() {
    const element = viewerRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (element.requestFullscreen) {
        await element.requestFullscreen();
      }
    } catch {
      // CSS viewport remains the fallback, including iOS Safari.
    }
  }

  const trigger = showTrigger ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={"group relative block w-full cursor-zoom-in text-left " + className}
      aria-label={caption ? `Открыть изображение: ${caption}` : "Открыть изображение на весь экран"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={"block max-w-full " + imageClassName} draggable={false} />
      <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white opacity-80 backdrop-blur transition group-hover:opacity-100">
        <Maximize2 className="h-3.5 w-3.5" /> Увеличить
      </span>
    </button>
  ) : null;

  const viewer = open && mounted ? createPortal(
    <div
      ref={viewerRef}
      className="fixed inset-0 z-[2147483000] flex min-h-[100dvh] w-full items-center justify-center bg-black/80 backdrop-blur-[2px] p-3 sm:p-5"
      style={{
        height: "100dvh",
        maxHeight: "100dvh",
        paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
        paddingRight: "calc(0.75rem + env(safe-area-inset-right))",
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        paddingLeft: "calc(0.75rem + env(safe-area-inset-left))",
        touchAction: "none",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title || caption || alt || "Просмотр изображения"}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <div className="flex h-full w-full max-w-[1600px] flex-col items-center justify-center gap-3">
        <div className="flex w-full items-center justify-between gap-2 text-white">
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-white/80 sm:text-sm">
            {title || caption || alt || "Просмотр изображения"}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => changeZoom(zoom - 0.25)} className="rounded-xl bg-white/[0.12] p-2 hover:bg-white/[0.18]" aria-label="Уменьшить"><Minus className="h-4 w-4" /></button>
            <span className="min-w-12 text-center text-xs font-semibold">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => changeZoom(zoom + 0.25)} className="rounded-xl bg-white/10 p-2 hover:bg-white/20" aria-label="Увеличить"><Plus className="h-4 w-4" /></button>
            <button type="button" onClick={() => changeZoom(1)} className="rounded-xl bg-white/10 p-2 hover:bg-white/20" aria-label="Сбросить масштаб"><RotateCcw className="h-4 w-4" /></button>
            <button type="button" onClick={() => void enterFullscreen()} className="rounded-xl bg-white/[0.12] p-2" aria-label="Во весь экран"><Maximize2 className="h-4 w-4" /></button>
            <button type="button" onClick={close} className="rounded-xl bg-white/10 p-2 hover:bg-white/20" aria-label="Закрыть"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div
          className="min-h-0 min-w-0 flex-1 overflow-auto rounded-2xl border border-white/10 bg-black/25 p-1 backdrop-blur-sm sm:p-2"
          style={{ touchAction: "none" }}
        >
          <div className="flex min-h-full min-w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
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

        {details ? (
          <div className="max-h-[18dvh] w-full overflow-auto rounded-xl bg-black/20 px-3 py-2 text-xs text-white/85 backdrop-blur-sm">{details}</div>
        ) : null}

        <div className="text-center text-[11px] text-white/55">
          Нажми на фон или ✕ для закрытия · + / − или кнопки для масштаба
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return <>{trigger}{viewer}</>;
}
