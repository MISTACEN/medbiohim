"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getTrainerImageUrl, retryTrainerImage } from "@/lib/api";
import type { Training } from "@/lib/content-api";
import { ImageLightbox } from "@/components/media/ImageLightbox";

export const topicNames: Record<string, string> = {
  mbh: "МБХ", electronogram: "Электронограммы", identify: "Определение препарата",
  stom_mbh: "Стом. гистология", orofacial: "Орофациальная область", histology: "Гистология",
};
export const topicLabel = (x: string) => topicNames[x] || x.replaceAll("_", " ");

export function ImageBox({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const load = async (retry = false) => {
    setLoading(true);
    const u = retry ? await retryTrainerImage(id) : await getTrainerImageUrl(id);
    setSrc(u);
    setLoading(false);
    setRetrying(false);
  };
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void getTrainerImageUrl(id).then((u) => { if (alive) { setSrc(u); setLoading(false); } });
    return () => { alive = false; };
  }, [id]);
  if (loading) return <div className="flex min-h-[300px] items-center justify-center bg-slate-100 text-sm text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Загрузка изображения…</div>;
  if (!src) return <div className="flex min-h-[300px] flex-col items-center justify-center bg-slate-100 p-6 text-center"><span className="text-4xl">?</span><b className="mt-2">Изображение временно недоступно</b><button disabled={retrying} onClick={() => { setRetrying(true); void load(true); }} className="mt-3 rounded-xl border bg-white px-4 py-2 text-sm font-semibold"><RefreshCw className="mr-2 inline h-4 w-4" />Повторить</button></div>;
  return (
    <ImageLightbox
      src={src}
      alt="Гистологический препарат"
      caption="Гистологический препарат — нажмите для просмотра в пределах экрана и увеличения"
      className="min-h-[300px] w-full bg-slate-100"
      imageClassName="mx-auto max-h-[650px] min-h-[300px] w-full object-contain"
    />
  );
}

export function AtlasThumb({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getTrainerImageUrl(id).then((u) => { if (alive) setSrc(u); });
    return () => { alive = false; };
  }, [id]);
  if (!src) return <div className="flex h-full min-h-[100px] items-center justify-center text-xs text-slate-400">…</div>;
  return <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />;
}

export function Dots({ answers, current, onSelect }: { answers: Array<{ id: string; is_correct?: boolean | null; is_skipped?: boolean }>; current: number; onSelect: (n: number) => void }) {
  return <div className="flex flex-wrap gap-1.5">{answers.map((a, i) => {
    const cls = a.is_correct === true ? "bg-[var(--status-ok-fg)] text-white" : a.is_correct === false ? "bg-[var(--status-critical-fg)] text-white" : a.is_skipped ? "bg-slate-300" : "border bg-white";
    return <button key={a.id} onClick={() => onSelect(i)} className={"h-8 min-w-8 rounded-full px-2 text-xs font-bold " + (i === current && !a.is_correct && !a.is_skipped ? "ring-2 ring-indigo-300 " : "") + cls}>{i + 1}</button>;
  })}</div>;
}

export function historyLabel(t: Training) {
  if (t.status === "in_progress") return "Не завершено";
  if (t.status === "completed") return "Пройдено";
  return "Отменено";
}
