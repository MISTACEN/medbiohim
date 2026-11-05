"use client";

/**
 * Единая точка входа просмотра файла внутри MEDBIOHIM.
 *
 * Экран передаёт ссылку, имя и (если известно) MIME/размер — движок сам
 * выбирает просмотрщик по allowlist-реестру форматов, проверяет пределы и
 * показывает оригинал отдельным действием. Внешний сайт и автоматическое
 * скачивание не используются.
 */
import { useMemo } from "react";
import { Download, AlertTriangle } from "lucide-react";
import { detectFile } from "../detection";
import { formatBytes, getFormatById } from "../formats";
import { DEFAULT_LIMITS } from "../limits";
import { checkPreviewSafety } from "../security";
import { ArchiveViewer } from "./ArchiveViewer";
import { DocxViewer } from "./DocxViewer";
import { PptxViewer } from "./PptxViewer";
import { SheetViewer } from "./SheetViewer";
import { TextViewer } from "./TextViewer";
import { FallbackViewer, ImageViewer, MediaPlayer, PdfViewer } from "./SimpleViewers";

export type FilePreviewSource = {
  /** Same-origin или подписанная ссылка на файл. */
  url: string;
  name: string;
  mime?: string | null;
  size?: number | null;
  /** Отдельная ссылка на оригинал (если сервер отдаёт её иначе). */
  downloadUrl?: string | null;
  /** false — просмотр без скачивания (например, предпросмотр до публикации). */
  canDownload?: boolean;
};

export type FilePreviewProps = {
  source: FilePreviewSource;
  className?: string;
  /** Скрыть шапку, если экран уже нарисовал свою. */
  hideHeader?: boolean;
};

function ViewerBody({ url, name, viewer }: { url: string; name: string; viewer: string }) {
  switch (viewer) {
    case "pdf":
      return <PdfViewer url={url} name={name} />;
    case "image":
      return <ImageViewer url={url} name={name} />;
    case "media":
      return <MediaPlayer url={url} name={name} kind={isVideo(name) ? "video" : "audio"} />;
    case "docx":
      return <DocxViewer url={url} />;
    case "pptx":
      return <PptxViewer url={url} />;
    case "xlsx":
      return <SheetViewer url={url} />;
    case "csv":
      return <TextViewer url={url} mode="csv" />;
    case "markdown":
      return <TextViewer url={url} mode="markdown" />;
    case "text":
      return <TextViewer url={url} mode="text" />;
    case "archive":
      return <ArchiveViewer url={url} />;
    default:
      return null;
  }
}

function isVideo(name: string): boolean {
  return /\.(mp4|m4v|webm|ogv|mov)$/i.test(name);
}

export function FilePreview({ source, className = "", hideHeader = false }: FilePreviewProps) {
  const detection = useMemo(
    () => detectFile({ name: source.name, mime: source.mime }),
    [source.name, source.mime],
  );

  const verdict = useMemo(
    () =>
      checkPreviewSafety(
        {
          format: detection.format,
          size: source.size,
          signatureMatches: detection.signatureMatches,
          signature: detection.signature,
        },
        DEFAULT_LIMITS,
      ),
    [detection, source.size],
  );

  const downloadUrl = source.downloadUrl || source.url;
  const canDownload = source.canDownload !== false;
  const format = detection.format;

  const body = verdict.ok ? (
    <ViewerBody url={source.url} name={source.name} viewer={format.viewer} />
  ) : null;

  const needsFallback = !verdict.ok || format.viewer === "fallback";

  return (
    <section
      className={
        "overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] " + className
      }
      aria-label={`Просмотр файла ${source.name}`}
    >
      {hideHeader ? null : (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" title={source.name}>
              {source.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="badge-neutral">{format.label}</span>
              <span>{formatBytes(source.size)}</span>
              {detection.mimeMismatch ? (
                <span className="inline-flex items-center gap-1 text-[var(--status-warn-fg)]">
                  <AlertTriangle className="h-3.5 w-3.5" /> тип не совпадает с расширением
                </span>
              ) : null}
            </div>
          </div>
          {canDownload && downloadUrl ? (
            <a
              href={downloadUrl}
              download={source.name}
              rel="noopener noreferrer"
              className="btn-pill inline-flex shrink-0 items-center gap-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" /> Оригинал
            </a>
          ) : null}
        </header>
      )}

      {!verdict.ok ? (
        <div className="flex items-start gap-2 border-b border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-4 py-2 text-xs leading-relaxed text-[var(--status-warn-fg)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{verdict.message}</span>
        </div>
      ) : null}

      <div className="max-h-[78vh] overflow-auto p-3 sm:p-4">
        {needsFallback ? (
          <FallbackViewer
            format={format}
            name={source.name}
            downloadUrl={canDownload ? downloadUrl : null}
            note={verdict.ok ? getFormatById(format.id)?.note : verdict.message}
          />
        ) : (
          body
        )}
      </div>
    </section>
  );
}
