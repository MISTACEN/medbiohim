"use client";

/**
 * Устный экзамен (roadmap 2.8): страница-тренажёр ответа вслух.
 *
 * Вопросы берутся из того же потока подготовки, что и обычная страница:
 * startPreparation → getPreparation. Ответы на сервер НЕ отправляются —
 * устный ответ оценивает ИИ-экзаменатор, а сохранение текстового ответа в
 * банк прохождения сломало бы статистику теста.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getPreparation, startPreparation } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { OralExamTrainer, type OralQuestion } from "@/components/tests/OralExamTrainer";

const DEFAULT_ORAL_COUNT = 10;
const MAX_ORAL_COUNT = 40;

/** Эталон устного ответа: текстовый ответ банка или верные варианты MCQ. */
function etalonText(q: any): string {
  const answerDisplay = String(q?.answer_display || "").trim();
  if (answerDisplay) return answerDisplay;
  const answer = String(q?.answer || "").trim();
  const options: any[] = Array.isArray(q?.options) ? q.options : [];
  // MCQ: answer — это ключ(и) вариантов; в эталон превращаем подписи вариантов.
  if (options.length && answer) {
    const keys = answer.split(/[;,\s]+/).filter(Boolean).map((k) => k.toLowerCase());
    const labels = options
      .map((option, i) => ({ key: String(option?.key ?? option?.letter ?? option?.id ?? i).toLowerCase(), label: String(option?.text ?? option?.label ?? option ?? "") }))
      .filter((option) => keys.includes(option.key))
      .map((option) => option.label)
      .filter(Boolean);
    if (labels.length) return labels.join("; ");
  }
  return answer;
}

export default function OralExamPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [questions, setQuestions] = useState<OralQuestion[]>([]);
  const [subjectTitle, setSubjectTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const returnHref = useMemo(() => {
    const raw = search.get("return") || "";
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : `/tests/preparation/${encodeURIComponent(id)}`;
  }, [search, id]);

  useEffect(() => {
    if (authLoading || !id || !user) return;
    let cancelled = false;
    void (async () => {
      const count = Math.min(MAX_ORAL_COUNT, Math.max(1, Number(search.get("count")) || DEFAULT_ORAL_COUNT));
      const started = await startPreparation(id, "count", count, user.groupId, "prepare");
      if (cancelled) return;
      if (!started.ok) {
        setError(describeApiError(started.error));
        setLoading(false);
        return;
      }
      const loaded = await getPreparation(started.data.session.id);
      if (cancelled) return;
      if (!loaded.ok) {
        setError(describeApiError(loaded.error));
        setLoading(false);
        return;
      }
      setSubjectTitle(String(loaded.data.session?.subject_name || loaded.data.session?.subject || "") || null);
      const raw: any[] = Array.isArray(loaded.data.questions) ? loaded.data.questions : [];
      // Устно отвечать имеет смысл на вопросы с эталоном: без него ИИ оценивает
      // «в воздух», и балл ничего не значит. Вопросы без эталона отбрасываем.
      const oral = raw
        .map((q) => ({ text: String(q?.text || "").trim(), etalon: etalonText(q) }))
        .filter((q) => q.text && q.etalon)
        .map((q) => ({ text: q.text, answer: q.etalon }));
      setQuestions(oral);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authLoading, user, id, search]);

  if (loading || authLoading) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-6">
        <p className="inline-flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Готовим вопросы…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Link href={returnHref} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
        <ArrowLeft className="h-4 w-4" /> К выбору режима
      </Link>
      <header>
        <h1 className="text-xl font-extrabold">Устный экзамен</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Отвечайте вслух, как у кафедры: микрофон расшифрует ответ, ИИ-экзаменатор сравнит его с эталоном банка и поставит балл с уточняющим вопросом.
        </p>
      </header>
      {error ? (
        <div className="card p-5 text-sm text-[var(--status-critical-fg)]">{error}</div>
      ) : questions.length === 0 ? (
        <div className="card p-5 text-sm text-[var(--muted)]">
          В этой подборке нет вопросов с эталонным ответом — устный разбор пока недоступен. Используйте обычные режимы прохождения.
        </div>
      ) : (
        <OralExamTrainer questions={questions} subjectTitle={subjectTitle} />
      )}
    </main>
  );
}
