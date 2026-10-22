"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import AttestationList from "@/components/attestations/AttestationList";

export default function AttestationsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="relative overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)] sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-violet-100 via-indigo-50 to-transparent" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
              <ClipboardList className="h-4 w-4" /> Аттестации
            </div>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-[2.4rem]">Аттестации и коллоквиумы</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Все открытые коллоквиумы, экзамены, зачёты и контрольные: программа по этапам, тесты с проверкой, задачи с эталонными решениями и личный прогресс.
            </p>
          </div>
          <Link
            href="/subjects"
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-300"
          >
            К предметам
          </Link>
        </div>
      </header>

      <AttestationList emptyHint="Преподаватели ещё не открыли ни одной аттестации." />
    </div>
  );
}
