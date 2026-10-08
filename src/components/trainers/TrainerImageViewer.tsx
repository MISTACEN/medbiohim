"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { getTrainerImageUrl, retryTrainerImage } from "@/lib/api";
import { ImageLightbox } from "@/components/media/ImageLightbox";

type Props = {
  id: string;
  title?: string;
  lesson?: string;
  captions?: string[];
  onClose: () => void;
};

export function TrainerImageViewer({ id, title, lesson, captions = [], onClose }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

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
    void getTrainerImageUrl(id).then((value) => {
      if (!alive) return;
      setSrc(value);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[120] flex h-[100dvh] items-center justify-center bg-black/95 text-sm text-white">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Загрузка изображения…
      </div>
    );
  }

  if (!src) {
    return (
      <div className="fixed inset-0 z-[120] flex h-[100dvh] items-center justify-center bg-black/95 p-6 text-center text-white">
        <div>
          <div className="text-lg font-bold">Изображение временно недоступно</div>
          <p className="mt-2 text-sm text-white/60">Не закрываем просмотр страницы — можно повторить загрузку.</p>
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
      </div>
    );
  }

  return (
    <ImageLightbox
      src={src}
      alt={title || "Гистологический препарат"}
      title={title || "Гистологический препарат"}
      caption={lesson ? `Занятие: ${lesson}` : "Атлас гистологических препаратов"}
      openOnMount
      showTrigger={false}
      onClose={onClose}
      details={
        <div className="flex flex-col gap-2 pb-1">
          {captions.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {captions.map((caption, index) => <li key={index}>{caption}</li>)}
            </ul>
          ) : null}
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
      }
    />
  );
}
