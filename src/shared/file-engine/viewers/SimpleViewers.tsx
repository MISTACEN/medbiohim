"use client";

/**
 * Простые просмотрщики: PDF, изображения, аудио/видео и безопасный fallback.
 *
 * PDF и медиа отдаются браузеру как есть (src/iframe): это не разбор файла,
 * а нативный просмотр. Изображения всегда рисуются через <img>, поэтому SVG
 * не может выполнить скрипт.
 */
import { Download, FileQuestion, ExternalLink } from "lucide-react";
import type { FileFormat } from "../types";

export function PdfViewer({ url, name }: { url: string; name: string }) {
  return (
    <div className="space-y-2">
      <iframe
        src={url}
        title={name}
        className="h-[70vh] w-full rounded-xl border border-[var(--border)] bg-white"
      />
      <p className="text-xs text-slate-500">
        Если браузер не показал PDF, скачайте оригинал — файл не изменяется при просмотре.
      </p>
    </div>
  );
}

export function ImageViewer({ url, name }: { url: string; name: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      <img
        src={url}
        alt={name}
        className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
        loading="lazy"
      />
    </div>
  );
}

export function MediaPlayer({
  url,
  name,
  kind,
}: {
  url: string;
  name: string;
  kind: "audio" | "video";
}) {
  if (kind === "audio") {
    return (
      <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
        <audio controls src={url} className="w-full" aria-label={name} />
      </div>
    );
  }
  return (
    <video
      controls
      src={url}
      className="max-h-[70vh] w-full rounded-xl bg-black"
      aria-label={name}
      preload="metadata"
    />
  );
}

export function FallbackViewer({
  format,
  name,
  downloadUrl,
  note,
}: {
  format: FileFormat;
  name: string;
  downloadUrl?: string | null;
  note?: string | null;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-5 text-sm dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <FileQuestion className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <div className="font-semibold">{format.label}</div>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            {note || format.note || "Этот формат открывается только как оригинал: встроенный просмотр для него не включён."}
          </p>
          <p className="mt-1 truncate text-xs text-slate-400" title={name}>
            {name}
          </p>
        </div>
      </div>
      {downloadUrl ? (
        <a
          href={downloadUrl}
          download={name}
          rel="noopener noreferrer"
          className="btn-primary inline-flex items-center gap-2 text-xs"
        >
          <Download className="h-3.5 w-3.5" /> Скачать оригинал
        </a>
      ) : null}
    </div>
  );
}

export function ExternalViewerLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-pill inline-flex items-center gap-1.5 text-xs"
    >
      Открыть оригинал <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
