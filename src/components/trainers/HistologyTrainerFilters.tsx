"use client";

/**
 * Настройка своей серии: тип, режим ответа, количество, темы и выбор карточек.
 *
 * Вынесено из `HistologyTrainer`, чтобы экран укладывался в лимит строк.
 * Разметка, тексты и классы перенесены как есть; состояние остаётся в родителе,
 * поэтому сеттеры передаются напрямую.
 */

import type { Dispatch, SetStateAction } from "react";
import type { TrainingContentType, TrainingLabelMode } from "@/lib/content-api";
import { isElectronogramCard } from "@/lib/histologyOrder";
import { topicLabel } from "@/components/trainers/HistologyTrainerParts";

type HistologyTrainerFiltersProps = {
  contentType: TrainingContentType;
  setContentType: (value: TrainingContentType) => void;
  labelMode: TrainingLabelMode;
  setLabelMode: (value: TrainingLabelMode) => void;
  count: string;
  setCount: (value: string) => void;
  custom: string;
  setCustom: (value: string) => void;
  allQuestions: boolean;
  setAllQuestions: (value: boolean) => void;
  /** Темы занятий, доступные при текущем типе карточек. */
  topicsForSetup: string[];
  selectedTopics: string[];
  setSelectedTopics: Dispatch<SetStateAction<string[]>>;
  pickMode: boolean;
  setPickMode: (value: boolean) => void;
  /** Карточки по темам — тот же порядок, что и в атласе. */
  atlasByTopic: [string, any[]][];
  selectedCardIds: string[];
  setSelectedCardIds: Dispatch<SetStateAction<string[]>>;
  error: string | null;
  working: boolean;
  onStart: () => void;
  /** Перейти к экзамену по уже выбранным карточкам (без второй серии). */
  onExamSelected?: () => void;
};

export function HistologyTrainerFilters({
  contentType,
  setContentType,
  labelMode,
  setLabelMode,
  count,
  setCount,
  custom,
  setCustom,
  allQuestions,
  setAllQuestions,
  topicsForSetup,
  selectedTopics,
  setSelectedTopics,
  pickMode,
  setPickMode,
  atlasByTopic,
  selectedCardIds,
  setSelectedCardIds,
  error,
  working,
  onStart,
  onExamSelected,
}: HistologyTrainerFiltersProps) {
  return (
    <>
      <div>
        <h3 className="text-sm font-bold text-slate-900">Тип</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {([["all", "Всё"], ["preparation", "Микропрепараты"], ["electronogram", "Электронограммы"]] as [TrainingContentType, string][]).map((x) => (
            <label key={x[0]} className={"rounded-xl border px-4 py-2 text-sm " + (contentType === x[0] ? "border-indigo-400 bg-indigo-50" : "")}>
              <input type="radio" className="mr-2" checked={contentType === x[0]} onChange={() => setContentType(x[0])} />{x[1]}
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-900">Режим ответа</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {([["without", "Варианты"], ["manual", "Ввод вручную"]] as [TrainingLabelMode, string][]).map((x) => (
            <label key={x[0]} className={"rounded-xl border px-4 py-2 text-sm " + (labelMode === x[0] ? "border-indigo-400 bg-indigo-50" : "")}>
              <input type="radio" className="mr-2" checked={labelMode === x[0]} onChange={() => setLabelMode(x[0])} />{x[1]}
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-900">Количество</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {["10", "20", "30", "50"].map((n) => (
            <button key={n} type="button" onClick={() => { setCount(n); setAllQuestions(false); }} className={"rounded-xl border px-3 py-2 text-sm " + (!allQuestions && count === n ? "border-indigo-400 bg-indigo-50 font-semibold" : "")}>{n}</button>
          ))}
          <button type="button" onClick={() => setAllQuestions(true)} className={"rounded-xl border px-3 py-2 text-sm " + (allQuestions ? "border-indigo-400 bg-indigo-50 font-semibold" : "")}>Все</button>
          <input value={custom} onChange={(e) => { setCustom(e.target.value); setAllQuestions(false); }} placeholder="своё" className="w-20 rounded-xl border px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">Темы занятий / выбор карточек</h3>
          <button type="button" onClick={() => setPickMode(!pickMode)} className="text-sm text-indigo-600">
            {pickMode ? "Скрыть выбор" : "Выбрать конкретные"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {topicsForSetup.map((tg) => {
            const on = selectedTopics.includes(tg);
            return (
              <button key={tg} type="button" onClick={() => setSelectedTopics((v) => on ? v.filter((x) => x !== tg) : [...v, tg])}
                className={"rounded-xl border px-3 py-2 text-sm " + (on ? "border-indigo-400 bg-indigo-50 font-semibold" : "")}>
                {topicLabel(tg)}
              </button>
            );
          })}
        </div>
        {selectedTopics.length > 0 && (
          <button type="button" className="mt-2 text-xs text-slate-500" onClick={() => setSelectedTopics([])}>Сбросить темы</button>
        )}
        {pickMode && (
          <div className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-xl border p-3">
            {atlasByTopic.map(([topic, items]) => (
              <div key={topic}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <b className="text-sm">{topicLabel(topic)}</b>
                  <button type="button" className="text-xs text-indigo-600" onClick={() => {
                    const ids = items.map((c: any) => String(c.id));
                    setSelectedCardIds((prev) => {
                      const allOn = ids.every((id: string) => prev.includes(id));
                      return allOn ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]));
                    });
                  }}>все / снять</button>
                </div>
                <div className="space-y-1">
                  {items.map((card: any) => {
                    const id = String(card.id);
                    const on = selectedCardIds.includes(id);
                    const em = isElectronogramCard(card);
                    return (
                      <label key={id} className={"flex cursor-pointer items-start gap-2 rounded-lg border px-2 py-1.5 text-xs " + (on ? "border-indigo-300 bg-indigo-50" : "")}>
                        <input type="checkbox" className="mt-0.5" checked={on} onChange={() => setSelectedCardIds((v) => on ? v.filter((x) => x !== id) : [...v, id])} />
                        <span>
                          <span className="font-medium">{card.preparation?.name || "Препарат"}</span>
                          {em ? <span className="ml-1 text-indigo-500">ЭМ</span> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {selectedCardIds.length > 0 && (
              <p className="text-xs text-slate-600">Выбрано: {selectedCardIds.length}. Будут только эти карточки.</p>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-[var(--status-critical-fg)]">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={working} onClick={() => void onStart()} className="btn-primary">
          {selectedCardIds.length
            ? `Начать тренировку (${selectedCardIds.length})`
            : "Начать тренировку"}
        </button>
        {selectedCardIds.length > 0 && onExamSelected ? (
          <button
            type="button"
            disabled={working}
            onClick={onExamSelected}
            className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            Экзамен по выбранным ({selectedCardIds.length})
          </button>
        ) : null}
      </div>
    </>
  );
}