"use client";

/** Файл материала: фото и миниатюра с ленивой ссылкой на storage. */
import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { getWorkshopFileUrl } from "@/lib/api/workshop";

export function ItemFile({ itemId, file }: { itemId: string; file: { id: string; name: string; mime: string } }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void getWorkshopFileUrl(itemId, file.id).then((next) => { if (active) { setUrl(next); setFailed(!next); } });
    return () => { active = false; };
  }, [itemId, file.id]);
  const isImage = /^image\//.test(file.mime);
  if (isImage && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border border-[var(--border)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={file.name} className="h-36 w-full object-cover transition group-hover:scale-[1.02]" />
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[11px] text-white">{file.name}</span>
      </a>
    );
  }
  return (
    <a
      href={url || undefined}
      target="_blank"
      rel="noreferrer"
      aria-disabled={!url}
      className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm hover:bg-slate-50"
    >
      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1 truncate">{file.name}</span>
      {url ? <span className="text-xs text-indigo-600">открыть</span> : failed ? <span className="text-xs text-slate-400">недоступен</span> : <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />}
    </a>
  );
}

/** Миниатюра файла мастерской: фото из загрузки показываем рядом с вопросом. */
export function ItemThumb({ itemId, file }: { itemId: string; file: { id: string; name: string } }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void getWorkshopFileUrl(itemId, file.id).then((next) => {
      if (!active) return;
      setUrl(next);
      setFailed(!next);
    });
    return () => {
      active = false;
    };
  }, [itemId, file.id]);
  if (failed) {
    return (
      <span className="flex h-20 w-full items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-[11px] text-slate-400 sm:w-28">
        фото недоступно
      </span>
    );
  }
  if (!url) {
    return (
      <span className="flex h-20 w-full items-center justify-center rounded-xl bg-slate-100 sm:w-28">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block shrink-0 overflow-hidden rounded-xl border border-[var(--border)] sm:w-28"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={file.name} className="h-20 w-full object-cover transition hover:scale-[1.03] sm:h-24" />
    </a>
  );
}
