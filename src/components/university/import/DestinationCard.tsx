"use client";

/** Куда импортировать: предмет, название теста и публикация. */
import { ShieldCheck } from "lucide-react";
import type { UniversityImportState } from "@/components/university/import/useUniversityImport";

export function DestinationCard({ page }: { page: UniversityImportState }) {
  const { bundle, subjects, subjectKey, setSubjectKey, testTitle, setTestTitle, publish, setPublish, subjectsError } = page;

  return (
    <section className="card">
      <h2 className="flex items-center gap-2 font-bold text-slate-900"><ShieldCheck className="h-4 w-4 text-[var(--status-ok-fg)]" /> Куда импортировать</h2>
      <label className="field-label mt-3" htmlFor="import-subject">Предмет</label>
      <select id="import-subject" value={subjectKey} onChange={(event) => setSubjectKey(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <option value="">Выберите предмет…</option>
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.slug || subject.name}>{subject.name}</option>
        ))}
      </select>
      {subjectsError && <p className="mt-1 text-xs text-[var(--status-critical-fg)]">{subjectsError}</p>}
      <label className="field-label mt-3" htmlFor="import-test-title">Название теста</label>
      <input id="import-test-title" value={testTitle} onChange={(event) => setTestTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Например: Физиология — итоговый тест" />
      <label className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} className="mt-0.5" />
        <span><b className="text-slate-800">Опубликовать сразу.</b> По умолчанию тест и вопросы сохраняются неопубликованными. Включайте, только если проверили содержание и ответы.</span>
      </label>
      {bundle && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
          <div><b className="text-slate-700">Источник:</b> {bundle.source?.system || "test.fesmu.ru"}</div>
          <div className="break-all"><b className="text-slate-700">URL:</b> {bundle.source?.url || "—"}</div>
          <div><b className="text-slate-700">Собрано:</b> {bundle.source?.collected_at ? new Date(bundle.source.collected_at).toLocaleString("ru-RU") : "—"}</div>
          <div><b className="text-slate-700">Тестовый ключ:</b> {bundle.testKey}</div>
        </div>
      )}
    </section>
  );
}
