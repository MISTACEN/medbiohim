"use client";

/**
 * Просмотр содержимого ZIP без распаковки.
 * Показываются имена, размеры и служебные предупреждения; вложенные файлы
 * не извлекаются, поэтому архив не может развернуться в памяти браузера.
 */
import { useEffect, useState } from "react";
import { Folder, FileArchive } from "lucide-react";
import { DEFAULT_LIMITS } from "../limits";
import { listZip, type ArchiveListing } from "../office/archive";
import { formatBytes } from "../formats";
import { ViewerError, ViewerLoading, ViewerNotice } from "./parts";
import { useFileBytes } from "./useFileBytes";

export function ArchiveViewer({ url }: { url: string }) {
  const { status, bytes, error, reload } = useFileBytes(url, DEFAULT_LIMITS.maxOfficeBytes);
  const [listing, setListing] = useState<ArchiveListing | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ready" || !bytes) return;
    let active = true;
    setParseError(null);
    listZip(bytes)
      .then((result) => {
        if (active) setListing(result);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setListing(null);
        setParseError(reason instanceof Error ? reason.message : "Не удалось прочитать архив.");
      });
    return () => {
      active = false;
    };
  }, [status, bytes]);

  if (status === "loading") return <ViewerLoading label="Читаем список файлов…" />;
  if (status === "error") return <ViewerError message={error ?? ""} onRetry={reload} />;
  if (parseError) return <ViewerError message={parseError} onRetry={reload} />;
  if (!listing) return <ViewerLoading label="Читаем список файлов…" />;

  return (
    <div className="space-y-2">
      {listing.warnings.map((warning) => (
        <ViewerNotice key={warning}>{warning}</ViewerNotice>
      ))}

      <div className="rounded-xl border border-[var(--border)] bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-xs text-slate-500">
          <FileArchive className="h-4 w-4" />
          {listing.entries.length} записей · сжато {formatBytes(listing.compressedSize)} · распаковано{" "}
          {formatBytes(listing.uncompressedSize)}
        </div>
        <ul className="max-h-[60vh] divide-y divide-[var(--border)] overflow-auto">
          {listing.entries.map((entry) => (
            <li
              key={entry.path}
              className="flex items-center gap-2 px-3 py-1.5 text-xs"
              style={{ paddingLeft: `${12 + Math.max(0, entry.depth - 1) * 14}px` }}
            >
              {entry.directory ? (
                <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--status-warn-fg)]" />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate" title={entry.path}>
                {entry.name}
              </span>
              <span className="shrink-0 tabular-nums text-slate-400">
                {entry.directory ? "" : formatBytes(entry.uncompressedSize)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {listing.truncated ? <ViewerNotice tone="info">Список показан не полностью.</ViewerNotice> : null}
    </div>
  );
}
