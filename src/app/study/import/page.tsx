"use client";

/**
 * Конспект из файла (roadmap 2.5 MVP): фото лекции/слайда, PDF или текстовый
 * файл → ИИ собирает структурный конспект → правки → сохранение как личная
 * лекция. Дальше её можно открыть как обычную лекцию и собрать по ней
 * конспект с пропусками и пак карточек.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, Loader2, Save, Upload, Wand2 } from "lucide-react";
import { aiNotesFromFile } from "@/lib/features-api";
import { listSubjectsCatalog } from "@/lib/api";
import { createMyLecture } from "@/lib/api/myLectures";
import { describeApiError } from "@/lib/errors";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.txt,.md";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^,]+,/, ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

export default function ImportNotesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [subjects, setSubjects] = useState<Array<{ name: string; slug: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await listSubjectsCatalog();
      if (r.ok) {
        const items = (r.data?.items || []) as any[];
        setSubjects(items.map((s) => ({ name: String(s.name || ""), slug: String(s.slug || "") })).filter((s) => s.slug));
      }
    })();
  }, []);

  const inferredTitle = useMemo(() => {
    if (title) return title;
    if (file) return file.name.replace(/\.[^.]+$/, "").slice(0, 120);
    return "";
  }, [title, file]);

  async function pickFile(next: File | null) {
    setSavedId(null);
    setNotes("");
    setError(null);
    if (!next) { setFile(null); return; }
    if (next.size > MAX_FILE_BYTES) {
      setError("Файл больше 8 МБ — уменьшите фото или разберите PDF по частям.");
      return;
    }
    setFile(next);
  }

  async function generate() {
    if (!file || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const contentBase64 = await fileToBase64(file);
      const response = await aiNotesFromFile({
        content_base64: contentBase64,
        mime: file.type || "application/octet-stream",
        filename: file.name,
      });
      if (!response.ok) {
        setError(describeApiError(response.error));
        return;
      }
      setNotes(response.data.notes_markdown);
    } catch {
      setError("Не удалось прочитать файл — попробуйте другой формат.");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    const slug = subjectSlug || (subjects[0]?.slug || "");
    if (!inferredTitle.trim() || !slug || !notes.trim() || saving) return;
    setSaving(true);
    setError(null);
    const response = await createMyLecture({
      title: inferredTitle.trim().slice(0, 200),
      subject_slug: slug,
      body_md: notes,
      lesson_type: "lecture",
    });
    setSaving(false);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    const lectureId = String(response.data?.lecture?.id || "");
    if (lectureId) setSavedId(lectureId);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Link href="/study" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
        <ArrowLeft className="h-4 w-4" /> К учёбе
      </Link>
      <header>
        <h1 className="inline-flex items-center gap-2 text-xl font-extrabold">
          <FileText className="h-5 w-5 text-[var(--primary)]" /> Конспект из файла
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Фото страницы конспекта или слайда, PDF с текстовым слоем, txt/md — ИИ соберёт структурный конспект, который можно сохранить как личную лекцию.
        </p>
      </header>

      {savedId ? (
        <section className="card space-y-3 p-5">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-[var(--status-ok-fg)]">
            <CheckCircle2 className="h-5 w-5" /> Конспект сохранён как личная лекция
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/lectures/${encodeURIComponent(savedId)}`} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white">
              Открыть лекцию
            </Link>
            <Link href="/teacher" className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold">
              Все мои лекции
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="card space-y-3 p-5">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center transition hover:border-[var(--primary)]/50">
              <Upload className="h-6 w-6 text-[var(--primary)]" />
              <span className="text-sm font-semibold">{file ? file.name : "Выберите файл: фото, PDF, txt/md"}</span>
              <span className="text-xs text-[var(--muted)]">до 8 МБ · JPG/PNG/WebP, PDF с текстовым слоем</span>
              <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => void pickFile(e.target.files?.[0] || null)} />
            </label>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={!file || generating}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {generating ? "ИИ читает файл…" : "Собрать конспект"}
            </button>
          </section>

          {notes ? (
            <section className="card space-y-3 p-5">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">Название лекции</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={file?.name.replace(/\.[^.]+$/, "") || ""} className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">Предмет</span>
                  <select value={subjectSlug} onChange={(e) => setSubjectSlug(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                    <option value="">{subjects[0]?.name || "— выберите —"}</option>
                    {subjects.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Конспект (можно править — исправьте [неразборчиво] и оговорки распознавания)</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={16} className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono leading-relaxed" />
              </label>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !notes.trim() || !inferredTitle.trim() || !(subjectSlug || subjects[0]?.slug)}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Сохраняю…" : "Сохранить как личную лекцию"}
              </button>
            </section>
          ) : null}

          {error ? <p className="text-sm text-[var(--status-critical-fg)]">{error}</p> : null}
        </>
      )}
    </main>
  );
}
