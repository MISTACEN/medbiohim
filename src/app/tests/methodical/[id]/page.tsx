import Link from "next/link";
import LegacyMCTests from "@/components/portals/LegacyMCTests";

export default async function MethodicalTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6">
      <Link href="/tests?view=chemistry" className="inline-flex min-h-10 items-center text-sm font-semibold text-indigo-700 hover:text-indigo-900">
        ← Ко всем тестам по химии
      </Link>
      <header className="card p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Полный тест из методички · 80 вопросов</p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-950">Спирты. Фенолы. Простые эфиры</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Отдельный полный вариант по ключам источника. Он не заменяет тематическую тренировку по плану занятий.</p>
      </header>
      <LegacyMCTests initialTestId={id} />
    </main>
  );
}
