"use client";

/** Импорт тестов из оригинальной системы: загрузка, preview, импорт. */
import Link from "next/link";
import { AlertCircle, ClipboardCheck, Loader2, ShieldCheck } from "lucide-react";
import { DestinationCard } from "@/components/university/import/DestinationCard";
import { PreviewSection } from "@/components/university/import/PreviewSection";
import { UploadCard } from "@/components/university/import/UploadCard";
import { useUniversityImport } from "@/components/university/import/useUniversityImport";

export default function UniversityImportPage() {
  const page = useUniversityImport();
  const { authLoading, hasToken: token, isAdmin, message, errors } = page;

  if (authLoading) {
    return (
      <div className="mx-auto flex max-w-md items-center gap-2 p-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Проверяем доступ…
      </div>
    );
  }

  if (!token) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Импорт тестов</h1>
        <p className="page-subtitle">Сначала войдите в MEDBIOHIM.</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="card mx-auto max-w-lg p-8">
        <h1 className="page-title flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-[var(--status-warn-fg)]" /> Нужен доступ администратора</h1>
        <p className="mt-2 text-sm text-slate-600">
          Сбор и импорт вопросов доступен только администратору. Это защищает учебную базу от случайной публикации
          непроверенных материалов. Вы можете вернуться в университетский хаб и открыть официальную систему тестирования.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/university" className="btn-primary">В университетский хаб</Link>
          <a href="http://test.fesmu.ru:8080/" target="_blank" rel="noreferrer" className="btn-secondary">Оригинальные тесты</a>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="rounded-2xl border border-[var(--status-warn-border)] bg-gradient-to-br from-amber-50 via-white to-indigo-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--status-warn-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--status-warn-fg)]">
              <ClipboardCheck className="h-3.5 w-3.5" /> Bridge → preview → импорт
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">Сбор тестов из оригинальной системы</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Загрузите JSON, собранный расширением MEDBIOHIM Bridge на странице{" "}
              <a href="http://test.fesmu.ru:8080/" target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 underline">
                test.fesmu.ru
              </a>
              . Импорт выполняется только после preview и доступен администратору. По умолчанию материалы не публикуются.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-slate-600">
              <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">Пароль ЕИОС не сохраняется</span>
              <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">Правильные ответы отмечает пользователь</span>
              <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">Повторный импорт обновляет по source_key</span>
            </div>
          </div>
          <Link href="/university" className="btn-secondary inline-flex items-center gap-2">
            Назад в хаб
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <UploadCard page={page} />
        <DestinationCard page={page} />
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm ${errors.length ? "border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]" : "border border-indigo-100 bg-indigo-50 text-indigo-700"}`}>
          {message}
        </div>
      )}

      {errors.length > 0 && (
        <section className="card border-[var(--status-critical-border)]">
          <h2 className="font-bold text-[var(--status-critical-fg)]">Ошибки API ({errors.length})</h2>
          <div className="mt-3 max-h-64 space-y-2 overflow-auto">
            {errors.map((error, index) => (
              <div key={`${error.sheet}-${error.row}-${index}`} className="rounded-lg bg-[var(--status-critical-bg)] p-2 text-xs text-[var(--status-critical-fg)]">
                {error.sheet}, строка {error.row}: {error.error}
              </div>
            ))}
          </div>
        </section>
      )}

      <PreviewSection page={page} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><AlertCircle className="h-4 w-4 text-slate-500" /> Как собрать JSON</h2>
        <ol className="mt-3 grid gap-2 text-xs leading-relaxed text-slate-600 md:grid-cols-4">
          <li className="rounded-xl bg-slate-50 p-3"><b className="text-slate-800">1.</b> Откройте тест в оригинальной системе в своей сессии.</li>
          <li className="rounded-xl bg-slate-50 p-3"><b className="text-slate-800">2.</b> Откройте расширение Bridge и нажмите «Считать вопрос».</li>
          <li className="rounded-xl bg-slate-50 p-3"><b className="text-slate-800">3.</b> Отметьте правильные номера, добавьте вопрос в набор и скачайте JSON.</li>
          <li className="rounded-xl bg-slate-50 p-3"><b className="text-slate-800">4.</b> Загрузите JSON сюда, проверьте preview и импортируйте.</li>
        </ol>
      </section>
    </main>
  );
}
