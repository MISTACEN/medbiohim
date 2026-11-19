"use client";

/** Карточка материала: описание, файлы, вопросы с фото, версии и жалоба. */
import { Check, Clock, Eye, EyeOff, Loader2, Trash2, X } from "lucide-react";
import { KIND_LABEL, STATUS_LABEL, formatDate } from "@/components/workshop/model";
import { ItemFile, ItemThumb } from "@/components/workshop/WorkshopFile";
import type { WorkshopState } from "@/components/workshop/useWorkshopPage";

export function WorkshopDetail({ page }: { page: WorkshopState }) {
  const {
    detail, setDetail, edit, setEdit, busy, versions, reportReason, setReportReason,
    questionPhotos, pairedPhotoIds, saveEdit, toggleHidden, removeItem, restore, report,
  } = page;
  if (!detail?.item) return null;

  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">{KIND_LABEL[detail.item.kind] || detail.item.kind}</span>
            <span className="text-xs text-slate-500">{STATUS_LABEL[detail.item.status] || detail.item.status} · v{detail.item.version_no}</span>
          </div>
          <h2 className="mt-1 text-xl font-bold">{detail.item.title}</h2>
          <p className="text-sm text-slate-500">{detail.item.subject_name || "Без предмета"}{detail.item.topic ? ` · ${detail.item.topic}` : ""} · {detail.item.author_name || "Студент"}</p>
        </div>
        <button type="button" onClick={() => setDetail(null)} className="rounded-xl border border-[var(--border)] p-2" aria-label="Закрыть"><X className="h-4 w-4" /></button>
      </div>

      {detail.item.summary && <p className="whitespace-pre-wrap text-sm text-slate-700">{detail.item.summary}</p>}
      {!!detail.item.personal_data_flags?.length && (
        <div className="rounded-xl bg-[var(--status-warn-bg)] p-2 text-xs text-[var(--status-warn-fg)]">Автор подтвердил отсутствие чужих персональных данных. Метки: {detail.item.personal_data_flags.join(", ")}.</div>
      )}

      {!!detail.item.files?.length && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {detail.item.files
            .filter((file: any) => !pairedPhotoIds.has(String(file.id)))
            .map((file: any) => <ItemFile key={file.id} itemId={detail.item.id} file={file} />)}
        </div>
      )}

      {!!detail.item.questions?.length && (
        <details className="rounded-xl border border-[var(--border)] p-3" open>
          <summary className="cursor-pointer text-sm font-semibold">Вопросы ({detail.item.questions.length})</summary>
          <ol className="mt-2 space-y-2 text-sm text-slate-700">
            {detail.item.questions.map((question: any, index: number) => {
              // Фото идут в порядке загрузки: i-й вопрос получает i-е фото,
              // а не висит отдельной галереей внизу материала.
              const photo = questionPhotos[index];
              return (
                <li
                  key={question.id}
                  className="flex flex-col gap-2 rounded-xl border border-[var(--border)] p-3 sm:flex-row sm:items-start"
                >
                  {photo ? <ItemThumb itemId={detail.item.id} file={photo} /> : null}
                  <span className="min-w-0 flex-1 leading-relaxed">
                    <span className="mr-1 font-semibold text-slate-400">{index + 1}.</span>
                    {question.text}
                  </span>
                </li>
              );
            })}
          </ol>
          {questionPhotos.length > (detail.item.questions?.length || 0) && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {questionPhotos.slice(detail.item.questions.length).map((file: any) => (
                <ItemFile key={file.id} itemId={detail.item.id} file={file} />
              ))}
            </div>
          )}
        </details>
      )}

      {detail.is_author && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <h3 className="text-sm font-bold">Управление автора</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Название" />
            <input value={edit.topic} onChange={(event) => setEdit({ ...edit, topic: event.target.value })} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Тема" />
            <input value={edit.tags} onChange={(event) => setEdit({ ...edit, tags: event.target.value })} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Теги через запятую" />
            <input value={edit.summary} onChange={(event) => setEdit({ ...edit, summary: event.target.value })} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Описание" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveEdit()} disabled={busy} className="btn-primary inline-flex items-center gap-2 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Сохранить версию</button>
            <button type="button" onClick={() => void toggleHidden(detail.item)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
              {detail.item.status === "hidden" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {detail.item.status === "hidden" ? "Показать снова" : "Скрыть материал"}
            </button>
            <button type="button" onClick={() => void removeItem(detail.item)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--status-critical-fg)]"><Trash2 className="h-4 w-4" />Удалить</button>
          </div>
        </div>
      )}

      {versions.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] p-3">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Clock className="h-4 w-4" />История версий</h3>
          <div className="mt-2 space-y-1">
            {versions.map((version) => (
              <div key={version.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-slate-50">
                <span className="font-semibold">v{version.version_no}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600">{version.note || version.title || "Версия"}</span>
                <span className="text-xs text-slate-400">{formatDate(version.created_at)}</span>
                {detail.is_author && version.version_no !== detail.item.version_no && (
                  <button type="button" onClick={() => void restore(version.version_no)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold">Восстановить</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!detail.is_author && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-3">
          <input value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder="Причина жалобы (чужие данные, ошибка…)" className="min-w-[200px] flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
          <button type="button" onClick={() => void report(detail.item)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">Пожаловаться</button>
        </div>
      )}
    </section>
  );
}
