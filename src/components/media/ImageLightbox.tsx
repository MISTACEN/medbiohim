"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
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

    const updateViewport = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      setViewportHeight(Math.max(1, Math.round(height)));
    };
    updateViewport();
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);

    const previous = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    const scrollY = window.scrollY;

    // Lock the page itself. This prevents iOS Safari from scrolling the Atlas
    // underneath the viewer while the image is open.
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key === "+" || event.key === "=") changeZoom(zoomRef.current + 0.25);
      if (event.key === "-") changeZoom(zoomRef.current - 0.25);
      if (event.key === "0") {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous.overflow;
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.width = previous.width;
      window.scrollTo(0, scrollY);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (openOnMount) setOpen(true);
  }, [openOnMount]);

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
      // Native fullscreen is an enhancement. The centered CSS viewport viewer
      // remains fully usable on iOS Safari.
    }
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointersRef.current.size === 1 && zoom > 1) {
      dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    }
    if (pointersRef.current.size === 2) {
      const points = Array.from(pointersRef.current.values());
      const dx = points[0].x - points[1].x;
      const dy = points[0].y - points[1].y;
      pinchStartRef.current = { distance: Math.max(1, Math.hypot(dx, dy)), zoom };
      dragRef.current = null;
    }
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
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

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
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

      {open && mounted ? createPortal(
        <div
          ref={viewerRef}
          className="fixed inset-0 z-[120] flex w-screen items-center justify-center overflow-hidden p-2 backdrop-blur-md sm:p-4"
          style={{
            zIndex: 2147483000,
            width: "100vw",
            maxWidth: "100vw",
            maxHeight: "100dvh",
            background: "rgba(15,23,42,0.58)",
            height: viewportHeight ? `${viewportHeight}px` : "100dvh",
            minHeight: "100svh",
            paddingTop: "calc(0.5rem + env(safe-area-inset-top))",
            paddingRight: "calc(0.5rem + env(safe-area-inset-right))",
            paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))",
            paddingLeft: "calc(0.5rem + env(safe-area-inset-left))",
          }}
          role="dialog"
          aria-modal="true"
          aria-label={title || caption || alt || "Просмотр изображения"}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close();
          }}
        >
          <div
            className="relative mx-auto flex h-[calc(100%-0.5rem)] max-h-[920px] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/70 shadow-2xl backdrop-blur-2xl sm:h-[calc(100%-1rem)]" style={{ background: "rgba(255,255,255,0.92)", color: "#0f172a" }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-start gap-3 border-b border-slate-200/80 px-3 py-3 sm:px-5 sm:py-4" style={{ background: "rgba(255,255,255,0.78)" }}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-900 sm:text-base">
                  {title || caption || alt || "Просмотр изображения"}
                </div>
                {caption && caption !== title ? (
                  <div className="mt-0.5 truncate text-[11px] text-slate-500 sm:text-xs">{caption}</div>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                <button type="button" onClick={() => changeZoom(zoom - 0.25)} className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-700 shadow-sm hover:bg-white" aria-label="Уменьшить" title="Уменьшить"><Minus className="h-4 w-4" /></button>
                <span className="flex min-w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50/80 px-2 text-xs font-semibold text-slate-700">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => changeZoom(zoom + 0.25)} className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-700 shadow-sm hover:bg-white" aria-label="Увеличить" title="Увеличить"><Plus className="h-4 w-4" /></button>
                <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-700 shadow-sm hover:bg-white" aria-label="Сбросить масштаб" title="Сбросить"><RotateCcw className="h-4 w-4" /></button>
                <button type="button" onClick={() => void enterFullscreen()} className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-700 shadow-sm hover:bg-white" aria-label={fullscreen ? "Выйти из полного экрана" : "Полный экран"} title={fullscreen ? "Выйти из полного экрана" : "Полный экран"}>
                  {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button type="button" onClick={close} className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-700 shadow-sm hover:bg-white" aria-label="Закрыть" title="Закрыть"><X className="h-5 w-5" /></button>
              </div>
            </header>

            <div
              className="relative min-h-0 flex-1 overflow-hidden overscroll-none touch-none" style={{ background: "rgba(241,245,249,0.78)" }}
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
              <div className="flex h-full w-full items-center justify-center p-2 sm:p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={alt}
                  className="max-h-full max-w-full select-none object-contain"
                  style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`, transformOrigin: "center center" }}
                  draggable={false}
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
            </div>

            {details ? (
              <div className="max-h-[22dvh] shrink-0 overflow-auto border-t border-slate-200/80 px-3 py-3 text-xs text-slate-700 sm:px-5" style={{ background: "rgba(255,255,255,0.78)" }}>
                {details}
              </div>
            ) : null}

            <div className="shrink-0 border-t border-slate-200/70 px-3 py-1.5 text-center text-[10px] text-slate-500 sm:text-[11px]" style={{ background: "rgba(255,255,255,0.60)" }}>
              Увеличение · перетаскивание · двойное нажатие · Esc для закрытия
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
