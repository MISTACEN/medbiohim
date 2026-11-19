"use client";

/** Загрузка материала: файлы по одному, подсказки, персональные данные. */
import { AlertTriangle, Check, FileText, Image as ImageIcon, Loader2, Plus, Upload, X } from "lucide-react";
import { KIND_LABEL } from "@/components/workshop/model";
import type { WorkshopState } from "@/components/workshop/useWorkshopPage";

export function WorkshopComposer({ page }: { page: WorkshopState }) {
  const {
    composer, settings, subjects, form, setForm, drafts, setDrafts,
    uploading, suggestion, warning, busy, addFiles, submit, inputRef,
  } = page;
  if (!composer) return null;

  return (
    <section className="card space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Новый материал</h2>
        <span className="text-xs text-slate-500">Можно выбрать 10 фото сразу — они станут одной фотолекцией</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,text/plain,.doc,.docx"
        className="hidden"
        onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ""; }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] px-4 py-8 text-sm text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40"
      >
        {uploading ? <Loader2 className="h-6 w-6 animate-spin text-indigo-500" /> : <Upload className="h-6 w-6 text-indigo-500" />}
        <span className="font-semibold text-slate-700">{uploading ? "Загружаем по одному файлу…" : "Фото лекции, скриншоты или PDF"}</span>
        <span>Тип, предмет и теги система предложит сама</span>
      </button>

      {drafts.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {drafts.map((draft) => (
            <div key={draft.key} className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
              {draft.file.type.startsWith("image/") ? <ImageIcon className="h-4 w-4 text-slate-400" /> : <FileText className="h-4 w-4 text-slate-400" />}
              <span className="min-w-0 flex-1 truncate" title={draft.file.name}>{draft.file.name}</span>
              {draft.error ? <span className="text-xs text-[var(--status-critical-fg)]" title={draft.error}>ошибка</span>
                : draft.fileId ? <Check className="h-4 w-4 text-[var(--status-ok-fg)]" />
                  : <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />}
              <button type="button" aria-label="Убрать файл" onClick={() => setDrafts((current) => current.filter((row) => row.key !== draft.key))} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      {suggestion?.kind && (
        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          Система распознала: <b>{KIND_LABEL[suggestion.kind] || suggestion.kind}</b>
          {suggestion.batch_hint ? ` · ${suggestion.batch_hint}` : ""}
          {suggestion.questions_detected ? ` · вопросов в тексте: ${suggestion.questions_detected}` : ""}
          {suggestion.subjects?.[0] ? ` · вероятный предмет: ${suggestion.subjects[0].name}` : ""}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-slate-600">Название</span>
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={160} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" placeholder="Например: Фотолекция · Гистология" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-slate-600">Предмет</span>
          <select value={form.subject_id} onChange={(event) => setForm({ ...form, subject_id: event.target.value })} className="w-full rounded-xl border border-[var(--border)] px-3 py-2">
            <option value="">Подобрать автоматически</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-slate-600">Тема</span>
          <input value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })} maxLength={200} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" placeholder="Эмбриология, кровь…" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-slate-600">Теги</span>
          <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" placeholder="#гистология, #конспект" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-semibold text-slate-600">Тип материала</span>
          <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className="w-full rounded-xl border border-[var(--border)] px-3 py-2">
            <option value="">Определить автоматически</option>
            {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-semibold text-slate-600">Описание (необязательно)</span>
          <textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} rows={2} maxLength={4000} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-semibold text-slate-600">Вопросы теста текстом (PDF распознаётся автоматически)</span>
          <textarea value={form.questionText} onChange={(event) => setForm({ ...form, questionText: event.target.value })} rows={4} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" placeholder={"1. Вопрос…\n2. Вопрос…"} />
        </label>
      </div>

      {warning.length > 0 && settings.personal_data_warning && (
        <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <b>Возможны чужие персональные данные</b>
              <ul className="mt-1 list-inside list-disc text-xs">{warning.map((flag) => <li key={flag}>{flag}</li>)}</ul>
              <label className="mt-2 flex items-start gap-2 text-xs font-semibold">
                <input type="checkbox" checked={form.confirmed} onChange={(event) => setForm({ ...form, confirmed: event.target.checked })} className="mt-0.5 h-4 w-4" />
                Подтверждаю: чужих персональных данных нет или я их вырезал
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <p className="text-xs text-slate-500">
          {settings.moderation_mode === "manual" ? "Материал проверит модератор перед публикацией." : "Материал появится сразу; автор может скрыть или удалить его в любой момент."}
        </p>
        <button type="button" onClick={() => void submit()} disabled={busy || uploading} className="btn-primary inline-flex items-center gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Отправить в мастерскую
        </button>
      </div>
    </section>
  );
}
