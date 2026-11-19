"use client";

/** Материал этапа: тип, текст, варианты теста или эталон задачи. */
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import type { AttestationItem, AttestationItemKind } from "@/types/attestations";
import { KINDS, inputClass, labelClass, newItem } from "@/components/admin/attestations/model";
import type { AttestationEditorState } from "@/components/admin/attestations/useAttestationEditor";

export function StageItemEditor({
  editor,
  stageIndex,
  itemIndex,
  item,
  itemCount,
}: {
  editor: AttestationEditorState;
  stageIndex: number;
  itemIndex: number;
  item: AttestationItem;
  itemCount: number;
}) {
  const { updateItem, moveItem, removeItem } = editor;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={item.kind}
          onChange={(e) => {
            const kind = e.target.value as AttestationItemKind;
            const fresh = newItem(kind);
            updateItem(stageIndex, itemIndex, {
              ...fresh,
              id: item.id,
              title: item.title,
              kind,
              options: kind === "test" ? item.options || ["", ""] : undefined,
              correct: kind === "test" ? item.correct || [0] : undefined,
              body: kind === "theory" ? item.body : undefined,
              answer: item.answer,
            });
          }}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs font-semibold"
        >
          {KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>
        <span className="font-mono text-[11px] text-slate-400">
          {String(stageIndex + 1)}.{String(itemIndex + 1).padStart(2, "0")}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => moveItem(stageIndex, itemIndex, -1)} disabled={itemIndex === 0} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] text-slate-500 disabled:opacity-30" aria-label="Выше">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => moveItem(stageIndex, itemIndex, 1)} disabled={itemIndex === itemCount - 1} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] text-slate-500 disabled:opacity-30" aria-label="Ниже">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => removeItem(stageIndex, itemIndex)} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] text-slate-400 hover:border-[var(--status-critical-border)] hover:text-[var(--status-critical-fg)]" aria-label="Удалить материал">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <label className="mt-3 block">
        <span className={labelClass}>{item.kind === "test" ? "Вопрос" : item.kind === "task" ? "Условие задачи" : "Тема / вопрос"}</span>
        <textarea value={item.title} onChange={(e) => updateItem(stageIndex, itemIndex, { title: e.target.value })} rows={2} className={inputClass} />
      </label>

      {item.kind !== "task" && (
        <label className="mt-2 block">
          <span className={labelClass}>{item.kind === "theory" ? "Текст теории" : "Пояснение к ответу (необязательно)"}</span>
          <textarea
            value={item.kind === "theory" ? item.body || "" : item.explanation || ""}
            onChange={(e) =>
              updateItem(stageIndex, itemIndex, item.kind === "theory" ? { body: e.target.value } : { explanation: e.target.value })
            }
            rows={item.kind === "theory" ? 4 : 2}
            className={inputClass}
          />
        </label>
      )}

      {item.kind === "test" && (
        <div className="mt-2">
          <span className={labelClass}>Варианты ответа (отметьте правильные)</span>
          <div className="space-y-2">
            {(item.options || []).map((option, optionIndex) => (
              <div key={optionIndex} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={(item.correct || []).includes(optionIndex)}
                  onChange={(e) => {
                    const set = new Set(item.correct || []);
                    if (e.target.checked) set.add(optionIndex);
                    else set.delete(optionIndex);
                    updateItem(stageIndex, itemIndex, { correct: [...set].sort((a, b) => a - b) });
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--status-ok-fg)]"
                  aria-label={`Правильный вариант ${optionIndex + 1}`}
                />
                <span className="font-mono text-[11px] text-slate-400">{String.fromCharCode(1040 + optionIndex)}</span>
                <input
                  value={option}
                  onChange={(e) => {
                    const options = [...(item.options || [])];
                    options[optionIndex] = e.target.value;
                    updateItem(stageIndex, itemIndex, { options });
                  }}
                  className={inputClass}
                  placeholder={`Вариант ${optionIndex + 1}`}
                />
                <button
                  type="button"
                  onClick={() => {
                    const options = (item.options || []).filter((_, i) => i !== optionIndex);
                    const correct = (item.correct || [])
                      .filter((i) => i !== optionIndex)
                      .map((i) => (i > optionIndex ? i - 1 : i));
                    updateItem(stageIndex, itemIndex, { options, correct });
                  }}
                  disabled={(item.options || []).length <= 2}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] text-slate-400 hover:border-[var(--status-critical-border)] hover:text-[var(--status-critical-fg)] disabled:opacity-30"
                  aria-label="Удалить вариант"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => updateItem(stageIndex, itemIndex, { options: [...(item.options || []), ""] })}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
          >
            <Plus className="h-3.5 w-3.5" /> Вариант
          </button>
        </div>
      )}

      {item.kind !== "test" && (
        <label className="mt-2 block">
          <span className={labelClass}>{item.kind === "theory" ? "Конспект ответа (необязательно)" : "Эталонное решение"}</span>
          <textarea value={item.answer || ""} onChange={(e) => updateItem(stageIndex, itemIndex, { answer: e.target.value })} rows={3} className={inputClass} />
        </label>
      )}
    </div>
  );
}
