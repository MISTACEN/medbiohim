"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
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

type Point = { x: number; y: number };

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

export function ImageLightbox({
  src, alt = "", caption, className = "", imageClassName = "",
  openOnMount = false, showTrigger = true, onClose, title, details,
}: Props) {
  const [open, setOpen] = useState(openOnMount);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null);
  const pinchRef = useRef<{ ids: [number, number]; startDistance: number; startZoom: number; startCenter: Point } | null>(null);
  const pointersRef = useRef(new Map<number, Point>());

  useEffect(() => setMounted(true), []);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const close = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setOpen(false); resetView(); onClose?.();
  };
  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));

  const changeZoom = (next: number, anchor?: Point) => {
    const nextZoom = clampZoom(next);
    setZoom((previousZoom) => {
      if (nextZoom === previousZoom) return previousZoom;
      if (anchor && stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        const localX = anchor.x - (rect.left + rect.width / 2);
        const localY = anchor.y - (rect.top + rect.height / 2);
        const ratio = nextZoom / previousZoom;
        setPan((previousPan) => ({
          x: previousPan.x + localX * (1 - ratio),
          y: previousPan.y + localY * (1 - ratio),
        }));
      }
      return nextZoom;
    });
  };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "+" || event.key === "=") changeZoom(zoom + ZOOM_STEP);
      if (event.key === "-") changeZoom(zoom - ZOOM_STEP);
      if (event.key === "0") resetView();
      if (event.key === "f" || event.key === "F") void enterFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, zoom]);

  useEffect(() => { if (openOnMount) setOpen(true); }, [openOnMount]);

  async function enterFullscreen() {
    const element = viewerRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (element.requestFullscreen) await element.requestFullscreen();
    } catch {
      // CSS viewport remains the fallback, including iOS Safari.
    }
  }

  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointers = [...pointersRef.current.entries()];
    if (pointers.length === 2) {
      const [, first] = pointers[0], [, second] = pointers[1];
      pinchRef.current = {
        ids: [pointers[0][0], pointers[1][0]],
        startDistance: distance(first, second),
        startZoom: zoom,
        startCenter: midpoint(first, second),
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: pan,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = pinchRef.current;
    if (pinch) {
      const first = pointersRef.current.get(pinch.ids[0]);
      const second = pointersRef.current.get(pinch.ids[1]);
      if (!first || !second || pinch.startDistance <= 0) return;
      const nextDistance = distance(first, second);
      const ratio = nextDistance / pinch.startDistance;
      const center = midpoint(first, second);
      const nextZoom = clampZoom(pinch.startZoom * ratio);
      const centerDelta = { x: center.x - pinch.startCenter.x, y: center.y - pinch.startCenter.y };
      setZoom(nextZoom);
      setPan((previous) => ({ x: previous.x + centerDelta.x, y: previous.y + centerDelta.y }));
      pinchRef.current = { ...pinch, startCenter: center, startDistance: nextDistance, startZoom: nextZoom };
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.origin.x + event.clientX - drag.start.x,
      y: drag.origin.y + event.clientY - drag.start.y,
    });
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    changeZoom(zoom * factor, { x: event.clientX, y: event.clientY });
  };

  const trigger = showTrigger ? (
    <button type="button" onClick={() => setOpen(true)}
      className={"group relative block w-full cursor-zoom-in text-left " + className}
      aria-label={caption ? \`Открыть изображение: \${caption}\` : "Открыть изображение на весь экран"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={"block max-w-full " + imageClassName} draggable={false} />
      <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white opacity-80 backdrop-blur transition group-hover:opacity-100">
        <Maximize2 className="h-3.5 w-3.5" /> Увеличить
      </span>
    </button>
  ) : null;

  const viewer = open && mounted ? createPortal(
    <div ref={viewerRef}
      className="fixed inset-0 z-[2147483000] flex min-h-[100dvh] w-full items-center justify-center bg-black/80 p-2 backdrop-blur-[3px] sm:p-4"
      style={{
        height: "100dvh", maxHeight: "100dvh",
        paddingTop: "calc(0.5rem + env(safe-area-inset-top))",
        paddingRight: "calc(0.5rem + env(safe-area-inset-right))",
        paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))",
        paddingLeft: "calc(0.5rem + env(safe-area-inset-left))",
        touchAction: "none",
      }}
      role="dialog" aria-modal="true"
      aria-label={title || caption || alt || "Просмотр изображения"}
      onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
      <div className="flex h-full w-full max-w-[1800px] flex-col items-center justify-center gap-2 sm:gap-3">
        <div className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.07] px-2 py-1.5 text-white shadow-lg backdrop-blur-xl sm:px-3 sm:py-2">
          <div className="min-w-0 flex-1 truncate px-1 text-xs font-medium text-white/80 sm:text-sm">
            {title || caption || alt || "Просмотр изображения"}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => changeZoom(zoom - ZOOM_STEP)} className="rounded-xl bg-white/[0.10] p-2 hover:bg-white/[0.18]" aria-label="Уменьшить"><Minus className="h-4 w-4" /></button>
            <span className="min-w-12 text-center text-xs font-semibold tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => changeZoom(zoom + ZOOM_STEP)} className="rounded-xl bg-white/[0.10] p-2 hover:bg-white/[0.18]" aria-label="Увеличить"><Plus className="h-4 w-4" /></button>
            <button type="button" onClick={resetView} className="rounded-xl bg-white/[0.10] p-2 hover:bg-white/[0.18]" aria-label="Сбросить масштаб и положение"><RotateCcw className="h-4 w-4" /></button>
            <button type="button" onClick={() => void enterFullscreen()} className="rounded-xl bg-white/[0.10] p-2 hover:bg-white/[0.18]" aria-label="Во весь экран"><Maximize2 className="h-4 w-4" /></button>
            <button type="button" onClick={close} className="rounded-xl bg-white/[0.10] p-2 hover:bg-white/[0.18]" aria-label="Закрыть"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div ref={stageRef}
          className="relative min-h-0 min-w-0 flex-1 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-2xl backdrop-blur-sm"
          style={{ touchAction: "none", cursor: zoom > 1 ? "grab" : "default" }}
          onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={endPointer} onPointerCancel={endPointer}
          onDoubleClick={(event) => {
            event.preventDefault();
            changeZoom(zoom > 1 ? 1 : 2, { x: event.clientX, y: event.clientY });
          }}>
          <div className="absolute inset-0 flex items-center justify-center overflow-visible">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt}
              className="max-h-[calc(100dvh-7.25rem)] max-w-[calc(100vw-1.5rem)] select-none object-contain sm:max-h-[calc(100dvh-8rem)] sm:max-w-[calc(100vw-3rem)]"
              style={{
                transform: \`translate3d(\${pan.x}px, \${pan.y}px, 0) scale(\${zoom})\`,
                transformOrigin: "center center", willChange: "transform",
                transition: dragRef.current || pinchRef.current ? "none" : "transform 120ms ease-out",
              }}
              draggable={false} onClick={(event) => event.stopPropagation()} />
          </div>
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[10px] font-medium text-white/70 backdrop-blur-md sm:bottom-3 sm:text-[11px]">
            {zoom > 1 ? "Перетаскивай изображение" : "Колесо / щипок / кнопки — масштаб"}
          </div>
        </div>

        {details ? <div className="max-h-[18dvh] w-full overflow-auto rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/85 backdrop-blur-sm">{details}</div> : null}

        <div className="hidden text-center text-[11px] text-white/55 sm:block">
          Колесо — масштаб · двойной клик — 200% · перетаскивание — перемещение · Esc / ✕ — закрытие
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return <>{trigger}{viewer}</>;
}
