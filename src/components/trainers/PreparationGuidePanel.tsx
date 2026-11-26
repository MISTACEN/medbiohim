"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, Loader2, RotateCcw, X } from "lucide-react";
import { getPreparationGuide, type PreparationGuideDetail } from "@/lib/content-api";
import { describeApiError } from "@/lib/errors";
import { srsAddTrainerCard } from "@/lib/features-api";

/**
 * Методическая карточка препарата: как искать структуры, что считать
 * диагностическим признаком и что обычно путают. Источник — гид из
 * /preparations/guides/<key>, а не текст, пересказанный ИИ.
 */
export function PreparationGuidePanel({
  guideKey,
  title,
  onClose,
}: {
  guideKey: string;
  title: string;
  onClose: () => void;
}) {
  const [guide, setGuide] = useState<PreparationGuideDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // Панель — единственная точка, откуда препарат уходит в повторение: ею
  // пользуются атлас, разбор и тренировка по карточкам.
  const [repeat, setRepeat] = useState<"idle" | "busy" | "saved" | "exists">("idle");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setRepeat("idle");
    getPreparationGuide(guideKey)
      .then((result) => {
        if (!alive) return;
        if (result.ok) setGuide(result.data.item);
        else setError(describeApiError(result.error) || "Методическая карточка недоступна.");
      })
      .catch(() => {
        if (alive) setError("Методическая карточка недоступна.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [guideKey]);

  /** Идемпотентно: сервер не создаёт дубль по тому же ключу гида. */
  async function addToRepeat() {
    if (!guideKey || repeat === "busy" || repeat === "saved" || repeat === "exists") return;
    setRepeat("busy");
    const res = await srsAddTrainerCard(guideKey);
    if (!res.ok) {
      setRepeat("idle");
      setError(describeApiError(res.error));
      return;
    }
    setRepeat(res.data.added > 0 ? "saved" : "exists");
  }

  return (
    <div
      className="fixed inset-0 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-6"
      style={{ zIndex: 2147483100 }}
      role="dialog"
      aria-modal="true"
      aria-label={"Методика поиска: " + title}
    >
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <BookOpenCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">{title}</h2>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Методика поиска</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть методичку"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Загружаем методичку…
          </p>
        ) : error ? (
          <p className="mt-4 rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-3 py-2 text-sm text-[var(--status-critical-fg)]">
            {error}
          </p>
        ) : guide ? (
          <div className="mt-4 space-y-4 text-sm text-slate-700">
            <div className="flex flex-wrap gap-2 text-xs">
              {[guide.section, guide.organ, guide.tissue, guide.stain].filter(Boolean).map((value) => (
                <span key={String(value)} className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                  {value}
                </span>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Малое увеличение</h3>
                <p className="mt-1 leading-6">{guide.low_magnification || "—"}</p>
              </section>
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Большое увеличение</h3>
                <p className="mt-1 leading-6">{guide.high_magnification || "—"}</p>
              </section>
            </div>

            {Array.isArray(guide.steps) && guide.steps.length ? (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Как искать структуры</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 leading-6">
                  {guide.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </section>
            ) : null}

            {Array.isArray(guide.features) && guide.features.length ? (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Диагностические признаки</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
                  {guide.features.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {Array.isArray(guide.inclusions) && guide.inclusions.length ? (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Включения и структуры</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
                  {guide.inclusions.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {Array.isArray(guide.differential) && guide.differential.length ? (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Дифференциальная диагностика</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
                  {guide.differential.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {Array.isArray(guide.mistakes) && guide.mistakes.length ? (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Частые ошибки</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
                  {guide.mistakes.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void addToRepeat()}
                disabled={repeat !== "idle"}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                <RotateCcw className="h-4 w-4" />
                {repeat === "busy"
                  ? "Добавляю…"
                  : repeat === "saved"
                    ? "В повторении"
                    : repeat === "exists"
                      ? "Уже в колоде"
                      : "В повторение"}
              </button>
              <span className="text-xs text-slate-500">
                Карточка повторения строится по признакам этого препарата.
              </span>
            </div>

            <p className="rounded-xl bg-[var(--status-warn-bg)] px-3 py-2 text-xs leading-5 text-[var(--status-warn-fg)]">
              Не все включения видны при обычной окраске: гид описывает то, что действительно
              определяется на этом препарате при указанном методе.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
