"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { getTrainerCardImageUrl, getTrainerImageUrl, retryTrainerImage } from "@/lib/api";
import { ImageLightbox } from "@/components/media/ImageLightbox";

/** Указатель на изображении: доли 0–1 от ширины/высоты картинки. */
export type TrainerHotspot = { x: number; y: number; label: string; structure?: string };
/** Дополнительный снимок того же препарата (trainer_card_images). */
export type TrainerCardImage = { id: string; caption: string; hotspots?: TrainerHotspot[] };

type Props = {
  id: string;
  title?: string;
  lesson?: string;
  captions?: string[];
  /** Указатели основной картинки (колонка trainer_feed_cards.hotspots). */
  hotspots?: TrainerHotspot[];
  /** Дополнительные снимки: переключаются миниатюрами без выхода из атласа. */
  images?: TrainerCardImage[];
  onClose: () => void;
  /** Листание препаратов внутри атласа без возврата к сетке. */
  onPrev?: () => void;
  onNext?: () => void;
  position?: { index: number; total: number };
  /** Дополнительные действия в подвале просмотрщика. */
  actions?: ReactNode;
};

export function TrainerImageViewer({
  id,
  title,
  lesson,
  captions = [],
  hotspots = [],
  images = [],
  onClose,
  onPrev,
  onNext,
  position,
  actions,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = async (retry = false) => {
    setLoading(true);
    setRetrying(retry);
    const value = retry ? await retryTrainerImage(id) : await getTrainerImageUrl(id);
    setSrc(value);
    setLoading(false);
    setRetrying(false);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setActiveImageId(null);
    void getTrainerImageUrl(id).then((value) => {
      if (!alive) return;
      setSrc(value);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [id]);

  // Дополнительные снимки подгружаются только когда они есть: лишних запросов
  // у 236 карточек без галереи не появляется.
  useEffect(() => {
    if (!images.length) return;
    let alive = true;
    for (const image of images) {
      void getTrainerCardImageUrl(id, image.id).then((url) => {
        if (alive) setImageUrls((current) => ({ ...current, [image.id]: url }));
      });
    }
    return () => { alive = false; };
  }, [id, images]);

  if (!mounted) return null;

  const activeImage = activeImageId ? images.find((image) => image.id === activeImageId) || null : null;
  const activeSrc = activeImage ? imageUrls[activeImage.id] || null : src;
  const activeHotspots = activeImage ? (activeImage.hotspots || []) : hotspots;
  const activeCaption = activeImage?.caption || "";

  const gallery = images.length ? (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setActiveImageId(null)}
        className={
          "rounded-lg border px-2 py-1 text-[11px] font-semibold " +
          (!activeImageId ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600")
        }
      >
        Основной снимок
      </button>
      {images.map((image, index) => (
        <button
          key={image.id}
          type="button"
          onClick={() => setActiveImageId(image.id)}
          className={
            "rounded-lg border px-2 py-1 text-[11px] font-semibold " +
            (activeImageId === image.id ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600")
          }
        >
          {image.caption || `Снимок ${index + 2}`}
        </button>
      ))}
    </div>
  ) : null;

  const details = (
    <div className="flex flex-col gap-3 pb-1">
      {gallery}
      {activeCaption ? <p className="text-xs font-semibold text-white/70">{activeCaption}</p> : null}
      {activeHotspots.length > 0 ? (
        <ol className="grid gap-1 sm:grid-cols-2">
          {activeHotspots.map((spot, index) => (
            <li key={index} className="flex gap-1.5 text-[11px] leading-5">
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/80 text-[9px] font-bold text-white">
                {index + 1}
              </span>
              <span>
                {spot.label}
                {spot.structure ? <span className="text-white/50"> · {spot.structure}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {captions.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5">
          {captions.map((caption, index) => <li key={index}>{caption}</li>)}
        </ul>
      ) : null}
      {onPrev || onNext || position ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Назад
          </button>
          {position ? (
            <span className="px-1 text-xs font-semibold text-slate-500">
              {position.index} / {position.total}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          >
            Далее <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {actions}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/subjects/histology?tab=materials"
          onClick={onClose}
          className="inline-flex w-fit rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
        >
          Подробный материал и файлы
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex w-fit rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Закрыть атлас
        </button>
      </div>
    </div>
  );

  if (loading && !activeImageId) {
    return createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center p-6 text-sm text-white"
        style={{ zIndex: 2147483000, width: "100vw", height: "100dvh", background: "rgba(15,23,42,0.92)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Загрузка изображения"
      >
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Загрузка изображения...
      </div>,
      document.body,
    );
  }

  if (!activeSrc) {
    return createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center p-6 text-center text-white"
        style={{ zIndex: 2147483000, width: "100vw", height: "100dvh", background: "rgba(15,23,42,0.92)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Изображение временно недоступно"
      >
        <div>
          <div className="text-lg font-bold">Изображение временно недоступно</div>
          <p className="mt-2 text-sm text-white/60">Можно повторить загрузку, не закрывая страницу.</p>
          <button
            type="button"
            disabled={retrying}
            onClick={() => void load(true)}
            className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-50"
          >
            <RefreshCw className="mr-2 inline h-4 w-4" /> Повторить
          </button>
          <button type="button" onClick={onClose} className="ml-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
            Закрыть
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  // Указатели рисуются поверх картинки внутри той же сцены, поэтому они
  // масштабируются и перемещаются вместе с изображением при зуме.
  const stage = activeHotspots.length ? (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={activeSrc}
        alt={title || "Гистологический препарат"}
        className="block max-h-[calc(100dvh-6.6rem)] max-w-[calc(100vw-1rem)] select-none object-contain sm:max-h-[calc(100dvh-7.1rem)] sm:max-w-[calc(100vw-1.5rem)]"
        draggable={false}
      />
      {activeHotspots.map((spot, index) => (
        <span
          key={index}
          title={spot.label}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/70 bg-indigo-600/90 text-[10px] font-bold text-white shadow"
          style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
        >
          {index + 1}
        </span>
      ))}
    </div>
  ) : null;

  return (
    <ImageLightbox
      src={stage ? undefined : activeSrc}
      alt={title || "Гистологический препарат"}
      title={title || "Гистологический препарат"}
      caption={lesson ? `Занятие: ${lesson}` : "Атлас гистологических препаратов"}
      openOnMount
      showTrigger={false}
      onClose={onClose}
      details={details}
    >
      {stage}
    </ImageLightbox>
  );
}