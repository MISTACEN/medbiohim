"use client";

/**
 * «Химия: задача дня» — одна случайная задача с готовым ответом прямо на
 * главной. Сервер отдаёт только задания с ответом, поэтому кнопка «Ответ»
 * никогда не упирается в пустоту. «Ещё задача» просит следующую и не повторяет
 * уже показанные (exclude).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FlaskConical, Loader2, RefreshCw } from "lucide-react";
import { getRandomChemistryTask, type ChemistryRandomItem } from "@/lib/api/tests";
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";

export function DailyChemistryTask() {
  const [item, setItem] = useState<ChemistryRandomItem | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  const load = useCallback(async (exclude: string[]) => {
    setLoading(true);
    setRevealed(false);
    const response = await getRandomChemistryTask(exclude);
    setLoading(false);
    if (response.ok && response.data?.item) {
      setItem(response.data.item);
      setEmpty(false);
      setSeen((current) => [...current, String(response.data.item?.item_id || "")].filter(Boolean));
      return;
    }
    setItem(null);
    setEmpty(true);
  }, []);

  useEffect(() => {
    void load([]);
  }, [load]);

  return (
    <section className="h-full rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <FlaskConical className="h-4 w-4 text-indigo-500" /> Химия: задача дня
        </h2>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          disabled={loading}
          onClick={() => void load(seen)}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Ещё
        </button>
      </div>

      {loading && !item ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Подбираем задачу…
        </p>
      ) : !item ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {empty ? "В банке пока нет задач с готовым ответом." : "Задача не загрузилась."}{" "}
          <Link href="/tests?view=chemistry" className="font-semibold text-indigo-600 dark:text-indigo-400">
            Открыть банк
          </Link>
        </p>
      ) : (
        <>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {item.topic || (item.kind === "test_question" ? "тестовый вопрос" : "открытое задание")}
          </p>
          <div className="mt-1 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
            <ChemRichText text={item.question} />
          </div>

          {revealed ? (
            <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ответ</p>
              {item.answer ? <ChemRichText text={item.answer} className="mt-1" /> : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="mt-3 rounded-xl border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-300 dark:hover:bg-slate-800"
            >
              Показать ответ
            </button>
          )}

          <Link
            href="/tests?view=chemistry"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400"
          >
            Весь банк по химии <ArrowRight className="h-3 w-3" />
          </Link>
        </>
      )}
    </section>
  );
}
