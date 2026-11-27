"use client";

/**
 * Верхняя панель диагностикума: режим, раздел, длина серии, таймер и запуск.
 *
 * Вынесено из `DiagnosticumRunner`, чтобы раннер укладывался в бюджет строк.
 * Разметка и классы перенесены как есть.
 */

import { Loader2, Play } from "lucide-react";
import type { DiagnosticumMode, DiagnosticumOverview } from "@/lib/diagnosticum-api";
import { DiagnosticumModeChips } from "@/components/trainers/DiagnosticumModeChips";

const EXAM_LENGTHS = [10, 20, 30] as const;

const selectClass =
  "min-h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold text-slate-700";

type DiagnosticumToolbarProps = {
  overview: DiagnosticumOverview | null;
  mode: DiagnosticumMode;
  showModeChips: boolean;
  onSelectMode: (mode: DiagnosticumMode) => void;
  section: string;
  onSectionChange: (value: string) => void;
  examLength: number;
  examTime: number;
  onExamLengthChange: (value: number) => void;
  onExamTimeChange: (value: number) => void;
  busy: boolean;
  attemptActive: boolean;
  /** Свободный ввод: студент отвечает словами, а не выбирает варианты. */
  textMode: boolean;
  onTextModeChange: (value: boolean) => void;
  /** Сколько препаратов выбрано в тренажёре: серия пойдёт ровно по ним. */
  selectedCount?: number;
  onStart: () => void;
};

export function DiagnosticumToolbar({
  overview,
  mode,
  showModeChips,
  onSelectMode,
  section,
  onSectionChange,
  examLength,
  examTime,
  onExamLengthChange,
  onExamTimeChange,
  busy,
  attemptActive,
  textMode,
  onTextModeChange,
  selectedCount = 0,
  onStart,
}: DiagnosticumToolbarProps) {
  return (
    <div className="card space-y-3 p-4">
      {showModeChips ? (
        <DiagnosticumModeChips modes={overview?.modes} mode={mode} onSelect={onSelectMode} />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={section}
          onChange={(event) => onSectionChange(event.target.value)}
          className={selectClass}
          aria-label="Раздел"
        >
          <option value="">Все разделы</option>
          {(overview?.sections ?? []).map((item) => (
            <option key={item.section} value={item.section}>
              {item.section} · {item.total}
              {item.missing ? ` из ${item.total + item.missing}` : ""}
            </option>
          ))}
        </select>
        {mode === "exam" ? (
          <>
            <select
              value={examLength}
              onChange={(event) => onExamLengthChange(Number(event.target.value))}
              className={selectClass}
              aria-label="Вопросов в экзамене"
            >
              {EXAM_LENGTHS.map((value) => (
                <option key={value} value={value}>
                  {value} вопросов
                </option>
              ))}
            </select>
            <select
              value={examTime}
              onChange={(event) => onExamTimeChange(Number(event.target.value))}
              className={selectClass}
              aria-label="Время на вопрос"
            >
              <option value={0}>Без таймера</option>
              <option value={60}>60 с на вопрос</option>
              <option value={90}>90 с на вопрос</option>
            </select>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => onTextModeChange(!textMode)}
          aria-pressed={textMode}
          disabled={busy}
          className={
            "min-h-10 rounded-xl border px-3 text-sm font-semibold transition disabled:opacity-60 " +
            (textMode
              ? "border-indigo-300 bg-indigo-50 text-indigo-800"
              : "border-[var(--border)] bg-white text-slate-600 hover:border-indigo-200")
          }
        >
          {textMode ? "Ответ: текстом" : "Ответ: варианты"}
        </button>
        <button
          type="button"
          onClick={onStart}
          disabled={busy || overview?.migrated === false}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy && !attemptActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {attemptActive
            ? "Новое задание"
            : mode === "exam" && selectedCount > 0
              ? `Экзамен по выбранным (${selectedCount})`
              : mode === "exam"
                ? "Начать экзамен"
                : mode === "electronogram"
                  ? "Начать электронограмму"
                  : "Начать разбор"}
        </button>
        {overview && !overview.migrated ? (
          <span className="text-xs text-slate-500">
            Диагностикум включится после применения миграции методических карточек.
          </span>
        ) : null}
      </div>
    </div>
  );
}
