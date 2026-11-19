"use client";

/** Экран главной для незалогиненного посетителя. */
import Link from "next/link";
import { BookOpen } from "lucide-react";

export function HomeSignedOut() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md">
        <BookOpen className="h-7 w-7" />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Медбиохим</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Войдите, чтобы видеть расписание, задания и прогресс
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/login"
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          Войти
        </Link>
        <Link
          href="/register"
          className="rounded-xl border border-indigo-200 bg-white px-5 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-slate-800 dark:text-indigo-400 dark:hover:bg-slate-700"
        >
          Регистрация
        </Link>
      </div>
    </div>
  );
}
