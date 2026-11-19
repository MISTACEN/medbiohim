"use client";

/** Импорт контент-пакета гистологии: композиция. */
import Link from "next/link";
import { CheckCircle2, FileArchive, FileJson, Loader2, UploadCloud } from "lucide-react";
import { hasToken } from "@/lib/api";
import { useContentPackagePanel } from "@/components/admin/panels/useContentPackagePanel";

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="card"><div className="text-xs uppercase text-slate-400">{label}</div><div className="text-2xl font-bold text-indigo-600">{value}</div></div>;
}

export function ContentPackagePanel() {
  const panel = useContentPackagePanel();
  const {
    bundleFile, setBundleFile, zipFile, setZipFile,
    bundle, status, busy, progress, result, counts,
    prepareManifest, runImport,
  } = panel;

  if (!hasToken()) {
    return <div className="card mx-auto mt-10 max-w-md p-8 text-center"><p className="text-slate-600">Войдите под admin.</p><Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link></div>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header>
        <Link href="/admin" className="text-sm text-indigo-600 hover:underline">← CMS</Link>
        <h1 className="mt-1 page-title">Импорт контент-пакета</h1>
        <p className="page-subtitle">Гистология МБХ: документы → страницы сайта, Word → источники, изображения → тренажёр, тесты → интерактивные вопросы.</p>
      </header>

      <div className="card grid gap-4 md:grid-cols-2">
        <label className="rounded-2xl border-2 border-dashed border-slate-200 p-5">
          <div className="flex items-center gap-3"><FileJson className="h-6 w-6 text-indigo-600" /><div><div className="font-semibold">JSON-пакет</div><div className="text-xs text-slate-500">Готовый histology_import_bundle.json</div></div></div>
          <input type="file" accept=".json,application/json" className="mt-4 block w-full text-sm" onChange={(e) => { const f = e.target.files?.[0] || null; setBundleFile(f); void prepareManifest(f); }} />
        </label>
        <label className="rounded-2xl border-2 border-dashed border-slate-200 p-5">
          <div className="flex items-center gap-3"><FileArchive className="h-6 w-6 text-[var(--status-ok-fg)]" /><div><div className="font-semibold">Исходный ZIP</div><div className="text-xs text-slate-500">features.zip с Word и фотографиями</div></div></div>
          <input type="file" accept=".zip,application/zip" className="mt-4 block w-full text-sm" onChange={(e) => setZipFile(e.target.files?.[0] || null)} />
        </label>
      </div>

      {bundle && counts && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Документы" value={counts.documents} />
          <Stat label="Материалы" value={counts.materials} />
          <Stat label="Препараты" value={counts.trainer} />
          <Stat label="Тесты" value={counts.tests} />
          <Stat label="Вопросы" value={counts.questions} />
        </div>
      )}

      <div className="card space-y-4">
        <button type="button" disabled={busy || !bundle || !zipFile} onClick={() => void runImport()} className="btn-primary inline-flex items-center gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Импортировать всё
        </button>
        {busy && <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-600 transition-all" style={{ width: progress + "%" }} /></div>}
        {status && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{status}</div>}
        {result && <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{Object.entries(result).map(([k,v]) => <div key={k} className="rounded-xl border bg-[var(--status-ok-bg)] p-3"><div className="text-[11px] uppercase text-[var(--status-ok-fg)]">{k}</div><div className="text-xl font-bold text-[var(--status-ok-fg)]">{String(v)}</div></div>)}</div>}
        {result && <div className="flex items-center gap-2 text-sm font-semibold text-[var(--status-ok-fg)]"><CheckCircle2 className="h-5 w-5" /> Контент сохранён, оригиналы привязаны к файлам.</div>}
      </div>

      <div className="rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-4 text-sm text-[var(--status-warn-fg)]">
        Весь этот пакет помечается специальностью <strong>МБХ</strong>. Это не UI-фильтр: backend проверяет specialty через активную группу пользователя. «Стом. гистология» из архива также остаётся внутри МБХ.
      </div>

      {!bundleFile || !zipFile ? <p className="text-xs text-slate-500">Для запуска нужны оба файла: сгенерированный JSON-манифест и исходный ZIP.</p> : null}
    </main>
  );
}
