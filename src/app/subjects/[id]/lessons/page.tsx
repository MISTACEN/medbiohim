"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PhysiologyPractice from "@/components/physiology/PhysiologyPractice";
import { resolveSubjectSlug } from "@/lib/subjectSlug";

export default function SubjectLessonsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const subjectId = decodeURIComponent(id);
  const slug = resolveSubjectSlug(subjectId);

  if (slug !== "physiology") {
    return (
      <div className="card space-y-3 p-6">
        <h1 className="text-lg font-bold">Практикум по занятиям</h1>
        <p className="text-sm text-slate-600">
          Разбор по занятиям сейчас собран для физиологии. Для остальных предметов материалы доступны во вкладке «Материалы».
        </p>
        <Link href={`/subjects/${encodeURIComponent(subjectId)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> К предмету
        </Link>
      </div>
    );
  }

  return (
    <PhysiologyPractice
      backHref={`/subjects/${encodeURIComponent(subjectId)}`}
      backLabel="К предмету физиология"
    />
  );
}
