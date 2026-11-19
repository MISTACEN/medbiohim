"use client";

import Link from "next/link";

import { hasToken } from "@/lib/api";
import { AcademicGroupPanel } from "@/components/admin/tests-hub/AcademicGroupPanel";
import { AcademicSubjectPanel } from "@/components/admin/tests-hub/AcademicSubjectPanel";
import { useAcademicAdmin } from "@/components/admin/tests-hub/useAcademicAdmin";

export default function AdminAcademicPage() {
  const page = useAcademicAdmin();

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Предметы и группы</h1>
        <p className="page-subtitle">Сначала войдите</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">Предметы и группы</h1>
        <p className="page-subtitle">
          Дисциплины, курс и семестр; учебные группы и их состав. Курс и семестр конкретного студента —{" "}
          <Link href="/admin/users" className="text-indigo-600 underline">в разделе «Пользователи»</Link>.
        </p>
      </header>
      {page.error && <div className="rounded-xl bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">{page.error}</div>}
      {page.ok && <div className="rounded-xl bg-[var(--status-ok-bg)] px-4 py-3 text-sm text-[var(--status-ok-fg)]">{page.ok}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <AcademicSubjectPanel page={page} />
        <AcademicGroupPanel page={page} />
      </div>
      {page.dialog}
    </div>
  );
}
