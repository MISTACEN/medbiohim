"use client";

/**
 * PdfMentor Bridge — бесшовный переход в PdfMentor из MEDBIOHIM.
 *
 * Код одноразовый и передаётся POST-формой (OAuth form_post), а не в query:
 * так он не попадает в логи прокси, Referer и историю браузера. Адрес
 * PdfMentor приходит из env через API, поэтому в коде нет localhost.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, BookText, ExternalLink, FlaskConical, LogIn, Microscope } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  fetchMentorConfig,
  requestMentorSso,
  submitCodeToMentor,
  type MentorConfig,
} from "@/lib/mentor-sso";

export default function MentorPage() {
  const { user } = useAuth();
  const [busy, setBusy] = useState<"login" | "link" | null>(null);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<MentorConfig | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetchMentorConfig().then((value) => {
      if (!cancelled) setConfig(value);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function openMentor(intent: "login" | "link") {
    setBusy(intent);
    setError("");
    const result = await requestMentorSso(intent);
    if (result.ok) submitCodeToMentor(result.payload);
    else setError(result.message);
    setBusy(null);
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="page-title flex items-center gap-2">
          <BookOpen className="h-6 w-6" /> PdfMentor
        </h1>
        <p className="page-subtitle">
          Интеллектуальная среда чтения и изучения учебных материалов.
          Загрузи документ — получи разметку, маршрут и ИИ-тьютора.
        </p>
      </header>

      {user && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => void openMentor("login")}
            disabled={busy !== null || config?.enabled === false}
            className="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 disabled:opacity-50"
          >
            {busy === "login" ? "Открываем PdfMentor…" : "Открыть PdfMentor"}
            <ExternalLink className="h-5 w-5" />
          </button>
          <button
            onClick={() => void openMentor("link")}
            disabled={busy !== null || config?.enabled === false}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-6 py-3 text-sm font-semibold disabled:opacity-50"
          >
            {busy === "link" ? "Привязываем аккаунт…" : "Привязать мой аккаунт PdfMentor"}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</p>
      )}

      {config && !config.enabled && (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted)]">
          PdfMentor ещё не подключён к этому окружению: не задан адрес движка.
        </p>
      )}

      {!user && (
        <p className="flex items-center justify-center gap-2 text-center text-sm text-slate-500">
          <LogIn className="h-4 w-4" />
          Войдите в MEDBIOHIM для бесшовного доступа к PdfMentor.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><Microscope className="h-5 w-5" /> Диагностикум</h2>
          <p className="text-sm text-slate-600">
            Первый диагностикум — 18 препаратов гистологии с методическими карточками.
          </p>
          <Link href="/subjects/histology#portal" className="inline-flex items-center gap-1 text-sm text-indigo-700">
            Перейти к препаратам <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><BookText className="h-5 w-5" /> PdfMentor Project</h2>
          <p className="text-sm text-slate-600">
            Самостоятельное приложение: своя регистрация и полный функционал.
          </p>
          {config?.mentor_url ? (
            <a href={config.mentor_url} className="inline-flex items-center gap-1 text-sm text-indigo-700">
              Открыть PdfMentor <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <span className="text-sm text-slate-500">Адрес появится после подключения движка.</span>
          )}
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><FlaskConical className="h-5 w-5" /> Химический движок</h2>
          <p className="text-sm text-slate-600">
            Распознавание формул, структур, схем через PdfMentor.
          </p>
          <Link href="/chemistry" className="inline-flex items-center gap-1 text-sm text-indigo-700">
            Химия <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>

      <section className="rounded-xl border border-[var(--border)] p-4 text-sm leading-relaxed text-slate-600">
        <b className="text-slate-700">Как это работает.</b>{" "}
        MEDBIOHIM — учебная платформа с предметами, тестами и прогрессом.
        PdfMentor — документный движок: чтение, разметка, ИИ-тьютор.
        Повторная регистрация не нужна: MEDBIOHIM выдаёт одноразовый код, PdfMentor
        обменивает его на свою сессию у себя на сервере.
      </section>
    </main>
  );
}
