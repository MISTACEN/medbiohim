"use client";

/** Загрузка JSON: файл, вставка текста и разбор preview. */
import { Download, FileJson, Trash2, Upload } from "lucide-react";
import { downloadJson } from "@/components/university/import/model";
import type { UniversityImportState } from "@/components/university/import/useUniversityImport";

export function UploadCard({ page }: { page: UniversityImportState }) {
  const { rawText, setRawText, bundle, parseError, fileInput, readFile, analyze, clearAll } = page;

  return (
    <section className="card">
      <h2 className="flex items-center gap-2 font-bold text-slate-900"><Upload className="h-4 w-4 text-indigo-600" /> Загрузить JSON</h2>
      <p className="mt-1 text-xs text-slate-500">
        Поддерживается пакет <code>medbiohim.test-bundle.v1</code>, массив вопросов или один вопрос.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => fileInput.current?.click()}>
          <FileJson className="h-4 w-4" /> Выбрать файл
        </button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={readFile} />
        {rawText && (
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={clearAll}>
            <Trash2 className="h-4 w-4" /> Очистить
          </button>
        )}
      </div>
      <textarea
        value={rawText}
        onChange={(event) => setRawText(event.target.value)}
        rows={10}
        spellCheck={false}
        placeholder='{"schema":"medbiohim.test-bundle.v1","source":{"test_title":"..."},"questions":[...]}'
        className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs outline-none focus:border-indigo-300"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!rawText.trim()} onClick={() => analyze(rawText)}>
          Разобрать и показать preview
        </button>
        {bundle && (
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => downloadJson(bundle, "medbiohim-preview.json")}>
            <Download className="h-4 w-4" /> Скачать preview
          </button>
        )}
      </div>
      {parseError && <p className="mt-3 rounded-lg bg-[var(--status-critical-bg)] px-3 py-2 text-xs text-[var(--status-critical-fg)]">{parseError}</p>}
    </section>
  );
}
