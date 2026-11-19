"use client";

import Link from "next/link";
import { FileText, Loader2, Upload, XCircle } from "lucide-react";

import type { TestImportController } from "./useTestImport";

/** Экран загрузки DOCX-файла с тестом. */
export function TestImportUpload({ page }: { page: TestImportController }) {
  const { loading, error, onDrop, onInputChange } = page;

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header>
        <Link href="/admin" className="text-sm text-indigo-600">← Админ</Link>
        <h1 className="mt-1 page-title flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Импорт теста из документа
        </h1>
        <p className="page-subtitle">
          Перетащите DOCX файл или загрузите его. Поддерживается формат с вопросами и вариантами ответов.
        </p>
      </header>

      {!error && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={onDrop}
          className="card border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-12 text-center hover:border-indigo-300 transition-colors"
        >
          <Upload className="mx-auto mb-4 h-16 w-16 text-indigo-400" />
          <h3 className="text-lg font-semibold text-slate-700">Загрузить тест из DOCX</h3>
          <p className="mt-2 text-sm text-slate-500">
            Перетащите файл сюда или нажмите кнопку ниже
          </p>
          <label className={`btn-primary mt-6 inline-flex cursor-pointer ${loading ? "pointer-events-none opacity-50" : ""}`}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Разбираю...</> : <span>Выбрать файл</span>}
            <input
              type="file"
              accept=".docx"
              className="hidden"
              onChange={onInputChange}
            />
          </label>
          <div className="mt-8 rounded-lg bg-white p-4 text-left">
            <h4 className="font-semibold text-slate-700">Формат файла:</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
              <li><b>Вопросы</b> начинаются с цифры и точки: <code>1. Текст вопроса</code></li>
              <li><b>Правильный ответ</b> помечается <code>@1.</code>, <code>@2.</code> и т.д.</li>
              <li><b>Неправильные ответы</b> помечаются <code>#1.</code>, <code>#2.</code></li>
            </ul>
            <div className="mt-3 rounded bg-slate-100 p-3 text-xs">
              <pre className="whitespace-pre-wrap">{`1. Какой символ используется для правильного ответа?
@1. Правильный вариант
#2. Неправильный вариант
#3. Ещё неправильный`}</pre>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="card border-l-4 border-l-red-500 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <XCircle className="h-6 w-6 text-red-500" />
            <div>
              <h3 className="font-semibold text-red-700">Ошибка загрузки</h3>
              <p className="mt-1 text-sm text-red-600">{error}</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
