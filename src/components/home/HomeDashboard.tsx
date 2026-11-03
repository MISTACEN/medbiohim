"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  HOME_SPAN_CLASS,
  HOME_SPAN_LABELS,
  HOME_WIDGET_HINTS,
  HOME_WIDGET_LABELS,
  hiddenWidgetIds,
  isDefaultLayout,
  moveWidget,
  type HomeLayout,
  type HomeSpan,
  type HomeSyncState,
  type HomeWidget,
  type HomeWidgetId,
} from "@/lib/home-layout";

type Props = {
  layout: HomeLayout;
  note: string;
  sync: HomeSyncState;
  widgets: Partial<Record<HomeWidgetId, ReactNode>>;
  onChange: (layout: HomeLayout) => void;
  onReset: () => void;
};

const SYNC_TEXT: Record<HomeSyncState, string> = {
  idle: "",
  saving: "Сохраняю…",
  saved: "Сохранено в аккаунте",
  local: "Сохранено на устройстве",
  error: "Не удалось сохранить в аккаунт — осталось на устройстве",
};

const SPAN_OPTIONS: HomeSpan[] = ["third", "half", "full"];

function moveById(layout: HomeLayout, fromId: HomeWidgetId, toId: HomeWidgetId): HomeLayout {
  const from = layout.findIndex((widget) => widget.id === fromId);
  const to = layout.findIndex((widget) => widget.id === toId);
  return moveWidget(layout, from, to);
}

export function HomeDashboard({ layout, note, sync, widgets, onChange, onReset }: Props) {
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<HomeWidgetId | null>(null);
  const [overId, setOverId] = useState<HomeWidgetId | null>(null);

  const missing = hiddenWidgetIds(layout);
  const atDefault = isDefaultLayout(layout, note);

  const patch = (id: HomeWidgetId, changes: Partial<HomeWidget>) => {
    onChange(layout.map((widget) => (widget.id === id ? { ...widget, ...changes } : widget)));
  };

  const remove = (id: HomeWidgetId) => {
    onChange(layout.filter((widget) => widget.id !== id));
  };

  const add = (id: HomeWidgetId) => {
    const base = layout.find((widget) => widget.id === id);
    if (base) return;
    const restored = { id, span: "half" as HomeSpan };
    onChange([...layout, restored]);
  };

  const move = (id: HomeWidgetId, delta: number) => {
    const index = layout.findIndex((widget) => widget.id === id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= layout.length) return;
    onChange(moveWidget(layout, index, next));
  };

  return (
    <section aria-label="Мои блоки главной" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Моя главная</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {editing
              ? "Перетащите блок за ручку, выберите ширину или уберите лишнее. Изменения сохраняются автоматически."
              : "Блоки можно менять местами, скрывать и добавлять — или вернуть исходный вид."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SYNC_TEXT[sync] ? (
            <span role="status" aria-live="polite" className="text-xs text-slate-500 dark:text-slate-400">
              {SYNC_TEXT[sync]}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            aria-pressed={editing}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${
              editing
                ? "bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {editing ? <Check className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
            {editing ? "Готово" : "Настроить"}
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={atDefault}
            title={atDefault ? "Это уже исходный вид" : "Вернуть стандартный набор и порядок блоков"}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RotateCcw className="h-4 w-4" />
            Вернуть как было
          </button>
        </div>
      </div>

      {editing && missing.length ? (
        <div className="rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/40 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/10">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
            <Plus className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /> Добавить блок
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {missing.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => add(id)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-slate-800 dark:text-indigo-400 dark:hover:bg-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
                {HOME_WIDGET_LABELS[id]}
                <span className="hidden text-xs font-normal text-slate-400 dark:text-slate-500 sm:inline">
                  — {HOME_WIDGET_HINTS[id]}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {layout.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-300">Все блоки скрыты.</p>
          <button
            type="button"
            onClick={onReset}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <RotateCcw className="h-4 w-4" /> Вернуть исходный вид
          </button>
        </div>
      ) : (
        // Сетка главной: 1 колонка на телефоне, 2 на планшете, 6 на десктопе.
        // Ширины блоков задаёт HOME_SPAN_CLASS (sm:*/lg:*) — пустых дыр нет,
        // потому что полные блоки занимают обе планшетные колонки.
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {layout.map((widget) => {
            const node = widgets[widget.id];
            if (!node) return null;
            return (
              <div
                key={widget.id}
                className={`${HOME_SPAN_CLASS[widget.span]} ${
                  overId === widget.id ? "ring-2 ring-indigo-300" : ""
                } ${editing ? "rounded-2xl border border-dashed border-indigo-200 bg-white/60" : ""}`}
                onDragOver={(event) => {
                  if (!editing || !dragId) return;
                  event.preventDefault();
                  if (dragId !== widget.id) setOverId(widget.id);
                }}
                onDragLeave={() => setOverId((current) => (current === widget.id ? null : current))}
                onDrop={(event) => {
                  if (!editing || !dragId) return;
                  event.preventDefault();
                  if (dragId !== widget.id) onChange(moveById(layout, dragId, widget.id));
                  setDragId(null);
                  setOverId(null);
                }}
              >
                {editing ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        setDragId(widget.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", widget.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverId(null);
                      }}
                      className="cursor-grab rounded p-2 text-slate-500 hover:bg-white hover:text-slate-700 active:cursor-grabbing dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                      aria-label={`Перетащить блок «${HOME_WIDGET_LABELS[widget.id]}»`}
                      title="Перетащить"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{HOME_WIDGET_LABELS[widget.id]}</span>
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(widget.id, -1)}
                        className="rounded p-2 hover:bg-white dark:hover:bg-slate-700"
                        aria-label="Выше"
                        title="Выше"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(widget.id, 1)}
                        className="rounded p-2 hover:bg-white dark:hover:bg-slate-700"
                        aria-label="Ниже"
                        title="Ниже"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <select
                        value={widget.span}
                        onChange={(event) => patch(widget.id, { span: event.target.value as HomeSpan })}
                        aria-label={`Ширина блока «${HOME_WIDGET_LABELS[widget.id]}»`}
                        className="min-h-[32px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                      >
                        {SPAN_OPTIONS.map((span) => (
                          <option key={span} value={span}>
                            {HOME_SPAN_LABELS[span]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => remove(widget.id)}
                        className="rounded p-2 text-slate-500 hover:bg-white hover:text-[var(--status-critical-fg)] dark:text-slate-400 dark:hover:bg-slate-700"
                        aria-label={`Убрать блок «${HOME_WIDGET_LABELS[widget.id]}»`}
                        title="Убрать"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                ) : null}
                <div className={editing ? "p-2" : ""}>{node}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
