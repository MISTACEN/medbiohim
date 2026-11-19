"use client";

import { CopyPlus, Info, Loader2, RefreshCcw, Search, X } from "lucide-react";

import { questionText } from "./model";
import type { AdminTestsController } from "./useAdminTests";

/** Оверлей «Сборщик тестов»: пул вопросов, параметры, сборка одного или нескольких вариантов. */
export function AdminTestBuilder({ page }: { page: AdminTestsController }) {
  const {
    subjects, builderModules, builderTopics, builderPool,
    setBuilderOpen, resetBuilder, builderBusy,
    builderTitle, setBuilderTitle, builderDescription, setBuilderDescription,
    builderSubject, setBuilderSubject, builderModule, setBuilderModule, builderTopic, setBuilderTopic,
    builderQuestionsPerTest, setBuilderQuestionsPerTest,
    builderVariants, setBuilderVariants,
    builderTimeLimit, setBuilderTimeLimit, builderMaxAttempts, setBuilderMaxAttempts,
    builderPublished, setBuilderPublished,
    builderQuestionSearch, setBuilderQuestionSearch,
    selectedQuestionIds, toggleQuestion, selectVisibleQuestions, clearSelectedQuestions,
    selectedCount, variants, perTest, buildTests,
  } = page;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-2 sm:p-4">
      <div className="card max-h-[96vh] w-full max-w-6xl overflow-y-auto">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div>
            <div className="flex items-center gap-2"><CopyPlus className="h-5 w-5 text-indigo-600" /><h2 className="text-xl font-black text-slate-900">Сборщик тестов</h2></div>
            <p className="mt-1 text-sm text-slate-500">Собери один тест или сразу несколько вариантов из выбранного пула вопросов.</p>
          </div>
          <button type="button" className="rounded-xl border bg-white p-2" onClick={() => setBuilderOpen(false)} title="Закрыть"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
              <div className="flex items-center gap-2 text-sm font-black text-indigo-950"><Info className="h-4 w-4" /> Как должен выглядеть правильный тест</div>
              <div className="mt-2 grid gap-2 text-xs leading-5 text-indigo-950 sm:grid-cols-2">
                <div><b>1.</b> Понятное название: предмет → тема → вариант.</div>
                <div><b>2.</b> У теста один предмет и одна учебная привязка.</div>
                <div><b>3.</b> Каждый вопрос добавляется один раз в конкретный вариант.</div>
                <div><b>4.</b> Правильный ответ хранится в вопросе, а не в названии теста.</div>
                <div><b>5.</b> Публиковать только после проверки состава.</div>
                <div><b>Как отличить:</b> «Тест» — контейнер, «вопрос» — одна проверяемая единица. Один вопрос может входить в несколько тестов.</div>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm md:col-span-2">Название<input className="input mt-1 w-full" value={builderTitle} onChange={(e) => setBuilderTitle(e.target.value)} placeholder="Например: Гистология — Кровь" /></label>
                <label className="text-sm">Предмет<select className="input mt-1 w-full" value={builderSubject} onChange={(e) => { setBuilderSubject(e.target.value); setBuilderModule(""); setBuilderTopic(""); }}><option value="">Выберите предмет</option>{subjects.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}</select></label>
                <label className="text-sm">Модуль<select className="input mt-1 w-full" value={builderModule} onChange={(e) => { setBuilderModule(e.target.value); setBuilderTopic(""); }}><option value="">Без модуля</option>{builderModules.map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.title ?? m.name)}</option>)}</select></label>
                <label className="text-sm">Тема<select className="input mt-1 w-full" value={builderTopic} onChange={(e) => setBuilderTopic(e.target.value)}><option value="">Без темы</option>{builderTopics.map((t) => <option key={String(t.id)} value={String(t.id)}>{String(t.name ?? t.title)}</option>)}</select></label>
                <label className="text-sm">Вопросов в одном тесте<input className="input mt-1 w-full" type="number" min={1} max={200} value={builderQuestionsPerTest} onChange={(e) => setBuilderQuestionsPerTest(e.target.value)} /></label>
                <label className="text-sm">Сколько вариантов собрать<input className="input mt-1 w-full" type="number" min={1} max={20} value={builderVariants} onChange={(e) => setBuilderVariants(e.target.value)} /></label>
                <label className="text-sm">Время, секунд<input className="input mt-1 w-full" type="number" min={0} value={builderTimeLimit} onChange={(e) => setBuilderTimeLimit(e.target.value)} /></label>
                <label className="text-sm">Максимум попыток<input className="input mt-1 w-full" type="number" min={0} value={builderMaxAttempts} onChange={(e) => setBuilderMaxAttempts(e.target.value)} /></label>
                <label className="text-sm md:col-span-2">Описание<textarea className="input mt-1 min-h-20 w-full" value={builderDescription} onChange={(e) => setBuilderDescription(e.target.value)} placeholder="Что проверяет этот тест, какой материал и правила." /></label>
                <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2"><input type="checkbox" checked={builderPublished} onChange={(e) => setBuilderPublished(e.target.checked)} /> Опубликовать сразу после сборки</label>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><div className="text-sm font-black text-slate-900">Пул вопросов</div><div className="text-xs text-slate-500">Выбрано: <b>{selectedCount}</b> · на вариант: <b>{perTest}</b> · вариантов: <b>{variants}</b></div></div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-xl border bg-slate-50 px-3 py-2 text-xs font-bold" onClick={selectVisibleQuestions}>Выбрать показанные</button>
                  <button type="button" className="rounded-xl border bg-white px-3 py-2 text-xs font-bold" onClick={clearSelectedQuestions}>Очистить выбор</button>
                </div>
              </div>
              <div className="mt-3 flex gap-2"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="input w-full pl-9" value={builderQuestionSearch} onChange={(e) => setBuilderQuestionSearch(e.target.value)} placeholder="Искать по тексту вопроса…" /></div></div>
              <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {builderPool.map((item, index) => {
                  const id = String(item.id);
                  const selected = selectedQuestionIds.includes(id);
                  return (
                    <label key={id} className={"flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition " + (selected ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50")}>
                      <input type="checkbox" checked={selected} onChange={() => toggleQuestion(id)} className="mt-1" />
                      <span className="min-w-0 flex-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">#{index + 1} · {String(item.type ?? "question")}</span><span className="mt-1 block leading-5 text-slate-800">{questionText(item)}</span></span>
                    </label>
                  );
                })}
                {!builderPool.length && <div className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Вопросы по выбранным условиям не найдены.</div>}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] p-4">
              <div className="text-sm font-black text-[var(--status-ok-fg)]">Что произойдёт при сборке</div>
              <div className="mt-2 space-y-2 text-xs leading-5 text-[var(--status-ok-fg)]">
                <div><b>{variants}</b> тест{variants === 1 ? "" : "а"} будет создано.</div>
                <div>В каждом будет по <b>{perTest}</b> разных вопросов из выбранного пула.</div>
                <div>При нескольких вариантах порядок и состав перемешиваются отдельно для каждого варианта.</div>
                <div>Публикация отключена по умолчанию — сначала можно проверить состав.</div>
              </div>
            </section>

            <section className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-black text-slate-900"><RefreshCcw className="h-4 w-4" /> Новый тест</div>
              <p className="mt-2 text-xs leading-5 text-slate-600">Кнопка «Сброс» очищает название, предмет, тему, настройки и весь выбранный пул. Это удобно перед сборкой другого теста.</p>
            </section>

            <div className="sticky bottom-0 space-y-2 rounded-2xl border bg-white p-3 shadow-lg">
              <button type="button" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700" disabled={builderBusy} onClick={resetBuilder}><RefreshCcw className="mr-2 inline h-4 w-4" />Сброс для нового теста</button>
              <button type="button" className="btn-primary w-full" disabled={builderBusy} onClick={() => void buildTests()}>{builderBusy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <CopyPlus className="mr-2 inline h-4 w-4" />}Собрать {variants === 1 ? "тест" : variants + " теста"}</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
