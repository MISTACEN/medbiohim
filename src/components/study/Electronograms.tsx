"use client";

/**
 * Электронограммы: 11 для КР + три «нервных» карточки, где частая потеря
 * балла — перепутать продольный и поперечный срез миелинового волокна.
 * «Знаю» хранится локально; печать — отдельный слой, который виден только
 * на бумаге.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Circle, Loader2, Printer, TriangleAlert } from "lucide-react";

export type Electronogram = {
  n: number;
  id: string;
  name: string;
  file: string;
  labels: string;
  theory: string;
};

export type NerveElectronogram = {
  id: string;
  group: string;
  title: string;
  file: string;
  schematic?: boolean;
  labels: string;
  theory: string;
  difference: string;
};

const KNOW_KEY = "study.em.know.v2";

export function emSrc(file: string): string {
  if (/\.svg$/i.test(file)) return `/study/img/${file}`;
  return `/study/img/${file.replace(/\.png$/i, ".jpg")}`;
}

function readKnow(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KNOW_KEY) || "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function Electronograms({
  ems,
  nerve,
  onPrint,
}: {
  ems: Electronogram[];
  nerve: NerveElectronogram[];
  onPrint: () => void;
}) {
  const [know, setKnow] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => setKnow(readKnow()), []);

  const known = useMemo(() => Object.values(know).filter(Boolean).length, [know]);
  const openKr = ems.find((em) => em.id === openId);
  const openNerve = nerve.find((em) => em.id === openId);
  const visible = openKr ?? openNerve;

  const toggleKnow = (id: string) => {
    setKnow((current) => {
      const next = { ...current, [id]: !current[id] };
      if (!next[id]) delete next[id];
      try {
        localStorage.setItem(KNOW_KEY, JSON.stringify(next));
      } catch {
        /* приватный режим — не блокируем */
      }
      return next;
    });
  };

  if (!ems.length) {
    return (
      <section className="card flex items-center gap-2 p-6 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Загружаем электронограммы…
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">11 электронограмм к КР</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Сначала назови и подпиши по памяти, потом открой ответ. «Знаю» — когда рассказал вслух без подсказки.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--muted)]">Знаю: {known} из {ems.length + nerve.length}</span>
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold"
            >
              <Printer className="h-4 w-4" /> Печать
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {ems.map((em) => (
          <button
            key={em.id}
            type="button"
            onClick={() => { setOpenId(em.id); setRevealed(false); }}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] text-left transition hover:border-indigo-300"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={emSrc(em.file)} alt={`Электронограмма No${em.n}`} loading="lazy" className="h-24 w-full object-cover" />
            <span className="block px-2 py-1.5 text-xs font-semibold">
              {know[em.id] ? <Check className="mr-1 inline h-3.5 w-3.5 text-[var(--status-ok-fg)]" /> : null}
              No{em.n}
            </span>
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200">
          <TriangleAlert className="h-4 w-4" /> Нервная ткань: не путать срезы
        </div>
        <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-100/80">
          Продольный — волокно вдоль, перехваты и насечки. Поперечный — кольца миелина. Это самая частая потеря балла
          по электронограмме.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {nerve.map((em) => (
            <button
              key={em.id}
              type="button"
              onClick={() => { setOpenId(em.id); setRevealed(false); }}
              className="overflow-hidden rounded-xl border border-amber-200 bg-white text-left dark:border-amber-500/30 dark:bg-transparent"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={emSrc(em.file)} alt={em.title} loading="lazy" className="h-24 w-full object-cover" />
              <span className="block px-2 py-1.5 text-xs font-semibold">
                {know[em.id] ? <Check className="mr-1 inline h-3.5 w-3.5 text-[var(--status-ok-fg)]" /> : null}
                {em.title}
              </span>
            </button>
          ))}
        </div>
      </section>

      {visible && (
        <section className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {"n" in visible ? `Электронограмма No${visible.n}` : visible.group}
              </p>
              <h3 className="mt-1 font-semibold">{"name" in visible ? visible.name : visible.title}</h3>
            </div>
            <button type="button" onClick={() => setOpenId(null)} className="rounded-xl border px-2.5 py-1 text-xs font-semibold">
              Закрыть
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={emSrc(visible.file)}
            alt={"name" in visible ? visible.name : visible.title}
            className="mt-2 max-h-[420px] w-full rounded-xl border border-[var(--border)] bg-black object-contain"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setRevealed(true)} className="btn-primary text-sm">
              Показать название и подписи
            </button>
            <button
              type="button"
              onClick={() => toggleKnow(visible.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold"
            >
              {know[visible.id] ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              {know[visible.id] ? "Знаю" : "Отметить «знаю»"}
            </button>
          </div>
          {revealed && (
            <div className="mt-3 space-y-2 rounded-xl bg-[var(--background)] p-3 text-sm">
              <p className="font-semibold">{"name" in visible ? visible.name : visible.title}</p>
              <p className="text-[var(--muted)]">{visible.labels}</p>
              <p>{visible.theory}</p>
              {"difference" in visible && (
                <p className="rounded-lg bg-amber-50 p-2 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                  <strong>Как отличить:</strong> {visible.difference}
                </p>
              )}
              {"schematic" in visible && visible.schematic ? (
                <p className="text-xs text-[var(--muted)]">Это схема для различения, а не электронограмма.</p>
              ) : null}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Печатный лист: 11 электронограмм с названиями и подписями, по две на ряд. */
export function ElectronogramPrintSheet({ ems }: { ems: Electronogram[] }) {
  return (
    <div className="study-print hidden print:block">
      <h1 className="mb-3 text-lg font-bold">Электронограммы к КР — печать для стенда</h1>
      <div className="grid grid-cols-2 gap-4">
        {ems.map((em) => (
          <article key={em.id} className="break-inside-avoid border border-black p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={emSrc(em.file)} alt={em.name} className="h-48 w-full object-contain" />
            <p className="mt-1 text-sm font-bold">No{em.n}. {em.name}</p>
            <p className="mt-1 text-xs">{em.labels}</p>
          </article>
        ))}
      </div>
    </div>
  );
}