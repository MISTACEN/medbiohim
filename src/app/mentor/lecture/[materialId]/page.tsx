"use client";

/**
 * Материал MEDBIOHIM во встроенном режиме PdfMentor.
 *
 * Страница не открывает второй просмотрщик: чтение документа остаётся в
 * существующей читалке `/reader?material=…`, а PdfMentor получает вход по SSO.
 * Передача самого файла в PdfMentor ждёт подключения Document Bridge на стороне
 * PdfMentor, поэтому кнопка «Открыть документ в PdfMentor» появляется только
 * когда мост реально доступен — иначе страница честно объясняет, где читать.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BookOpen, ExternalLink, FileText, Loader2 } from "lucide-react";
import { getMaterial, markMaterialOpened } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import {
  fetchMentorConfig,
  requestMentorSso,
  submitCodeToMentor,
  type MentorConfig,
} from "@/lib/mentor-sso";

type Material = {
  id: string;
  title?: string | null;
  type?: string | null;
  subject_name?: string | null;
  module_title?: string | null;
  topic_title?: string | null;
  external_url?: string | null;
};

export default function MentorLecturePage() {
  const params = useParams<{ materialId: string }>();
  const materialId = String(params?.materialId ?? "");
  const [material, setMaterial] = useState<Material | null>(null);
  const [config, setConfig] = useState<MentorConfig | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!materialId) return;
    let alive = true;
    void getMaterial(materialId).then((res) => {
      if (!alive) return;
      if (res.ok) setMaterial((res.data as { item?: Material })?.item ?? null);
      else setError(describeApiError(res.error));
    });
    void fetchMentorConfig().then((value) => {
      if (alive) setConfig(value);
    });
    void markMaterialOpened(materialId).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [materialId]);

  async function openMentor() {
    setBusy(true);
    setError("");
    const result = await requestMentorSso("login");
    if (result.ok) submitCodeToMentor(result.payload);
    else setError(result.message);
    setBusy(false);
  }

  const readerHref = `/reader?material=${encodeURIComponent(materialId)}`;

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <Link
        href="/mentor"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-indigo-700"
      >
        <ArrowLeft className="h-4 w-4" /> PdfMentor
      </Link>

      <header className="space-y-2">
        <h1 className="page-title flex items-center gap-2">
          <BookOpen className="h-6 w-6" /> Лекция во встроенном режиме
        </h1>
        <p className="page-subtitle">
          Документ открывается в читалке MEDBIOHIM; PdfMentor получает тот же аккаунт по SSO.
        </p>
      </header>

      {error ? (
        <p className="rounded-xl bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">
          {error}
        </p>
      ) : null}

      <section className="card space-y-3 p-4">
        {material ? (
          <>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <FileText className="h-5 w-5 text-slate-400" />
              {material.title || "Материал"}
            </h2>
            <p className="text-sm text-slate-500">
              {[material.subject_name, material.module_title, material.topic_title]
                .filter(Boolean)
                .join(" · ") || "Материал курса"}
            </p>
          </>
        ) : (
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" aria-busy="true" />
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href={readerHref}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <BookOpen className="h-4 w-4" /> Открыть в читалке
          </Link>
          {material?.external_url ? (
            <a
              href={material.external_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-200"
            >
              Источник <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-base font-bold text-slate-900">PdfMentor</h2>
        <p className="text-sm text-slate-600">
          Вход в PdfMentor — по одноразовому коду MEDBIOHIM, повторная регистрация не нужна.
        </p>

        {config === null ? (
          <div className="h-10 w-52 animate-pulse rounded-xl bg-slate-100" aria-busy="true" />
        ) : config.enabled ? (
          <button
            type="button"
            onClick={() => void openMentor()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Открыть PdfMentor
          </button>
        ) : (
          <p className="text-sm text-slate-500">
            PdfMentor не подключён к этому окружению: не задан адрес движка.
          </p>
        )}

        <p className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs leading-relaxed text-slate-600">
          Передача самого документа в PdfMentor пока не включена: сторона MEDBIOHIM для Document
          Bridge готова (проверка прав, поток файла, аудит), но PdfMentor ещё не умеет открывать
          внешние документы. Поэтому чтение остаётся в читалке MEDBIOHIM, а PdfMentor открывается
          как отдельная среда.
        </p>
      </section>
    </main>
  );
}
