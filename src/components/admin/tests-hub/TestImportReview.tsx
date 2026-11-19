"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react";

import type { ParsedTest } from "@/lib/documents/importTest";
import { TestImportInfoForm } from "./TestImportInfoForm";
import { TestImportQuestionsList } from "./TestImportQuestionsList";
import type { TestImportController } from "./useTestImport";

type Props = {
  page: TestImportController;
  parsedTest: ParsedTest;
};

/** Экран проверки и сохранения импортированного теста. */
export function TestImportReview({ page, parsedTest }: Props) {
  const { error, saveSuccess, saving, attestation, handleSubmit, resetForm } = page;

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header>
        <Link href="/admin" className="text-sm text-indigo-600">← Админ</Link>
        <h1 className="mt-1 page-title flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6" />
          Проверка и сохранение теста
        </h1>
        <p className="page-subtitle">
          Найдено вопросов: <b>{parsedTest.questions.length}</b>. Проверьте корректность данных и сохраните.
        </p>
      </header>

      {/* Предупреждения */}
      {(error || saveSuccess) && (
        <div className={`rounded-xl px-4 py-3 ${
          saveSuccess
            ? "bg-green-50 text-green-700"
            : "bg-red-50 text-red-700"
        }`}>
          <div className="flex items-center gap-2">
            {saveSuccess ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
            <span className="font-medium">{saveSuccess ? "Сохранено успешно!" : error}</span>
          </div>
        </div>
      )}

      {/* Форма аттестации */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Общая информация */}
          <TestImportInfoForm page={page} />

          {/* Вопросы */}
          <TestImportQuestionsList page={page} />
        </div>

        {/* Боковая панель */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-3 font-semibold">Детали</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Источник:</span>
                <b className="text-right">{parsedTest.sourceName}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Всего вопросов:</span>
                <b className="text-right">{parsedTest.questions.length}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Разбрано:</span>
                <b className="text-right">{new Date(parsedTest.parsedAt).toLocaleTimeString()}</b>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              disabled={saving}
              onClick={handleSubmit}
              className={`btn-primary flex items-center justify-center gap-2 ${saving ? "pointer-events-none opacity-50" : ""}`}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Сохраняю...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Сохранить тест
                </>
              )}
            </button>

            <button
              onClick={resetForm}
              className="btn-secondary"
            >
              Загрузить другой файл
            </button>
          </div>

          <div className="rounded-lg bg-blue-50 p-4 text-xs text-blue-700">
            <strong>Подсказка:</strong> Вы можете редактировать вопросы и варианты ответов перед сохранением.
          </div>
        </div>
      </div>
    </main>
  );
}
