"use client";

import Link from "next/link";
import { ClipboardList, CopyPlus, Info, Shuffle } from "lucide-react";

import { hasToken } from "@/lib/api";
import { AdminTestsFilters } from "@/components/admin/tests-hub/AdminTestsFilters";
import { AdminTestsTable } from "@/components/admin/tests-hub/AdminTestsTable";
import { AdminTestEditModal } from "@/components/admin/tests-hub/AdminTestEditModal";
import { AdminTestBuilder } from "@/components/admin/tests-hub/AdminTestBuilder";
import { useAdminTests } from "@/components/admin/tests-hub/useAdminTests";

export default function AdminTestsPage() {
  const page = useAdminTests();

  if (!hasToken())
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Тесты</h1>
        <Link href="/login" className="btn-primary mt-4 inline-flex">
          Войти
        </Link>
      </div>
    );

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-indigo-600">← Админ</Link>
          <Link href="/admin/test-questions" className="ml-4 text-sm text-indigo-600">
            Вопросы тестов →
          </Link>
          <h1 className="mt-1 page-title">Тесты → предметы → темы</h1>
          <p className="page-subtitle">
            Перенос, исправление, публикация и сбор одного или нескольких тестов из существующего банка вопросов.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={page.openBuilder}>
            <CopyPlus className="h-4 w-4" /> Собрать тест
          </button>
          <Link href="/admin/content-import" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
            Импорт Excel
          </Link>
        </div>
      </header>

      <section className="card grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl bg-indigo-50 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-indigo-900">
            <ClipboardList className="h-4 w-4" /> Что такое тест
          </div>
          <p className="mt-2 text-xs leading-5 text-indigo-900">
            Тест — это контейнер: название + предмет/тема + настройки + список вопросов. Сам вопрос хранится отдельно в общем банке и может входить в несколько разных тестов.
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--status-ok-bg)] p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--status-ok-fg)]">
            <Info className="h-4 w-4" /> Как отличить хороший тест
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--status-ok-fg)]">
            У него однозначное название, правильный предмет и тема, реальное количество вопросов, нет случайных вопросов другого раздела и опубликован только после проверки состава.
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--status-warn-bg)] p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--status-warn-fg)]">
            <Shuffle className="h-4 w-4" /> Сбор нескольких
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--status-warn-fg)]">
            Выбираешь общий пул вопросов, указываешь число вариантов и размер каждого. Каждый вариант получает свой набор вопросов и имя «… — Вариант 1», «… — Вариант 2» и т.д.
          </p>
        </div>
      </section>

      <AdminTestsFilters page={page} />

      {page.message && <div className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-700">{page.message}</div>}

      <AdminTestsTable page={page} />

      {page.editing && (
        <AdminTestEditModal page={page} editing={page.editing} onClose={() => page.setEditing(null)} />
      )}

      {page.builderOpen && <AdminTestBuilder page={page} />}
      {page.dialog}
    </main>
  );
}
