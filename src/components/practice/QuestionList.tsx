"use client";

import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Star,
} from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import { questionTypeLabel } from "@/lib/question-types";

import { PAGE_SIZE, answerPreview } from "./model";

export type QuestionListProps = {
  loading: boolean;
  items: any[];
  total: number;
  page: number;
  selectedId: string | null;
  favoriteIds: Set<string>;
  subjectsById: Map<string, string>;
  activeSubjectLabel: string;
  hasFilters: boolean;
  listRef: RefObject<HTMLDivElement | null>;
  onOpen: (id: string) => void;
  onReset: () => void;
  onPage: Dispatch<SetStateAction<number>>;
};

/** Левая колонка базы вопросов: результаты поиска, скелетон и пагинация. */
export function QuestionList({
  loading,
  items,
  total,
  page,
  selectedId,
  favoriteIds,
  subjectsById,
  activeSubjectLabel,
  hasFilters,
  listRef,
  onOpen,
  onReset,
  onPage,
}: QuestionListProps) {
  return (
    <div ref={listRef} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-700">
          {loading ? "Ищу вопросы…" : `Найдено: ${total}`}
        </div>
        <div className="text-xs text-slate-500">Страница {page + 1}</div>
      </div>

      <div className="card p-2 sm:p-3 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-xl border border-[var(--border)] p-3">
                <div className="h-3 w-24 rounded bg-slate-200" />
                <div className="mt-3 h-4 w-full rounded bg-slate-200" />
                <div className="mt-2 h-4 w-2/3 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center p-6 text-center">
            <Search className="h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-800">Ничего не найдено</p>
            <p className="mt-1 text-sm text-slate-500">Измените предмет, тип вопроса или поисковый запрос.</p>
            {hasFilters && (
              <button
                type="button"
                onClick={onReset}
                className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item: any) => {
              const active = String(selectedId || "") === String(item.id);
              const itemSubject = subjectsById.get(String(item.subject_id || ""))
                || (item.subject ? String(item.subject) : activeSubjectLabel);
              const typeLabel = questionTypeLabel(item.type);
              const preview = item.has_answer ? answerPreview(item.answer) : "";
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(item.id)}
                    className={
                      "w-full rounded-xl border px-3 py-3 text-left transition " +
                      (active
                        ? "border-indigo-300 bg-indigo-50/80"
                        : "border-transparent hover:border-indigo-200 hover:bg-indigo-50/40")
                    }
                  >
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{itemSubject}</span>
                      {typeLabel && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{typeLabel}</span>
                      )}
                      {item.has_answer ? (
                        <span className="rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 font-semibold text-[var(--status-ok-fg)]">Ответ есть</span>
                      ) : (
                        <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 font-semibold text-[var(--status-warn-fg)]">Без ответа</span>
                      )}
                      {favoriteIds.has(String(item.id)) && <Star className="h-3.5 w-3.5 fill-current text-[var(--status-warn-fg)]" />}
                    </div>
                    <div className="mt-2 line-clamp-3 text-sm font-semibold leading-5 text-slate-900">
                      {item.text || item.stem || "Вопрос"}
                    </div>
                    {preview && (
                      <div className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--status-ok-fg)]">
                        <span className="font-semibold">Ответ:</span> {preview}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-500">
          Страница {page + 1} · вопросы {total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => onPage((value) => Math.max(0, value - 1))}
            className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Назад
          </button>
          <button
            type="button"
            disabled={(page + 1) * PAGE_SIZE >= total || loading}
            onClick={() => onPage((value) => value + 1)}
            className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
          >
            Далее <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Заглушка правой колонки, пока вопрос не выбран (только на широком экране). */
export function QuestionDetailPlaceholder({ loading }: { loading: boolean }) {
  if (loading) {
    return (
      <div className="card flex min-h-[320px] items-center justify-center p-8 text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Загружаю вопрос…
      </div>
    );
  }
  return (
    <div className="card hidden min-h-[320px] flex-col items-center justify-center p-8 text-center lg:flex">
      <BookOpenCheck className="h-9 w-9 text-indigo-300" />
      <p className="mt-3 font-semibold text-slate-800">Выберите вопрос из списка</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
        Правильный ответ доступен сразу — тест запускать не нужно. Можно сохранить заметку и добавить вопрос в избранное.
      </p>
    </div>
  );
}
