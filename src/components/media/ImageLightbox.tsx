"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minus, Plus, RotateCcw, X, Minimize2 } from "lucide-react";

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
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);

  const close = () => {
    setOpen(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setFullscreen(false);
    onClose?.();
  };

  const changeZoom = (next: number) => {
    const value = Math.min(5, Math.max(1, Number(next.toFixed(2))));
    setZoom(value);
    if (value === 1) setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "+" || event.key === "=") changeZoom(zoom + 0.25);
      if (event.key === "-") changeZoom(zoom - 0.25);
      if (event.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
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

  useEffect(() => {
    if (!open) setZoom(1);
  }, [open]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

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
      // The CSS viewport viewer is the primary fallback on Safari/iOS.
    }
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointersRef.current.size === 1 && zoom > 1) {
      dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    }
    if (pointersRef.current.size === 2) {
      const points = Array.from(pointersRef.current.values());
      const dx = points[0].x - points[1].x;
      const dy = points[0].y - points[1].y;
      pinchStartRef.current = { distance: Math.hypot(dx, dy), zoom };
      dragRef.current = null;
    }
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const points = Array.from(pointersRef.current.values());
      const dx = points[0].x - points[1].x;
      const dy = points[0].y - points[1].y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      changeZoom(pinchStartRef.current.zoom * (distance / pinchStartRef.current.distance));
      return;
    }

    if (dragRef.current && zoom > 1) {
      setPan({
        x: dragRef.current.panX + event.clientX - dragRef.current.x,
        y: dragRef.current.panY + event.clientY - dragRef.current.y,
      });
    }
  }

  function pointerUp(event: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
  }

  return (
    <>
      {showTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={"group relative block w-full cursor-zoom-in text-left " + className}
          aria-label={caption ? `Открыть изображение: ${caption}` : "Открыть изображение на весь экран"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className={"block max-w-full " + imageClassName} draggable={false} />
          <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white opacity-80 backdrop-blur transition group-hover:opacity-100">
            <Maximize2 className="h-3.5 w-3.5" /> Открыть
          </span>
        </button>
      )}

      {open ? (
        <div
          ref={viewerRef}
          className="fixed inset-0 z-[120] flex h-[100dvh] min-h-[100dvh] w-full select-none flex-col bg-black/95 text-white"
          style={{
            paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
            paddingRight: "calc(0.75rem + env(safe-area-inset-right))",
            paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
            paddingLeft: "calc(0.75rem + env(safe-area-inset-left))",
          }}
          role="dialog"
          aria-modal="true"
          aria-label={title || caption || alt || "Просмотр изображения"}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex w-full shrink-0 items-center gap-2 border-b border-white/10 pb-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold sm:text-base">{title || caption || alt || "Просмотр изображения"}</div>
                {caption && caption !== title ? <div className="truncate text-[11px] text-white/55">{caption}</div> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => changeZoom(zoom - 0.25)} className="rounded-xl bg-white/10 p-2.5 hover:bg-white/20" aria-label="Уменьшить"><Minus className="h-4 w-4" /></button>
                <span className="min-w-12 text-center text-xs font-semibold">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => changeZoom(zoom + 0.25)} className="rounded-xl bg-white/10 p-2.5 hover:bg-white/20" aria-label="Увеличить"><Plus className="h-4 w-4" /></button>
                <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded-xl bg-white/10 p-2.5 hover:bg-white/20" aria-label="Сбросить масштаб"><RotateCcw className="h-4 w-4" /></button>
                <button type="button" onClick={() => void enterFullscreen()} className="rounded-xl bg-white/10 p-2.5 hover:bg-white/20" aria-label={fullscreen ? "Выйти из полного экрана" : "Полный экран"}>
                  {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button type="button" onClick={close} className="rounded-xl bg-white/10 p-2.5 hover:bg-white/20" aria-label="Закрыть"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div
              className="relative min-h-0 flex-1 overflow-hidden overscroll-none touch-none"
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={pointerUp}
              onDoubleClick={() => changeZoom(zoom > 1 ? 1 : 2)}
              onWheel={(event) => {
                if (event.ctrlKey || event.deltaY !== 0) {
                  event.preventDefault();
                  changeZoom(zoom + (event.deltaY < 0 ? 0.2 : -0.2));
                }
              }}
              onMouseDown={(event) => {
                if (event.currentTarget === event.target && zoom === 1) close();
              }}
            >
              <div className="flex h-full w-full items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={alt}
                  className="max-h-full max-w-full object-contain will-change-transform"
                  style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`, transformOrigin: "center center" }}
                  draggable={false}
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
            </div>

            {details ? <div className="max-h-[28dvh] shrink-0 overflow-auto border-t border-white/10 pt-2 text-xs text-white/80">{details}</div> : null}

            <div className="shrink-0 pt-2 text-center text-[10px] text-white/45 sm:text-[11px]">
              Кнопки масштаба · двойное нажатие · колесо мыши · перетаскивание увеличенного изображения · Esc для закрытия
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
