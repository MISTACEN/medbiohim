"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLecture, type Lecture } from "@/lib/api";
import { LectureView } from "@/components/lectures/LectureView";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";

export default function LectureViewPage() {
  const params = useParams();
  const id = String(params?.id || "");

  const { data: lec, error, loading } = useApiRequest<Lecture | null>(async () => {
    const r = await getLecture(id);
    if (!r.ok) throw new Error(describeApiError(r.error) || "Не найдено");
    // API отдаёт лекцию плоско (поля в data), но старые сборки — в data.lecture.
    return r.data?.lecture || r.data || null;
  }, [id], { enabled: Boolean(id) });

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
      <LectureView lecture={lec} lectureId={id} backHref="/lectures" backLabel="Все модули" />
    </div>
  );
}
