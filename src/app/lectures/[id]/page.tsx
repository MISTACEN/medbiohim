"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { ArrowLeft } from "lucide-react";
import { getLecture, type Lecture } from "@/lib/api";
import { LectureView } from "@/components/lectures/LectureView";
import LectureAiActions from "@/components/lectures/LectureAiActions";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";
import { fetchStaticPlan, SUBJECT_STATIC_PLANS } from "@/lib/subject-plan-static";
import { normalizeStaticPlan } from "@/lib/subject-plan-next";

export default function LectureViewPage() {
  const params = useParams();
  const id = String(params?.id || "");

  const { data: lec, error, loading } = useApiRequest<Lecture | null>(async () => {
    const r = await getLecture(id);
    if (!r.ok) throw new Error(describeApiError(r.error) || "Не найдено");
    // API отдаёт лекцию плоско (поля в data), но старые сборки — в data.lecture.
    return r.data?.lecture || r.data || null;
  }, [id], { enabled: Boolean(id) });

  // Номер занятия ищем в кафедральном плане по lecture_id: API лекции не отдаёт
  // поле topic, поэтому без этого ссылка «Лекция + тест по теме» не рисуется.
  const subjectSlug = String((lec as { subject_slug?: string } | null)?.subject_slug || "");
  const { data: lessonNumber } = useApiRequest<number | null>(async (signal) => {
    const file = SUBJECT_STATIC_PLANS[subjectSlug];
    if (!file || !id) return null;
    const raw = await fetchStaticPlan(file, signal);
    const session = normalizeStaticPlan(raw).sessions.find(
      (entry) => String(entry.lecture?.lectureId || "") === id
    );
    return session?.lecture?.num ?? session?.num ?? null;
  }, [subjectSlug, id], { enabled: Boolean(subjectSlug && id) });

  if (loading) return <div className="card p-6 text-sm text-[var(--muted)]">Загрузка лекции…</div>;
  if (error || !lec) {
    return (
      <div className="space-y-4">
        <Link href="/lectures" className="inline-flex items-center gap-2 text-sm text-[var(--primary)]">
          <ArrowLeft className="h-4 w-4" /> К списку
        </Link>
        <div className="card p-6 text-sm text-[var(--status-critical-fg)]">{error || "Лекция не найдена"}</div>
      </div>
    );
  }

  // То же оформление, что при чтении лекции прямо в предмете.
  return (
    <div className="mx-auto max-w-6xl">
      {/* Фаза 4: конспект с пропусками по этой лекции. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
        <span className="text-xs text-[var(--muted)]">Проверить знание терминов по тексту лекции</span>
        <Link
          href={`/lectures/${encodeURIComponent(id)}/learn`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)]"
        >
          Конспект с пропусками →
        </Link>
      </div>
      <LectureView
        lecture={lec}
        lectureId={id}
        lessonNumber={lessonNumber}
        backHref="/lectures"
        backLabel="Все модули"
      />

      <LectureAiActions
        title={String(lec?.title || "")}
        subjectSlug={lec?.subject_slug ?? null}
        excerpt={String(lec?.body_markdown || "")}
      />
    </div>
  );
}
