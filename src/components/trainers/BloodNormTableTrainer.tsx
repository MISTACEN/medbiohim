"use client";

import { useMemo, useState } from "react";
import { Check, RotateCcw, Table2 } from "lucide-react";

type NormCell = string;

type NormRow = {
  id: string;
  label: string;
  group?: string;
  values: NormCell[];
};

const AGE_COLUMNS = [
  { id: "adult", label: "Взрослый" },
  { id: "days4to5", label: "4–5 дней" },
  { id: "years1to2", label: "1–2 года" },
  { id: "years4to5", label: "4–5 лет" },
  { id: "years12to14", label: "12–14 лет" },
] as const;

// Источник: 4.Кровь.docx, страница 1.
// Значения перенесены без замены возрастных норм общими справочными диапазонами.
// Знак ≈ в исходной таблице означает приблизительное значение.
const NORMS: NormRow[] = [
  {
    id: "neutrophils-total",
    label: "Нейтрофилы — всего",
    group: "Нейтрофилы",
    values: ["48–78", "≈45", "≈25", "≈45", "48–78"],
  },
  {
    id: "neutrophils-band",
    label: "П/я",
    group: "Нейтрофилы",
    values: ["1–6", "≈1–6", "≈1–6", "≈1–6", "1–6"],
  },
  {
    id: "neutrophils-segmented",
    label: "С/я",
    group: "Нейтрофилы",
    values: ["47–72", "≈39–44", "≈19–24", "≈39–44", "47–72"],
  },
  {
    id: "eosinophils",
    label: "Эозинофилы",
    values: ["0,5–5", "0,5–5", "0,5–5", "0,5–5", "0,5–5"],
  },
  {
    id: "basophils",
    label: "Базофилы",
    values: ["0–1", "0–1", "0–1", "0–1", "0–1"],
  },
  {
    id: "lymphocytes",
    label: "Лимфоциты",
    values: ["19–37", "≈45", "≈65", "≈45", "19–37"],
  },
  {
    id: "monocytes",
    label: "Моноциты",
    values: ["3–11", "3–11", "3–11", "3–11", "3–11"],
  },
];

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/−|–|—/g, "-")
    .replace(/\s+/g, "")
    .replace(/^≈|^~/, "");
}

function isCorrect(input: string, expected: string) {
  const normalizedInput = normalize(input);
  const normalizedExpected = normalize(expected);
  if (!normalizedInput) return false;
  return normalizedInput === normalizedExpected;
}

export function BloodNormTableTrainer() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [showReference, setShowReference] = useState(false);

  const total = NORMS.length * AGE_COLUMNS.length;

  const result = useMemo(() => {
    if (!checked) return null;
    let correct = 0;
    for (const row of NORMS) {
      row.values.forEach((expected, columnIndex) => {
        const key = row.id + ":" + AGE_COLUMNS[columnIndex].id;
        if (isCorrect(answers[key] || "", expected)) correct += 1;
      });
    }
    return { correct, total, percent: Math.round((correct / total) * 100) };
  }, [answers, checked, total]);

  function setAnswer(rowId: string, columnId: string, value: string) {
    setAnswers((current) => ({ ...current, [rowId + ":" + columnId]: value }));
    if (checked) setChecked(false);
  }

  function reset() {
    setAnswers({});
    setChecked(false);
    setShowReference(false);
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-extrabold">
          <Table2 className="h-5 w-5 text-[var(--primary)]" />
          Нормы крови — заполнение таблицы
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Перенеси из памяти нормы лейкоцитарной формулы в пустую таблицу по возрастам, затем нажми «Проверить себя».
          Проверяются значения, а не оформление: запятая и точка в десятичной дроби равнозначны, разные типы тире и символ «≈» не влияют на оценку.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-10 min-w-[220px] border-b border-r border-[var(--border)] bg-slate-50 px-4 py-3 text-left font-bold text-slate-900">
                  Показатель
                </th>
                {AGE_COLUMNS.map((column) => (
                  <th key={column.id} className="border-b border-[var(--border)] px-3 py-3 text-center font-bold text-slate-900">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NORMS.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                  <th className="sticky left-0 z-10 border-r border-slate-100 bg-white px-4 py-3 text-left font-semibold text-slate-800">
                    <span className={row.group ? "block text-xs font-medium text-slate-400" : "hidden"}>
                      {row.group}
                    </span>
                    <span className={row.group ? "mt-0.5 block" : "block"}>{row.label}</span>
                  </th>
                  {AGE_COLUMNS.map((column, columnIndex) => {
                    const key = row.id + ":" + column.id;
                    const value = answers[key] || "";
                    const correct = checked && isCorrect(value, row.values[columnIndex]);
                    const wrong = checked && !correct;
                    return (
                      <td key={column.id} className="min-w-[125px] border-l border-slate-100 px-2 py-2 align-top">
                        <input
                          value={value}
                          onChange={(e) => setAnswer(row.id, column.id, e.target.value)}
                          aria-label={row.label + ", " + column.label}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="введите норму"
                          className={
                            "w-full rounded-xl border px-3 py-2.5 text-center text-sm outline-none transition " +
                            (correct
                              ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                              : wrong
                                ? "border-rose-400 bg-rose-50 text-rose-900"
                                : "border-slate-200 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100")
                          }
                        />
                        {wrong && value.trim() ? (
                          <div className="mt-1 text-center text-[11px] leading-4 text-rose-700">
                            Эталон: <b>{row.values[columnIndex]}</b>
                          </div>
                        ) : null}
                        {wrong && !value.trim() ? (
                          <div className="mt-1 text-center text-[11px] leading-4 text-rose-700">
                            Пусто · <b>{row.values[columnIndex]}</b>
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => { setShowReference(false); setChecked(true); }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white shadow-sm hover:opacity-95"
        >
          <Check className="h-4 w-4" />
          Проверить себя
        </button>
        <button
          type="button"
          onClick={() => { setShowReference((value) => !value); setChecked(true); }}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          {showReference ? "Скрыть эталон" : "Показать эталон"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw className="h-4 w-4" />
          Заполнить заново
        </button>
      </div>

      {result ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Результат самопроверки</div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">
                {result.correct} / {result.total} · {result.percent}%
              </div>
              <div className="mt-1 text-sm text-[var(--muted)]">
                Верные ячейки подсвечены зелёным, ошибки и пропуски — красным.
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
              <b>Формат ответа:</b> диапазон можно писать как 48–78, 48-78 или 48 — 78.
              Для приблизительных значений достаточно числа: ≈45 → 45.
            </div>
          </div>
        </div>
      ) : null}

      {showReference ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-3 text-sm font-extrabold text-amber-950">Эталон из 4.Кровь.docx</div>
          <div className="overflow-x-auto rounded-2xl border border-amber-200 bg-white">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="bg-amber-50">
                  <th className="min-w-[220px] border-b border-r border-amber-200 px-4 py-3 text-left font-bold">Показатель</th>
                  {AGE_COLUMNS.map((column) => (
                    <th key={column.id} className="border-b border-amber-200 px-3 py-3 text-center font-bold">{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NORMS.map((row) => (
                  <tr key={row.id} className="border-b border-amber-100 last:border-b-0">
                    <th className="border-r border-amber-100 px-4 py-3 text-left font-semibold">{row.label}</th>
                    {row.values.map((value, index) => (
                      <td key={AGE_COLUMNS[index].id} className="border-l border-amber-100 px-3 py-3 text-center font-semibold">{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-xs leading-5 text-amber-900">
            Использованы только значения исходной таблицы; внешние справочные диапазоны сюда не подмешаны.
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default BloodNormTableTrainer;
