"use client";

import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getSubject } from "@/lib/api";
import { resolveSubjectSlug } from "@/lib/subjectSlug";
import TestsHub from "@/components/tests/TestsHub";
import { useApiRequest } from "@/hooks/useApiRequest";

type SubjectInfo = {
  id: string;
  name: string;
  slug: string;
  course: number | null;
  semester: number | null;
};

export default function SubjectTestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: info, loading } = useApiRequest<SubjectInfo>(async () => {
    const route = await params;
    const result = await getSubject(route.id);
    const payload: any = result.ok ? result.data : null;
    const selected = payload?.subject || payload?.item || (payload?.id ? payload : null) || {};
    const name = String(selected?.name || "");
    const slug = resolveSubjectSlug(selected?.slug || "", name) || resolveSubjectSlug(route.id, name);
    return {
      id: String(selected?.id || route.id),
      name: name || "Тесты",
      slug,
      course: selected?.course_number ?? null,
      semester: selected?.semester ?? null,
    };
  }, [params]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="card flex items-center gap-3 p-8 text-sm text-[var(--muted)]">
          <Loader2 className="h-5 w-5 animate-spin" /> Загружаю тесты предмета…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href={"/subjects/" + encodeURIComponent(info?.id || "")}
        className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> К предмету
      </Link>

      <TestsHub
        subjectId={info?.id}
        subjectSlug={info?.slug}
        subjectName={info?.name}
        course={info?.course}
        semester={info?.semester}
      />
    </div>
  );
}
