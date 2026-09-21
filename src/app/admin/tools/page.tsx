"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Legacy URL /admin/tools — CMS объединена в /admin (Центр управления).
 * Редирект + короткие ссылки на спец. редакторы.
 */
export default function AdminToolsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin");
  }, [router]);

  return (
    <main className="mx-auto max-w-lg space-y-4 p-8 text-center">
      <p className="text-sm text-slate-500">CMS объединена. Переход в Центр управления…</p>
      <Link href="/admin" className="btn-primary inline-flex">
        Открыть CMS
      </Link>
      <div className="flex flex-wrap justify-center gap-3 text-sm">
        <Link href="/admin/schedule" className="text-indigo-600 underline">
          Сетка расписания
        </Link>
        <Link href="/admin/questions" className="text-indigo-600 underline">
          Вопросы / билеты
        </Link>
        <Link href="/admin/lectures" className="text-indigo-600 underline">
          AI-лекции
        </Link>
      </div>
    </main>
  );
}
