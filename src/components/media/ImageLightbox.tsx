"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
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

type DragState = {
  pointerId: number;
  start: Point;
  origin: Point;
};

type PinchState = {
  ids: [number, number];
  startDistance: number;
  startZoom: number;
  startCenter: Point;
  startPan: Point;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

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
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const [dragging, setDragging] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const pointersRef = useRef(new Map<number, Point>());

  useEffect(() => setMounted(true), []);

  const clampZoom = (value: number) =>
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));

  /**
   * Keep the image reachable while panning. The calculation uses the
   * currently rendered image size divided by the current zoom, so it stays
   * stable even before the next transform render commits.
   */
  const clampPan = (value: Point, targetZoom = zoom): Point => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image) return value;

    const stageRect = stage.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const baseWidth = imageRect.width / Math.max(zoom, 0.01);
    const baseHeight = imageRect.height / Math.max(zoom, 0.01);
    const scaledWidth = baseWidth * targetZoom;
    const scaledHeight = baseHeight * targetZoom;

    const maxX = Math.max(0, (scaledWidth - stageRect.width) / 2 + 12);
    const maxY = Math.max(0, (scaledHeight - stageRect.height) / 2 + 12);

    return {
      x: Math.min(maxX, Math.max(-maxX, value.x)),
      y: Math.min(maxY, Math.max(-maxY, value.y)),
    };
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDragging(false);
    dragRef.current = null;
    pinchRef.current = null;
  };

  const close = () => {
    pointersRef.current.clear();
    dragRef.current = null;
    pinchRef.current = null;
    setDragging(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    setOpen(false);
    resetView();
    onClose?.();
  };

  /**
   * Zoom around the exact pointer/touch position, not only around the center.
   * This makes wheel, double-click and pinch feel like a real image viewer.
   */
  const changeZoom = (requestedZoom: number, anchor?: Point) => {
    const previousZoom = zoom;
    const nextZoom = clampZoom(requestedZoom);
    if (nextZoom === previousZoom) return;

    let nextPan = pan;

    if (anchor && stageRef.current) {
      const rect = stageRef.current.getBoundingClientRect();
      const localX = anchor.x - (rect.left + rect.width / 2);
      const localY = anchor.y - (rect.top + rect.height / 2);
      const ratio = nextZoom / previousZoom;
      nextPan = {
        x: pan.x + localX * (1 - ratio),
        y: pan.y + localY * (1 - ratio),
      };
    }

    setZoom(nextZoom);
    setPan(clampPan(nextPan, nextZoom));
  };

  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    const previousHtmlOverflow = html.style.overflow;
    const previousHtmlOverscroll = html.style.overscrollBehavior;
    const lockedScrollY = window.scrollY;

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${lockedScrollY}px`;
    body.style.width = "100%";
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeZoom(zoom + ZOOM_STEP);
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        changeZoom(zoom - ZOOM_STEP);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        resetView();
        return;
      }
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        void enterFullscreen();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      html.style.overflow = previousHtmlOverflow;
      html.style.overscrollBehavior = previousHtmlOverscroll;
      window.scrollTo(0, lockedScrollY);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (openOnMount) setOpen(true);
  }, [openOnMount]);

  useEffect(() => {
    if (!open || !stageRef.current) return;

    const onResize = () => setPan((value) => clampPan(value));
    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, [open, zoom]);

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

  const distance = (a: Point, b: Point) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const midpoint = (a: Point, b: Point): Point => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType !== "touch") return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const pointers = [...pointersRef.current.entries()];

    if (pointers.length === 2) {
      const first = pointers[0][1];
      const second = pointers[1][1];

      pinchRef.current = {
        ids: [pointers[0][0], pointers[1][0]],
        startDistance: distance(first, second),
        startZoom: zoom,
        startCenter: midpoint(first, second),
        startPan: pan,
      };
      dragRef.current = null;
      setDragging(false);
      return;
    }

    // Do not drag a fit-to-viewport image. At 100% the user should be able
    // to click/tap normally; panning starts once there is extra image area.
    if (zoom <= 1) return;

    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: pan,
    };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const pinch = pinchRef.current;

    if (pinch) {
      const first = pointersRef.current.get(pinch.ids[0]);
      const second = pointersRef.current.get(pinch.ids[1]);
      if (!first || !second || pinch.startDistance <= 0) return;

      const nextDistance = distance(first, second);
      const ratio = nextDistance / pinch.startDistance;
      const nextZoom = clampZoom(pinch.startZoom * ratio);
      const center = midpoint(first, second);

      const stage = stageRef.current;
      let nextPan = pinch.startPan;

      if (stage) {
        const rect = stage.getBoundingClientRect();
        const startLocalX =
          pinch.startCenter.x - (rect.left + rect.width / 2);
        const startLocalY =
          pinch.startCenter.y - (rect.top + rect.height / 2);

        nextPan = {
          x:
            pinch.startPan.x +
            (center.x - pinch.startCenter.x) +
            startLocalX * (1 - nextZoom / pinch.startZoom),
          y:
            pinch.startPan.y +
            (center.y - pinch.startCenter.y) +
            startLocalY * (1 - nextZoom / pinch.startZoom),
        };
      }

      setZoom(nextZoom);
      setPan(nextPan);

      pinchRef.current = {
        ...pinch,
        startDistance: nextDistance,
      };
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || zoom <= 1) return;

    setPan(
      clampPan({
        x: drag.origin.x + event.clientX - drag.start.x,
        y: drag.origin.y + event.clientY - drag.start.y,
      }),
    );
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);

    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {}

    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
      setPan((value) => clampPan(value));
    }

    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    changeZoom(zoom * factor, { x: event.clientX, y: event.clientY });
  };

  const trigger = showTrigger ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={
        "group relative block w-full cursor-zoom-in text-left " + className
      }
      aria-label={
        caption
          ? `Открыть изображение: ${caption}`
          : "Открыть изображение на весь экран"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={"block max-w-full " + imageClassName}
        draggable={false}
      />
      <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-85 shadow-lg backdrop-blur transition group-hover:opacity-100">
        <Maximize2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Открыть</span>
        <span className="sm:hidden">↗</span>
      </span>
    </button>
  ) : null;

  const viewer =
    open && mounted
      ? createPortal(
          <div
            ref={viewerRef}
            className="fixed inset-0 z-[2147483000] flex min-h-[100dvh] w-full items-center justify-center p-1.5 text-white sm:p-3"
            style={{
              backgroundColor: "rgba(3, 7, 18, 0.96)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              height: "100dvh",
              maxHeight: "100dvh",
              paddingTop: "calc(0.375rem + env(safe-area-inset-top))",
              paddingRight: "calc(0.375rem + env(safe-area-inset-right))",
              paddingBottom: "calc(0.375rem + env(safe-area-inset-bottom))",
              paddingLeft: "calc(0.375rem + env(safe-area-inset-left))",
              touchAction: "none",
            }}
            role="dialog"
            aria-modal="true"
            aria-label={title || caption || alt || "Просмотр изображения"}
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) close();
            }}
          >
            <div className="flex h-full w-full max-w-[1900px] flex-col items-center justify-center gap-1.5 sm:gap-2.5">
              <div
                className="flex w-full shrink-0 items-center gap-1.5 rounded-2xl border px-2 py-1.5 shadow-2xl sm:px-3 sm:py-2"
                style={{
                  backgroundColor: "rgba(20, 26, 44, 0.94)",
                  borderColor: "rgba(255,255,255,0.16)",
                  boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
                  backdropFilter: "blur(18px)",
                  WebkitBackdropFilter: "blur(18px)",
                }}
              >
                <div className="min-w-0 flex-1 overflow-hidden px-1">
                  <div className="truncate text-[11px] font-semibold text-white sm:text-sm">
                    {title || caption || alt || "Просмотр изображения"}
                  </div>
                  <div className="hidden text-[9px] text-white/45 sm:block">
                    Масштаб: {Math.round(zoom * 100)}% · {zoom > 1 ? "перемещение доступно" : "изображение вписано в окно"}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1 overflow-x-auto pl-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => changeZoom(zoom - ZOOM_STEP)}
                    className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl p-2 text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                    aria-label="Уменьшить"
                    title="Уменьшить"
                    style={{ backgroundColor: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)" }}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => changeZoom(zoom + ZOOM_STEP)}
                    className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.09] p-2 text-white transition hover:bg-white/[0.17] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    aria-label="Увеличить"
                    title="Увеличить"
                    style={{ backgroundColor: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)" }}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={resetView}
                    className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.09] p-2 text-white transition hover:bg-white/[0.17] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    aria-label="Сбросить масштаб и положение"
                    title="Сбросить"
                    style={{ backgroundColor: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)" }}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <span
                    className="inline-flex h-9 min-w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-2 text-[11px] font-bold tabular-nums text-white/85"
                    aria-live="polite"
                    style={{ backgroundColor: "rgba(0,0,0,0.32)", border: "1px solid rgba(255,255,255,0.18)", color: "#ffffff" }}
                  >
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => void enterFullscreen()}
                    className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.09] p-2 text-white transition hover:bg-white/[0.17] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    aria-label="Во весь экран"
                    title="Во весь экран"
                    style={{ backgroundColor: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)" }}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.09] p-2 text-white transition hover:bg-white/[0.17] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    aria-label="Закрыть"
                    title="Закрыть"
                    style={{ backgroundColor: "rgba(190, 35, 55, 0.88)", border: "1px solid rgba(255,255,255,0.28)", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div
                ref={stageRef}
                tabIndex={0}
                className="relative min-h-0 min-w-0 flex-1 w-full overflow-hidden rounded-[22px] shadow-[0_22px_70px_rgba(0,0,0,.5)] outline-none"
                style={{
                  backgroundColor: "rgba(0,0,0,0.72)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  touchAction: "none",
                  cursor:
                    zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
                }}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPointer}
                onPointerCancel={endPointer}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  changeZoom(
                    zoom > 1 ? 1 : 2,
                    { x: event.clientX, y: event.clientY },
                  );
                }}
                aria-label="Область просмотра изображения"
              >
                <div className="absolute inset-0 flex items-center justify-center p-1 sm:p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imageRef}
                    src={src}
                    alt={alt}
                    className="select-none object-contain max-h-[calc(100dvh-6.6rem)] max-w-[calc(100vw-1rem)] sm:max-h-[calc(100dvh-7.1rem)] sm:max-w-[calc(100vw-1.5rem)]"
                    style={{
                      transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                      transformOrigin: "center center",
                      willChange: "transform",
                      transition:
                        dragging || pinchRef.current
                          ? "none"
                          : "transform 130ms cubic-bezier(.22,1,.36,1)",
                      cursor: zoom > 1 ? "inherit" : "zoom-in",
                    }}
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>

                <div
                  className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full px-3 py-1.5 text-[9px] font-semibold text-white shadow-lg sm:top-3 sm:text-[10px]"
                  style={{
                    backgroundColor: "rgba(8,12,24,0.82)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                >
                  {zoom > 1
                    ? "Перетаскивай · колесо / щипок — масштаб"
                    : "Колесо / щипок / двойной клик — увеличить"}
                </div>

                {zoom > 1 ? (
                  <div
                    className="pointer-events-none absolute bottom-2 left-2 rounded-lg px-2 py-1 text-[9px] font-semibold text-white sm:bottom-3 sm:left-3"
                    style={{
                      backgroundColor: "rgba(8,12,24,0.78)",
                      border: "1px solid rgba(255,255,255,0.15)",
                    }}
                  >
                    {Math.round(zoom * 100)}%
                  </div>
                ) : null}
              </div>

              {details ? (
                <div className="max-h-[22dvh] w-full shrink-0 overflow-auto rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/85 shadow-lg backdrop-blur-sm">
                  {details}
                </div>
              ) : null}

              <div className="hidden shrink-0 text-center text-[10px] text-white/45 sm:block">
                Колесо — масштаб · двойной клик — 200% · перетаскивание — перемещение · 0 — сброс · F — полный экран · Esc — закрыть
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {trigger}
      {viewer}
    </>
  );
}
