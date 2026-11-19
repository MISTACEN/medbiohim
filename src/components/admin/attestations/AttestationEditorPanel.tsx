"use client";

/** Редактор аттестации: основные поля, этапы и их материалы. */
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { ATTESTATION_TYPE_LABELS, type AttestationType } from "@/types/attestations";
import { KINDS, TYPES, inputClass, labelClass } from "@/components/admin/attestations/model";
import { StageItemEditor } from "@/components/admin/attestations/StageItemEditor";
import type { AttestationEditorState } from "@/components/admin/attestations/useAttestationEditor";

export function AttestationEditorPanel({ editor }: { editor: AttestationEditorState }) {
  const {
    draft, setDraft, patch, saving, save, totalItems,
    addStage, updateStage, removeStage, moveStage, addItem,
  } = editor;
  if (!draft) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> К списку
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{totalItems} материалов</span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Сохранить
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-bold">Основное</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Название</span>
            <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} className={inputClass} placeholder="Коллоквиум по физиологии возбудимых систем" />
          </label>
          <label>
            <span className={labelClass}>Тип</span>
            <select value={draft.type} onChange={(e) => patch({ type: e.target.value as AttestationType })} className={inputClass}>
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {ATTESTATION_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Предмет (slug)</span>
            <input value={draft.subject_slug} onChange={(e) => patch({ subject_slug: e.target.value })} className={inputClass} placeholder="physiology" />
          </label>
          <label>
            <span className={labelClass}>Адрес аттестации (slug)</span>
            <input value={draft.slug} onChange={(e) => patch({ slug: e.target.value })} className={inputClass} placeholder="colloquium-1" />
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>Описание</span>
            <textarea value={draft.description || ""} onChange={(e) => patch({ description: e.target.value })} rows={2} className={inputClass} />
          </label>
          <label>
            <span className={labelClass}>Курс</span>
            <input
              type="number"
              min={1}
              max={6}
              value={draft.course_number ?? ""}
              onChange={(e) => patch({ course_number: e.target.value ? Number(e.target.value) : undefined })}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Семестр</span>
            <input
              type="number"
              min={1}
              max={12}
              value={draft.semester ?? ""}
              onChange={(e) => patch({ semester: e.target.value ? Number(e.target.value) : undefined })}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Проходной балл, %</span>
            <input
              type="number"
              min={0}
              max={100}
              value={draft.pass_score ?? 70}
              onChange={(e) => patch({ pass_score: Number(e.target.value) })}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Доступ с</span>
            <input
              type="datetime-local"
              value={draft.available_from ? draft.available_from.slice(0, 16) : ""}
              onChange={(e) => patch({ available_from: e.target.value || null })}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Доступ до</span>
            <input
              type="datetime-local"
              value={draft.available_to ? draft.available_to.slice(0, 16) : ""}
              onChange={(e) => patch({ available_to: e.target.value || null })}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 self-end rounded-xl border border-[var(--border)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={draft.is_published}
              onChange={(e) => patch({ is_published: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            <span className="text-sm font-semibold">Опубликовать для студентов</span>
          </label>
        </div>
      </section>

      {draft.stages.map((stage, stageIndex) => (
        <section key={stage.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-4">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 font-mono text-xs font-bold text-indigo-600">
              {String(stageIndex + 1).padStart(2, "0")}
            </span>
            <input
              value={stage.title}
              onChange={(e) => updateStage(stageIndex, { title: e.target.value })}
              className={`${inputClass} max-w-sm font-semibold`}
              placeholder="Название этапа"
            />
            <input
              value={stage.description || ""}
              onChange={(e) => updateStage(stageIndex, { description: e.target.value })}
              className={`${inputClass} max-w-md`}
              placeholder="Короткое описание (необязательно)"
            />
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => moveStage(stageIndex, -1)} disabled={stageIndex === 0} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-slate-500 disabled:opacity-30" aria-label="Выше">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => moveStage(stageIndex, 1)} disabled={stageIndex === draft.stages.length - 1} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-slate-500 disabled:opacity-30" aria-label="Ниже">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void removeStage(stageIndex)} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-slate-400 hover:border-[var(--status-critical-border)] hover:text-[var(--status-critical-fg)]" aria-label="Удалить этап">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3 p-4">
            {stage.items.map((item, itemIndex) => (
              <StageItemEditor
                key={item.id}
                editor={editor}
                stageIndex={stageIndex}
                itemIndex={itemIndex}
                item={item}
                itemCount={stage.items.length}
              />
            ))}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Добавить:</span>
              {KINDS.map((kind) => (
                <button
                  key={kind.value}
                  type="button"
                  onClick={() => addItem(stageIndex, kind.value)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600"
                >
                  <Plus className="h-3.5 w-3.5" /> {kind.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={addStage}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] py-4 text-sm font-semibold text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600"
      >
        <Plus className="h-4 w-4" /> Добавить этап
      </button>
    </div>
  );
}
