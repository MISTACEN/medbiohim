"use client";

import Link from "next/link";

import { hasToken } from "@/lib/api";
import { TestQuestionsTable } from "@/components/admin/tests-hub/TestQuestionsTable";
import { TestQuestionModal } from "@/components/admin/tests-hub/TestQuestionModal";
import { useTestQuestions } from "@/components/admin/tests-hub/useTestQuestions";

export default function TestQuestionsPage() {
  const page = useTestQuestions();

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Вопросы тестов</h1>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header>
        <Link href="/admin/tests" className="text-sm text-indigo-600">← Тесты</Link>
        <h1 className="mt-1 page-title">Вопросы тестов</h1>
        <p className="page-subtitle">Полное редактирование вопросов: текст, варианты ответов, правильный ответ, тип и объяснение.</p>
      </header>

      {page.note && <div className="rounded-xl bg-[var(--status-ok-bg)] p-3 text-sm text-[var(--status-ok-fg)]">{page.note}</div>}

      <TestQuestionsTable page={page} />

      {page.dialog}

      {page.draft && <TestQuestionModal page={page} draft={page.draft} />}
    </main>
  );
}
