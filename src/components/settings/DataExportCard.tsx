"use client";

/** Карточка «Скачать мои данные»: состав выгрузки и кнопка скачивания. */
import { CheckCircle2, Download, Loader2 } from "lucide-react";
import { EXPORT_SECTIONS } from "@/components/settings/model";
import type { DataAccountState } from "@/components/settings/useDataAccount";

export function DataExportCard({ page }: { page: DataAccountState }) {
  const { busy, onDownload } = page;

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg,var(--primary),var(--accent))" }}
        >
          <Download className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Скачать мои данные</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Один JSON-файл: профиль, прогресс, карточки повторения, попытки тестов, заметки,
            избранное, сданные работы и остальные личные записи. Выгрузка только читает данные —
            ничего не удаляет и не меняет.
          </p>
        </div>
      </div>

      <ul className="grid gap-x-6 gap-y-1 text-sm text-[var(--muted)] sm:grid-cols-2">
        {EXPORT_SECTIONS.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--primary)" }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-[var(--border)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
        Чего в файле нет и почему: разделы ограничены по числу строк (признак «обрезано» виден в самом
        файле), анонимная статистика переходов на внешние платформы не привязана к пользователю, а
        тренировки по гистологии выдаются только серверными функциями без табличного контракта. Файл
        собирается из нескольких параллельных запросов, поэтому снимок может отличаться на несколько секунд.
      </div>

      <button
        type="button"
        onClick={() => void onDownload()}
        disabled={busy !== null}
        className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
      >
        {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy === "download" ? "Собираем файл…" : "Скачать мои данные"}
      </button>
    </section>
  );
}
