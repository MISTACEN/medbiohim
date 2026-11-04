"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Info, RotateCcw, XCircle } from "lucide-react";
import { gradeActivity } from "@/lib/learning/grading";
import { KNOWLEDGE_LEVELS, SOURCE_KIND_LABELS } from "@/lib/learning/types";
import { SIMULATIONS } from "@/lib/sim/catalog";
import { computeCurve, defaultParams, evaluate, formatOutput } from "@/lib/sim/engine";
import { recordRun } from "@/lib/learning/progress";
import type { SimDefinition, SimOutput, SimParams } from "@/lib/sim/types";

function Plot({ definition, values }: { definition: SimDefinition; values: SimParams }) {
  const sweep = definition.sweep;
  const curve = useMemo(() => computeCurve(definition, values), [definition, values]);
  if (!sweep || curve.length < 2) return null;

  const xs = curve.map((point) => point.x);
  const ys = curve.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (maxY - minY < 1e-9) {
    minY -= 1;
    maxY += 1;
  }

  const points = curve
    .map((point) => {
      const x = ((point.x - minX) / (maxX - minX || 1)) * 100;
      const y = 100 - ((point.y - minY) / (maxY - minY)) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <figure className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {sweep.yLabel} от {sweep.xLabel}
      </figcaption>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`График: ${sweep.yLabel} от ${sweep.xLabel}`}
        className="h-44 w-full overflow-visible"
      >
        <line x1="0" y1="100" x2="100" y2="100" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="0" x2="0" y2="100" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
        <span>{minX.toFixed(2)}</span>
        <span>{maxX.toFixed(2)}</span>
      </div>
    </figure>
  );
}

