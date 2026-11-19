"use client";

/** Инструменты · вкладка «Файлы / Storage»: аудит метаданных, B2 и media capabilities. */

function Mini({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-xl border bg-slate-50 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 font-bold">{String(value ?? 0)}</div></div>;
}

export function ToolsStorageTab({
  fileAudit,
  fileAuditing,
  mediaCapabilities,
  onValidateFiles,
}: {
  fileAudit: any;
  fileAuditing: boolean;
  mediaCapabilities: any;
  onValidateFiles: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">File & Storage Center</h2>
          <p className="mt-1 text-sm text-slate-500">Неразрушающий аудит metadata → материалы → тренажёр → ДЗ → сдачи. Физические объекты не удаляются и не перемещаются.</p>
        </div>
        <button type="button" className="btn-primary" disabled={fileAuditing} onClick={onValidateFiles}>
          {fileAuditing ? "Проверяю…" : "Запустить аудит"}
        </button>
      </div>

      {fileAudit?.summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Активных файлов", fileAudit.summary.active_files],
            ["B2", fileAudit.summary.b2_files],
            ["SpaceWeb", fileAudit.summary.spaceweb_files],
            ["Без checksum", fileAudit.summary.missing_sha256],
            ["Без object_key", fileAudit.summary.missing_object_key],
            ["Неопределённое хранилище", fileAudit.summary.unknown_files],
            ["В обработке", fileAudit.summary.processing_files],
            ["Ошибка обработки", fileAudit.summary.failed_processing],
          ].map(([label, value]) => (
            <div key={String(label)} className="card">
              <div className="text-xs uppercase tracking-wide text-slate-400">{String(label)}</div>
              <div className="mt-1 text-2xl font-bold text-indigo-600">{String(value ?? 0)}</div>
            </div>
          ))}
        </div>
      )}

      {mediaCapabilities && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">Media runtime capabilities</h3>
              <p className="mt-1 text-xs text-slate-500">Фактические возможности PHP/SpaceWeb для следующего этапа оптимизации.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{String(mediaCapabilities.runtime || "PHP")}</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["GD", mediaCapabilities.extensions?.gd],
              ["Imagick", mediaCapabilities.extensions?.imagick],
              ["WebP GD", mediaCapabilities.image?.webp_gd],
              ["AVIF GD", mediaCapabilities.image?.avif_gd],
              ["WebP Imagick", mediaCapabilities.image?.webp_imagick],
              ["AVIF Imagick", mediaCapabilities.image?.avif_imagick],
              ["ffmpeg", mediaCapabilities.commands?.ffmpeg],
              ["ffprobe", mediaCapabilities.commands?.ffprobe],
              ["cwebp", mediaCapabilities.commands?.cwebp],
              ["avifenc", mediaCapabilities.commands?.avifenc],
            ].map(([label, ok]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                <span>{String(label)}</span>
                <b className={ok ? "text-[var(--status-ok-fg)]" : "text-slate-400"}>{ok ? "есть" : "нет"}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {fileAudit?.b2 && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">B2 physical scan</h3>
              <p className="mt-1 text-xs text-slate-500">Только чтение: сравниваются object_key из metadata и имена объектов в B2.</p>
            </div>
            <span className={fileAudit.b2.configured ? "badge-primary" : "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500"}>
              {fileAudit.b2.configured ? "B2 подключён" : "B2 не настроен"}
            </span>
          </div>
          {fileAudit.b2.configured ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Mini label="Просканировано" value={fileAudit.b2.scanned} />
              <Mini label="Совпало" value={fileAudit.b2.matched_metadata} />
              <Mini label="Нет в БД" value={fileAudit.b2.orphan_objects} />
              <Mini label="Нет в B2" value={fileAudit.b2.missing_db_objects} />
              <Mini label="Ограничен список" value={fileAudit.b2.scan_truncated ? "да" : "нет"} />
            </div>
          ) : null}
          {fileAudit.b2.error ? <div className="mt-3 rounded-lg bg-[var(--status-warn-bg)] px-3 py-2 text-xs text-[var(--status-warn-fg)]">{fileAudit.b2.error}</div> : null}
        </div>
      )}

      {fileAudit?.items && (
        <div className="card overflow-hidden">
          <div className="border-b bg-slate-50 px-4 py-3 text-xs text-slate-500">Показаны файлы с наименьшим количеством ссылок. Это кандидаты для ручной reconciliation, а не команда на удаление.</div>
          <div className="overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100">
                <tr>
                  {["Файл","MIME","Storage","Status","Refs","SHA-256","Object key"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-left">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {fileAudit.items.map((row:any) => (
                  <tr key={String(row.id)} className="border-t">
                    <td className="max-w-[260px] px-3 py-2"><div className="truncate font-semibold">{String(row.original_name || row.id)}</div><div className="text-[10px] text-slate-400">{String(row.id)}</div></td>
                    <td className="px-3 py-2">{String(row.mime_type || "—")}</td>
                    <td className="px-3 py-2">{String(row.storage_provider || "unknown")}</td>
                    <td className="px-3 py-2">{String(row.processing_status || "—")}</td>
                    <td className="px-3 py-2 font-semibold">{String(row.total_refs ?? 0)}</td>
                    <td className="max-w-[180px] px-3 py-2"><span className="truncate">{row.sha256 ? String(row.sha256) : "нет"}</span></td>
                    <td className="max-w-[240px] px-3 py-2"><span className="truncate">{String(row.object_key || "нет")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
