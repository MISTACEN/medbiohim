"use client";

/**
 * База вопросов как экран, а не отдельный раздел.
 *
 * Раньше это была самостоятельная страница `/practice` со своей шапкой и
 * ссылками. Теперь тот же экран открывается вкладкой «Вопросы» на `/tests`,
 * поэтому `compact` убирает дублирующую шапку, а логика и разметка остаются
 * ровно те же — второй копии базы нет.
 */
import Link from "next/link";
import { BookOpenCheck, Loader2, Microscope, Star } from "lucide-react";

import { hasToken } from "@/lib/api";
import { plural } from "@/components/practice/model";
import { PracticeFilters } from "@/components/practice/PracticeFilters";
import { QuestionDetail } from "@/components/practice/QuestionDetail";
import { QuestionDetailPlaceholder, QuestionList } from "@/components/practice/QuestionList";
import { usePracticeData } from "@/components/practice/usePracticeData";

export function PracticeView({ compact = false }: { compact?: boolean }) {
  const practice = usePracticeData();
  const {
    authLoading,
    query, setQuery,
    debouncedQuery,
    subjectId, subjectSlug,
    kind, setKind,
    subjects, subjectsLoading, subjectsError,
    subjectCounts, allQuestionsTotal, subjectTotal,
    items, total, loading, reloadList, queryError,
    page, setPage,
    hasFilters, activeSubjectLabel, activeKind,
    selectSubject, resetFilters,
    selected, selectedLoading, openQuestion,
    showAnswer, setShowAnswer,
    draft, setDraft,
    favoriteIds, toggleSelectedFavorite,
    savedNote, setSavedNote, noteSaving, savedMessage, saveSelectedNote,
    actionError,
    detailRef, listRef,
  } = practice;

  if (authLoading) {
    return (
      <div className="card flex items-center gap-3 p-8 text-sm text-[var(--muted)]">
        <Loader2 className="h-5 w-5 animate-spin" /> Загружаю базу вопросов…
      </div>
    );
  }

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <BookOpenCheck className="mx-auto h-9 w-9 text-indigo-300" />
        <p className="mt-3 font-semibold text-slate-800">Войдите, чтобы открыть базу вопросов.</p>
        <p className="mt-1 text-sm text-slate-500">Вопросы и эталоны доступны без запуска теста.</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-4" : "mx-auto max-w-7xl space-y-5"}>
      {compact ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">
            {total} {plural(total, "вопрос", "вопроса", "вопросов")}
          </span>
          {subjects.length > 0 && (
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">
              {subjects.length} {plural(subjects.length, "предмет", "предмета", "предметов")}
            </span>
          )}
          {favoriteIds.size > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-warn-bg)] px-3 py-1.5 font-semibold text-[var(--status-warn-fg)]">
              <Star className="h-3.5 w-3.5 fill-current" /> {favoriteIds.size}
            </span>
          )}
          <Link href="/atlas" className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-indigo-700 ring-1 ring-slate-200 hover:bg-indigo-50">
            <Microscope className="h-3.5 w-3.5" /> Атлас
          </Link>
        </div>
      ) : (
        <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <BookOpenCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">База знаний · эталоны</p>
                <h1 className="mt-1 text-2xl font-extrabold text-slate-950 sm:text-3xl">База вопросов</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  Гистология, физиология и органическая химия в одном месте. Выберите предмет и тип вопроса — откройте карточку, чтобы сразу увидеть эталон.
                  Микропрепараты с фото и подписями — в отдельном атласе.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 text-xs">
              <Link
                href="/atlas"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
              >
                <Microscope className="h-3.5 w-3.5" /> Атлас микропрепаратов
              </Link>
              <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                {total} {plural(total, "вопрос", "вопроса", "вопросов")}
              </span>
              {subjects.length > 0 && (
                <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                  {subjects.length} {plural(subjects.length, "предмет", "предмета", "предметов")}
                </span>
              )}
              {favoriteIds.size > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-semibold text-[var(--status-warn-fg)] shadow-sm">
                  <Star className="h-3.5 w-3.5 fill-current" /> {favoriteIds.size}
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {queryError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">
          <span>{queryError}</span>
          <button
            type="button"
            onClick={reloadList}
            className="rounded-lg border border-[var(--status-critical-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--status-critical-fg)]"
          >
            Повторить
          </button>
        </div>
      )}
      {actionError && (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">{actionError}</div>
      )}
      {subjectsError && (
        <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-4 py-3 text-sm text-[var(--status-warn-fg)]">{subjectsError}</div>
      )}

      <PracticeFilters
        subjects={subjects}
        subjectsLoading={subjectsLoading}
        subjectId={subjectId}
        subjectSlug={subjectSlug}
        subjectCounts={subjectCounts}
        allQuestionsTotal={allQuestionsTotal}
        subjectTotal={subjectTotal}
        kind={kind}
        query={query}
        hasFilters={hasFilters}
        activeSubjectLabel={activeSubjectLabel}
        activeKind={activeKind}
        debouncedQuery={debouncedQuery}
        onSelectSubject={selectSubject}
        onKind={setKind}
        onQuery={setQuery}
        onReset={resetFilters}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <QuestionList
          loading={loading}
          items={items}
          total={total}
          page={page}
          selectedId={selected ? String(selected.id) : null}
          favoriteIds={favoriteIds}
          subjectsById={practice.subjectsById}
          activeSubjectLabel={activeSubjectLabel}
          hasFilters={hasFilters}
          listRef={listRef}
          onOpen={(id) => void openQuestion(id)}
          onReset={resetFilters}
          onPage={setPage}
        />

        <div
          ref={detailRef}
          className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto"
        >
          {selectedLoading || !selected ? (
            <QuestionDetailPlaceholder loading={selectedLoading} />
          ) : (
            <QuestionDetail
              selected={selected}
              activeSubjectLabel={activeSubjectLabel}
              showAnswer={showAnswer}
              draft={draft}
              favorite={favoriteIds.has(String(selected.id))}
              note={savedNote}
              noteSaving={noteSaving}
              savedMessage={savedMessage}
              onDraft={setDraft}
              onNote={setSavedNote}
              onToggleAnswer={() => setShowAnswer((value) => !value)}
              onToggleFavorite={() => void toggleSelectedFavorite()}
              onSaveNote={() => void saveSelectedNote()}
              onBack={() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default PracticeView;
