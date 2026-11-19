"use client";

import { Check, Plus, Save, Trash2 } from "lucide-react";

import type { EditDraft, EditOption } from "./model";

type Props = {
  number: number;
  draft: EditDraft;
  setDraft: (draft: EditDraft) => void;
  updateOption: (index: number, patch: Partial<EditOption>) => void;
  addOption: () => void;
  removeOption: (index: number) => void;
  saveMessage: string;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
};

/** Быстрое admin-исправление вопроса внутри карточки банка. */
export function QuestionEditor({ number, draft, setDraft, updateOption, addOption, removeOption, saveMessage, saving, onSave, onClose }: Props) {
  return (
    <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-indigo-900">Быстрое исправление №{number}</div>
          <div className="mt-1 text-xs text-indigo-700">Изменения сразу попадут в Supabase и будут использоваться при следующем прохождении.</div>
        </div>
        <div className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-indigo-700">только admin</div>
      </div>

      <label className="mt-4 block">
        <div className="mb-1 text-xs font-semibold text-slate-600">Формулировка</div>
        <textarea
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          className="min-h-28 w-full rounded-xl border bg-white px-3 py-2 text-sm"
        />
      </label>

      <label className="mt-3 block">
        <div className="mb-1 text-xs font-semibold text-slate-600">Эталонный ответ</div>
        <input
          value={draft.answer}
          onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
          className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
        />
      </label>

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-slate-600">Варианты ответа</div>
            <div className="text-[11px] text-slate-500">Отметьте один или несколько правильных.</div>
          </div>
          <button
            type="button"
            onClick={addOption}
            className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" /> Добавить вариант
          </button>
        </div>

        <div className="space-y-2">
          {draft.options.map((option, oi) => (
            <div key={oi} className="flex items-center gap-2 rounded-xl border bg-white p-2">
              <button
                type="button"
                onClick={() => updateOption(oi, { correct: !option.correct })}
                className={"inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border " + (option.correct ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "border-slate-200 bg-slate-50 text-slate-400")}
                title={option.correct ? "Сделать неправильным" : "Отметить правильным"}
              >
                <Check className="h-4 w-4" />
              </button>
              <span className="w-6 text-xs font-bold text-slate-400">{String.fromCharCode(65 + oi)}.</span>
              <input
                value={option.label}
                onChange={(e) => updateOption(oi, { label: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border px-2.5 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => removeOption(oi)}
                disabled={draft.options.length <= 2}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)] disabled:opacity-30"
                title="Удалить вариант"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {saveMessage && <div className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-indigo-800">{saveMessage}</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          {saving ? "Сохранение…" : "Сохранить исправление"}
        </button>
        <button type="button" onClick={onClose} className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">
          Отмена
        </button>
      </div>
    </div>
  );
}
