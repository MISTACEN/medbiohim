"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import JSZip from "jszip";
import { CheckCircle2, FileArchive, FileJson, Loader2, UploadCloud } from "lucide-react";
import { adminImportContentPackage, hasToken, uploadFile } from "@/lib/api";

type Bundle = {
  package_id: string;
  version?: string;
  specialty_slug: string;
  subject_slug: string;
  stats?: Record<string, number>;
  trainer_cards: Array<Record<string, any>>;
  lectures?: Array<Record<string, any>>;
  sources: Array<Record<string, any>>;
  materials: Array<Record<string, any>>;
  tests: Array<Record<string, any>>;
};

function entryCandidates(path: string): string[] {
  const clean = path.replace(/^\/+/, "");
  const out = new Set<string>([clean]);
  if (!clean.startsWith("features/")) out.add("features/" + clean);
  if (clean.startsWith("5_Фотографии препаратов/")) out.add("features/histology-content/photos/" + clean);
  if (clean.startsWith("electronograms/images/")) out.add("features/histology-content/" + clean);
  if (clean.startsWith("photos/")) out.add("features/histology-content/" + clean);
  return [...out];
}

async function readJson(file: File): Promise<Bundle> {
  const raw = JSON.parse(await file.text()) as Bundle;
  if (raw.specialty_slug !== "mbh" || raw.subject_slug !== "histology") {
    throw new Error("Этот пакет не соответствует гистологии МБХ.");
  }
  if (!raw.package_id || !Array.isArray(raw.trainer_cards) || !Array.isArray(raw.sources) || !Array.isArray(raw.materials) || !Array.isArray(raw.tests)) {
    throw new Error("Некорректная структура пакета импорта.");
  }
  return raw;
}

async function uploadPool(items: Array<{ path: string; entry: JSZip.JSZipObject }>, onProgress: (done: number, total: number) => void) {
  const result = new Map<string, string>();
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i];
      const blob = await item.entry.async("blob");
      const file = new File([blob], item.path.split("/").pop() || "source.bin", { type: blob.type || "application/octet-stream" });
      const r = await uploadFile(file, undefined, "mbh");
      if (!r.ok) throw new Error((item.path || "file") + ": " + r.error.message);
      result.set(item.path, String(r.data.file.id));
      done += 1;
      onProgress(done, items.length);
    }
  }

  const workers = Array.from({ length: Math.min(4, Math.max(1, items.length)) }, () => worker());
  await Promise.all(workers);
  return result;
}

export default function AdminContentPackagePage() {
  const [bundleFile, setBundleFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Record<string, any> | null>(null);

  const counts = useMemo(() => {
    if (!bundle) return null;
    return {
      documents: bundle.sources.length,
      materials: bundle.materials.length,
      trainer: bundle.trainer_cards.length,
      tests: bundle.tests.length,
      questions: bundle.tests.reduce((n, t) => n + (Array.isArray(t.questions) ? t.questions.length : 0), 0),
    };
  }, [bundle]);

  async function prepareManifest(file: File | null) {
    if (!file) return;
    try {
      setBundle(await readJson(file));
      setStatus("Пакет прочитан. Теперь можно загрузить исходники и импортировать контент.");
      setResult(null);
    } catch (e) {
      setBundle(null);
      setStatus(e instanceof Error ? e.message : "Не удалось прочитать JSON");
    }
  }

  async function runImport() {
    if (!bundle || !zipFile) {
      setStatus("Нужно выбрать JSON-пакет и features.zip.");
      return;
    }
    if (!hasToken()) {
      setStatus("Сначала войдите под admin.");
      return;
    }

    setBusy(true);
    setResult(null);
    setProgress(0);

    try {
      setStatus("Читаю ZIP…");
      const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
      const needed = new Set<string>();

      for (const source of bundle.sources) {
        const p = String(source.source_path || "");
        for (const candidate of entryCandidates(p)) if (zip.file(candidate)) { needed.add(candidate); break; }
      }
      for (const card of bundle.trainer_cards) {
        const p = String(card.preparation?.imagePath || "");
        for (const candidate of entryCandidates(p)) if (zip.file(candidate)) { needed.add(candidate); break; }
      }

      const uploadItems: Array<{ path: string; entry: JSZip.JSZipObject }> = [];
      needed.forEach((path) => {
        const entry = zip.file(path);
        if (entry && !entry.dir) uploadItems.push({ path, entry });
      });

      setStatus("Загружаю оригинальные Word/DOCX и изображения в B2…");
      const fileMap = await uploadPool(uploadItems, (done, total) => {
        setProgress(total ? Math.round((done / total) * 70) : 70);
        setStatus("Оригиналы: " + done + " / " + total);
      });

      const resolveUploaded = (sourcePath: string): string | null => {
        for (const candidate of entryCandidates(sourcePath)) {
          const id = fileMap.get(candidate);
          if (id) return id;
        }
        return null;
      };

      const sources = bundle.sources.map((x) => ({ ...x, file_id: resolveUploaded(String(x.source_path || "")) }));
      const materials = bundle.materials.map((x) => ({ ...x, file_id: resolveUploaded(String(bundle.sources.find((s) => s.id === x.source_key)?.source_path || "")) }));
      const trainer_cards = bundle.trainer_cards.map((x) => ({ ...x, specialty_slug: "mbh", subject_slug: "histology", source_file_id: resolveUploaded(String(x.preparation?.imagePath || "")) }));

      setStatus("Сохраняю материалы, тренажёр и тесты в Supabase…");
      setProgress(80);
      const r = await adminImportContentPackage({
        package_id: bundle.package_id,
        specialty_slug: "mbh",
        subject_slug: "histology",
        sources,
        materials,
        trainer_cards,
        tests: bundle.tests,
      });
      if (!r.ok) throw new Error(r.error.message);
      setProgress(100);
      setResult(r.data.stats || {});
      setStatus("Импорт завершён.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Импорт завершился ошибкой");
    } finally {
      setBusy(false);
    }
  }

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
          <div className="flex items-center gap-3"><FileArchive className="h-6 w-6 text-emerald-600" /><div><div className="font-semibold">Исходный ZIP</div><div className="text-xs text-slate-500">features.zip с Word и фотографиями</div></div></div>
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
        {result && <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{Object.entries(result).map(([k,v]) => <div key={k} className="rounded-xl border bg-emerald-50 p-3"><div className="text-[11px] uppercase text-emerald-700">{k}</div><div className="text-xl font-bold text-emerald-900">{String(v)}</div></div>)}</div>}
        {result && <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> Контент записан в Supabase, оригиналы привязаны к B2.</div>}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Весь этот пакет помечается специальностью <strong>МБХ</strong>. Это не UI-фильтр: backend проверяет specialty через активную группу пользователя. «Стом. гистология» из архива также остаётся внутри МБХ.
      </div>

      {!bundleFile || !zipFile ? <p className="text-xs text-slate-500">Для запуска нужны оба файла: сгенерированный JSON-манифест и исходный ZIP.</p> : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="card"><div className="text-xs uppercase text-slate-400">{label}</div><div className="text-2xl font-bold text-indigo-600">{value}</div></div>;
}
