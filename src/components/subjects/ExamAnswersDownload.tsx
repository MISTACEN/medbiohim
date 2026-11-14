"use client";

/**
 * Кнопка «Скачать ответы .docx» (фаза 2.7 карты).
 *
 * Сервер отдаёт банк вопросов с ответами как JSON, документ собирается здесь же
 * из уже загруженных данных: без storage, без ИИ и без дневных квот.
 */
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { exportExamAnswers } from "@/lib/api";
import { buildExamAnswersDocx, examAnswersFileName } from "@/lib/study/docx";
import { describeApiError } from "@/lib/errors";

export default function ExamAnswersDownload({
  subjectSlug,
  subjectTitle,
}: {
  subjectSlug: string;
  subjectTitle?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const response = await exportExamAnswers(subjectSlug);
      if (!response.ok) {
        setError(describeApiError(response.error));
        return;
      }
      const data = response.data || {};
      const groups = Array.isArray(data.groups) ? data.groups : [];
      if (!groups.length) {
        setError("Для этого предмета вопросы к экзамену ещё не загружены.");
        return;
      }
      const blob = await buildExamAnswersDocx({
        subject: subjectSlug,
        subjectTitle: subjectTitle || null,
        generatedAt: String(data.generated_at || new Date().toISOString()),
        groups,
        truncated: Boolean(data.truncated),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = examAnswersFileName(subjectSlug);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Safari освобождает URL асинхронно после старта скачивания.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Не удалось собрать документ — попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-secondary inline-flex items-center gap-2 text-sm"
        onClick={() => void download()}
        disabled={busy}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? "Собираю документ…" : "Скачать ответы .docx"}
      </button>
      {error && (
        <p className="max-w-xs text-right text-xs" style={{ color: "var(--status-warn-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