function SimulationPanel({ definition }: { definition: SimDefinition }) {
  const [values, setValues] = useState<SimParams>(() => defaultParams(definition));
  const [answer, setAnswer] = useState<number | null>(null);

  const evaluation = useMemo(() => evaluate(definition, values), [definition, values]);
  const graded = useMemo(
    () =>
      answer === null
        ? null
        : gradeActivity({
            type: "single_choice",
            selected: answer,
            correct: definition.check.correctIndex,
          }),
    [answer, definition.check.correctIndex],
  );

  // Один запуск = одно сохранение; повторные клики по верному ответу не плодят записи.
  const recorded = useRef(false);
  useEffect(() => {
    if (!graded?.correct || recorded.current) return;
    recorded.current = true;
    recordRun({
      slug: definition.slug,
      subjectSlug: definition.subjectSlug,
      percent: graded.percent,
      correctCount: 1,
      total: 1,
      finishedAt: new Date().toISOString(),
    });
  }, [graded, definition.slug, definition.subjectSlug]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{definition.title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">{definition.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 font-semibold text-[var(--primary)]">
            {KNOWLEDGE_LEVELS[definition.level].title}
          </span>
          <span className="rounded-full border border-[var(--border)] px-3 py-1">
            {SOURCE_KIND_LABELS[definition.source.kind]}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Параметры</div>
              <button
                type="button"
                onClick={() => setValues(defaultParams(definition))}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--primary-soft)]"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Сброс
              </button>
            </div>
            <div className="space-y-3">
              {definition.parameters.map((parameter) => {
                const value = evaluation.params[parameter.id] ?? parameter.default;
                return (
                  <label key={parameter.id} className="block">
                    <span className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-medium">
                        {parameter.label}
                        {parameter.unit ? <span className="text-[var(--muted)]"> · {parameter.unit}</span> : null}
                      </span>
                      <span className="font-mono tabular-nums">{formatOutput(value, parameter.step < 0.1 ? 2 : 1)}</span>
                    </span>
                    <input
                      type="range"
                      min={parameter.min}
                      max={parameter.max}
                      step={parameter.step}
                      value={value}
                      aria-label={`${parameter.label}${parameter.unit ? `, ${parameter.unit}` : ""}`}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setValues((current) => ({ ...current, [parameter.id]: next }));
                      }}
                      className="mt-1 w-full accent-[var(--primary)]"
                    />
                    {parameter.description ? (
                      <span className="mt-0.5 block text-[11px] leading-4 text-[var(--muted)]">
                        {parameter.description}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="mb-2 text-sm font-semibold">Измерения</div>
            <dl className="grid gap-2 sm:grid-cols-3">
              {definition.outputs.map((output) => (
                <div key={output.id} className="rounded-xl border border-[var(--border)] p-3">
                  <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{output.label}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">
                    {formatOutput(evaluation.outputs[output.id] ?? 0, output.precision ?? 2)}
                    {output.unit ? <span className="ml-1 text-xs font-normal text-[var(--muted)]">{output.unit}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
            {evaluation.warning ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-[var(--status-warn-bg)] px-3 py-2 text-xs text-[var(--status-warn-fg)]">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {evaluation.warning}
              </p>
            ) : null}
            <ul className="mt-3 space-y-1 text-xs leading-5 text-[var(--muted)]">
              {evaluation.notes.map((note) => (
                <li key={note}>· {note}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <Plot definition={definition} values={values} />

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="mb-2 text-sm font-semibold">Пошаговое объяснение</div>
            <ol className="space-y-3">
              {definition.steps.map((step, index) => {
                const visible = (step.outputs ?? [])
                  .map((id) => definition.outputs.find((output) => output.id === id))
                  .filter((output): output is SimOutput => Boolean(output));
                return (
                  <li key={step.id} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[11px] font-bold text-[var(--primary)]">
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-sm font-semibold">{step.title}</div>
                      <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{step.explanation}</p>
                      {visible.length ? (
                        <p className="mt-1 font-mono text-[11px] text-[var(--primary)]">
                          {visible
                            .map(
                              (output) =>
                                `${output.label}: ${formatOutput(evaluation.outputs[output.id] ?? 0, output.precision ?? 2)}${output.unit ? ` ${output.unit}` : ""}`,
                            )
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="text-sm font-semibold">Проверка понимания</div>
        <p className="mt-1 text-sm">{definition.check.prompt}</p>
        <div className="mt-3 grid gap-2">
          {definition.check.options.map((option, index) => {
            const selected = answer === index;
            const isCorrect = definition.check.correctIndex === index;
            const showState = graded !== null && (selected || (graded.correct && isCorrect));
            return (
              <button
                key={option}
                type="button"
                onClick={() => setAnswer(index)}
                className={[
                  "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm",
                  showState && isCorrect
                    ? "border-[var(--status-ok-fg)] bg-[var(--status-ok-bg)]"
                    : selected && graded && !isCorrect
                      ? "border-red-300 bg-red-50"
                      : "border-[var(--border)] hover:border-[var(--primary)]",
                ].join(" ")}
              >
                <span>{option}</span>
                {showState && isCorrect ? <CheckCircle2 className="h-4 w-4 text-[var(--status-ok-fg)]" /> : null}
                {showState && selected && !isCorrect ? <XCircle className="h-4 w-4 text-red-500" /> : null}
              </button>
            );
          })}
        </div>
        {graded ? (
          <div className="mt-3 rounded-xl border border-[var(--border)] px-3 py-2 text-xs leading-5">
            <span className="font-semibold">{graded.correct ? "Верно. " : "Пока неверно. "}</span>
            {definition.check.explanation}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-xs leading-5 text-[var(--muted)]">
        <p className="font-semibold">Что модель не учитывает</p>
        <ul className="mt-1 space-y-1">
          {definition.assumptions.map((assumption) => (
            <li key={assumption}>· {assumption}</li>
          ))}
          {definition.source.limitations.map((limitation) => (
            <li key={limitation}>· {limitation}</li>
          ))}
        </ul>
        <p className="mt-2">
          Источник: {definition.source.title}
          {definition.source.author ? ` — ${definition.source.author}` : ""}
          {definition.source.year ? `, ${definition.source.year}` : ""}.
        </p>
      </div>
    </div>
  );
}

export default function SimulationRunner({
  initialSlug,
  subjectSlug,
}: {
  initialSlug?: string;
  subjectSlug?: string;
}) {
  const list = useMemo(() => {
    const scoped = subjectSlug
      ? SIMULATIONS.filter((simulation) => simulation.subjectSlug === subjectSlug)
      : SIMULATIONS;
    return scoped.length ? scoped : SIMULATIONS;
  }, [subjectSlug]);
  // Модель из URL принимается только если она входит в текущий предметный
  // фильтр: иначе /labs/simulations?subject=physiology&slug=osmosis показал бы осмос.
  const first = list.find((simulation) => simulation.slug === initialSlug) ?? list[0];
  const [slug, setSlug] = useState(first.slug);
  const definition = list.find((simulation) => simulation.slug === slug) ?? first;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {list.map((simulation) => (
          <button
            key={simulation.slug}
            type="button"
            onClick={() => setSlug(simulation.slug)}
            aria-pressed={simulation.slug === definition.slug}
            className={[
              "rounded-xl border px-3 py-2 text-left text-xs",
              simulation.slug === definition.slug
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] hover:border-[var(--primary)]",
            ].join(" ")}
          >
            <span className="block font-semibold">{simulation.title}</span>
            <span className="mt-0.5 block text-[11px] text-[var(--muted)]">{simulation.subjectSlug}</span>
          </button>
        ))}
      </div>

      <SimulationPanel key={definition.slug} definition={definition} />
    </div>
  );
}
