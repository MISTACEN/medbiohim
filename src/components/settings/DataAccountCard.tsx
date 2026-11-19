"use client";

import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";

/** Данные и аккаунт: выгрузка JSON и отложенное удаление. */
export function DataAccountCard() {
  return (
    <section className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Database className="h-5 w-5" /> Данные и аккаунт</h2>
      <p className="text-sm text-[var(--muted)]">
        Выгрузка своих данных одним JSON-файлом и удаление аккаунта с недельным сроком, в течение которого запрос можно отменить.
      </p>
      <Link href="/settings/data" className="inline-flex w-fit items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:border-[var(--primary)]">
        Открыть «Данные и аккаунт» <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
