"use client";

/** Импорт контент-пакета гистологии: состояние и действия импорта. */
import { useMemo, useState } from "react";
import JSZip from "jszip";
import { adminImportContentPackage, hasToken, uploadFile } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { contentEntryCandidates, type ContentBundle } from "@/components/admin/panels/model";

async function readJson(file: File): Promise<ContentBundle> {
  const raw = JSON.parse(await file.text()) as ContentBundle;
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
      if (!r.ok) throw new Error((item.path || "file") + ": " + describeApiError(r.error));
      result.set(item.path, String(r.data.file.id));
      done += 1;
      onProgress(done, items.length);
    }
  }

  const workers = Array.from({ length: Math.min(4, Math.max(1, items.length)) }, () => worker());
  await Promise.all(workers);
  return result;
}

export function useContentPackagePanel() {
  const [bundleFile, setBundleFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [bundle, setBundle] = useState<ContentBundle | null>(null);
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
        for (const candidate of contentEntryCandidates(p)) if (zip.file(candidate)) { needed.add(candidate); break; }
      }
      for (const card of bundle.trainer_cards) {
        const p = String(card.preparation?.imagePath || "");
        for (const candidate of contentEntryCandidates(p)) if (zip.file(candidate)) { needed.add(candidate); break; }
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
        for (const candidate of contentEntryCandidates(sourcePath)) {
          const id = fileMap.get(candidate);
          if (id) return id;
        }
        return null;
      };

      const sources = bundle.sources.map((x) => ({ ...x, file_id: resolveUploaded(String(x.source_path || "")) }));
      const materials = bundle.materials.map((x) => ({ ...x, file_id: resolveUploaded(String(bundle.sources.find((s) => s.id === x.source_key)?.source_path || "")) }));
      const trainer_cards = bundle.trainer_cards.map((x) => ({ ...x, specialty_slug: "mbh", subject_slug: "histology", source_file_id: resolveUploaded(String(x.preparation?.imagePath || "")) }));

      setStatus("Сохраняю материалы, тренажёр и тесты…");
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
      if (!r.ok) throw new Error(describeApiError(r.error));
      setProgress(100);
      setResult(r.data.stats || {});
      setStatus("Импорт завершён.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Импорт завершился ошибкой");
    } finally {
      setBusy(false);
    }
  }

  return {
    bundleFile, setBundleFile, zipFile, setZipFile,
    bundle, status, busy, progress, result, counts,
    prepareManifest, runImport,
  };
}
