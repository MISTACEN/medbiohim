"use client";

/**
 * Журнал преподавателя: фото распознаётся на устройстве, на сервер уходит
 * только ваша отметка «прочитал» — сам снимок и чужие строки не покидают
 * браузер. Показываем ровно одну строку: свою.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, Copy, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { isolateStudentRow } from "@/lib/journal";

const OCR_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

type TesseractGlobal = {
  createWorker: (lang: string, oem?: number, options?: Record<string, unknown>) => Promise<any>;
};

declare global {
  interface Window {
    Tesseract?: TesseractGlobal;
  }
}

function loadTesseract(): Promise<TesseractGlobal> {
  if (typeof window === "undefined") return Promise.reject(new Error("OCR доступен только в браузере"));
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${OCR_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.Tesseract) resolve(window.Tesseract);
        else reject(new Error("OCR-движок не загрузился"));
      });
      existing.addEventListener("error", () => reject(new Error("Не удалось загрузить OCR-движок")));
      return;
    }
    const script = document.createElement("script");
    script.src = OCR_SCRIPT;
    script.async = true;
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new Error("OCR-движок не загрузился"));
    };
    script.onerror = () => reject(new Error("Не удалось загрузить OCR-движок. Проверьте соединение."));
    document.head.appendChild(script);
  });
}

export default function JournalPage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [row, setRow] = useState<{ line: string; grades: string[]; candidates: number } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.name && !fullName) setFullName(user.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pickPhoto(file: File | null) {
    setError(""); setRow(null); setNotFound(false); setCopied(false);
    setPhoto(file);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function recognize() {
    if (!photo) { setError("Сначала выберите фото журнала"); return; }
    if (fullName.trim().split(/\s+/).length < 2) { setError("Укажите фамилию и имя — иначе строку не отличить от однофамильца"); return; }
    setBusy(true); setError(""); setRow(null); setNotFound(false);
    try {
      setStep("Загружаем OCR-движок…");
      const tesseract = await loadTesseract();
      setStep("Распознаём фото на устройстве…");
      const worker = await tesseract.createWorker("rus", 1, {
        logger: (message: any) => {
          if (message?.status === "recognizing text") setStep(`Распознаём: ${Math.round(Number(message.progress || 0) * 100)}%`);
        },
      });
      try {
        const { data } = await worker.recognize(photo);
        // Важно: наружу отдаём только результат isolateStudentRow. Полный
        // текст OCR не попадает ни в состояние, ни в DOM.
        const isolated = isolateStudentRow(data?.text || "", fullName);
        if (!isolated.matched || !isolated.line) {
          setNotFound(true);
        } else {
          setRow({ line: isolated.line, grades: isolated.grades, candidates: isolated.candidates });
        }
      } finally {
        await worker.terminate().catch(() => undefined);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось распознать фото");
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  async function copyRow() {
    if (!row) return;
    await navigator.clipboard.writeText(row.line).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="space-y-2">
        <Link href="/assignments" className="inline-flex items-center gap-1 text-sm text-indigo-700">
          <ArrowLeft className="h-4 w-4" /> К отработкам
        </Link>
        <h1 className="page-title">Журнал: только ваша строка</h1>
        <p className="page-subtitle">
          Сфотографируйте журнал — распознавание идёт на вашем устройстве. Чужие фамилии и оценки вырезаются
          до показа, фото никуда не отправляется. Это самопроверка, а не база слежки.
        </p>
      </header>

      <section className="card space-y-3 p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Ваши фамилия и имя</span>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Иванов Иван"
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => pickPhoto(event.target.files?.[0] || null)}
            className="hidden"
          />
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary inline-flex items-center gap-2">
            <Camera className="h-4 w-4" /> Сделать или выбрать фото
          </button>
          <button type="button" onClick={() => void recognize()} disabled={busy || !photo} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {busy ? (step || "Распознаём…") : "Распознать на устройстве"}
          </button>
        </div>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Фото журнала" className="max-h-64 w-auto rounded-xl border object-contain" />
        )}
        {error && <p className="rounded-xl bg-[var(--status-critical-bg)] p-2 text-sm text-[var(--status-critical-fg)]">{error}</p>}
      </section>

      {notFound && (
        <section className="card flex items-start gap-3 p-4 text-sm">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-warn-fg)]" />
          <div>
            <b>Строка не найдена.</b> Проверьте написание фамилии и имени или сделайте фото ровнее и ближе к своей строке.
            Чужой текст мы не показываем — даже для проверки.
          </div>
        </section>
      )}

      {row && (
        <section className="card space-y-3 p-4">
          <div className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4 text-[var(--status-ok-fg)]" /> Ваша строка</div>
          <div className="rounded-xl border border-[var(--border)] bg-slate-50 p-3 font-medium">{row.line}</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Оценки в строке:</span>
            {row.grades.length ? row.grades.map((grade, index) => (
              <span key={`${grade}-${index}`} className="rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--status-ok-fg)]">{grade}</span>
            )) : <span className="text-xs text-slate-500">не распознаны — проверьте глазами</span>}
          </div>
          {row.candidates > 1 && (
            <p className="text-xs text-[var(--status-warn-fg)]">Совпало строк: {row.candidates}. Показана самая полная — сверьте инициалы.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyRow()} className="btn-secondary inline-flex items-center gap-2 text-sm">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Скопировано" : "Скопировать строку"}
            </button>
            <Link href="/assignments" className="btn-primary inline-flex items-center gap-2 text-sm">Добавить отработку вручную</Link>
          </div>
          {row.grades.length > 0 && (
            <p className="text-xs text-slate-500">
              Оценки: {row.grades.join(", ")}. Импорт в отработки не автоматический — сверьте с журналом и внесите вручную.
            </p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-[var(--border)] p-3 text-xs leading-relaxed text-slate-500">
        <b className="text-slate-700">Что остаётся на устройстве.</b> Снимок и распознанный текст не загружаются на сервер;
        OCR-движок скачивается один раз и работает локально. На сервер можно отправить только отметку «материал открыт» из плана темы.
      </section>
    </main>
  );
}
