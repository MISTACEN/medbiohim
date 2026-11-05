"use client";

/**
 * Анимация цикла Na⁺/K⁺-АТФазы — визуализация для общего плеера симуляций
 * (§9.1 задания: мембрана, насос, ионы, этапы Поста–Альберса).
 *
 * Управление: запуск/пауза, шаг вперёд/назад, повтор цикла, скорость.
 * Экзаменационный режим скрывает подписи этапов и спрашивает студента,
 * какой этап показан. Компонент не знает про расчёты — только про этапы.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pause, Play, RotateCcw } from "lucide-react";
import type { SimStep } from "@/lib/sim/types";

type Props = {
  steps: SimStep[];
};

/** Полные наименования конформаций — используются в подсказке сцены. */
const STAGE_CONFORMATIONS = ["E1", "E1·ATP", "E1-P", "E2-P", "E2-P", "E2-P", "E2", "E1"];

const SPEEDS = [
  { label: "0.5×", ms: 3000 },
  { label: "1×", ms: 1800 },
  { label: "2×", ms: 900 },
  { label: "4×", ms: 450 },
];

type Ion = {
  id: string;
  x: number;
  y: number;
  /** Позиции по этапам: 8 значений для steps 0..7 (координаты SVG 0..100). */
  path: Array<{ x: number; y: number }>;
  color: string;
  label: string;
};

/**
 * Пути ионов по этапам. Сцена: мембрана на y=50, насос в центре (x≈50).
 * Внутри клетки — ниже мембраны (y>50), снаружи — выше (y<50).
 * Этапы: 0 связывание Na⁺, 1 АТФ, 2 фосфорилирование, 3 E1-P→E2-P,
 * 4 выход Na⁺, 5 связывание K⁺, 6 дефосфорилирование, 7 возврат K⁺.
 */
const SODIUM_PATHS: Array<[number, number]> = [
  [50, 74], [50, 74], [50, 66], [50, 58], [50, 18], [50, 16], [50, 16], [50, 74],
];
const POTASSIUM_PATHS: Array<[number, number]> = [
  [50, 82], [50, 82], [50, 82], [50, 82], [50, 82], [50, 20], [50, 36], [50, 78],
];

function ions(paths: Array<[number, number]>, color: string, label: string): Ion[] {
  return paths.map((_, index) => ({
    id: `${label}-${index}`,
    x: paths[index][0],
    y: paths[index][1],
    path: paths.map(([x, y]) => ({ x: x + index * 9 - (paths.length - 1) * 4.5, y })),
    color,
    label,
  }));
}

export function NaKPumpVisual({ steps }: Props) {
  const count = steps.length;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [examMode, setExamMode] = useState(false);
  const [examAnswer, setExamAnswer] = useState<number | null>(null);

  const sodium = useMemo(() => ions(SODIUM_PATHS, "#2563eb", "Na"), []);
  const potassium = useMemo(() => ions(POTASSIUM_PATHS, "#059669", "K"), []);

  // Автопрогрывание: интервал зависит от выбранной скорости.
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setStep((current) => {
        const next = current + 1;
        if (next < count) return next;
        if (loop) return 0;
        setPlaying(false);
        return current;
      });
    }, SPEEDS[speedIndex].ms);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [playing, loop, speedIndex, count]);

  const goTo = useCallback(
    (next: number) => {
      setStep(((next % count) + count) % count);
      setExamAnswer(null);
    },
    [count],
  );

  // Экзаменационные варианты — текущий + три случайных фиксированных шага.
  const examOptions = useMemo(() => {
    const others = steps.map((_, i) => i).filter((i) => i !== step);
    const picked = [others[(step + 1) % others.length], others[(step + 3) % others.length], others[(step + 5) % others.length]];
    const options = [step, ...picked].map((i) => steps[i].title);
    // Детерминированное «перемешивание» по номеру шага, чтобы варианты менялись.
    const shift = (step % options.length) + 1;
    return options.slice(shift).concat(options.slice(0, shift));
  }, [steps, step]);
  const correctExamIndex = examOptions.indexOf(steps[step].title);

  const conformation = STAGE_CONFORMATIONS[step] || "E1";
  // Ионы «в насосе» на этапе перехода.
  const naInPump = step === 2 || step === 3;
  const naOutside = step >= 4 && step <= 7;
  const kInPump = step === 6 || step === 7;
  const atpBound = step >= 1 && step <= 4;
  const phosphorylated = step >= 2 && step <= 6;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          Цикл Поста–Альберса · этап {step + 1}/{count}
          {examMode ? " · экзаменационный режим" : ""}
        </div>
        <button
          type="button"
          onClick={() => {
            setExamMode((v) => !v);
            setExamAnswer(null);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--primary-soft)]"
          aria-pressed={examMode}
        >
          {examMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {examMode ? "Показать подписи" : "Экзаменационный режим"}
        </button>
      </div>

      <svg
        viewBox="0 0 100 100"
        className="w-full overflow-visible"
        role="img"
        aria-label={`Анимация Na⁺/K⁺-АТФазы, этап ${step + 1}: ${steps[step].title}`}
      >
        {/* Внеклеточная среда */}
        <rect x="0" y="0" width="100" height="46" fill="var(--primary-soft)" opacity="0.25" />
        <text x="2" y="5" fontSize="3.5" fill="var(--muted)">Внеклеточная среда · Na⁺ 145 мМ, K⁺ 4.5 мМ</text>
        {/* Цитоплазма */}
        <rect x="0" y="54" width="100" height="46" fill="var(--status-ok-bg)" opacity="0.35" />
        <text x="2" y="96" fontSize="3.5" fill="var(--muted)">Цитоплазма · Na⁺ 12 мМ, K⁺ 140 мМ, АТФ</text>
        {/* Мембрана */}
        <rect x="0" y="46" width="100" height="8" fill="var(--border)" opacity="0.7" />
        <text x="96.5" y="51" fontSize="3" fill="var(--muted)" textAnchor="end">мембрана</text>

        {/* Насос: α-субъединица с конформационным наклоном */}
        <g transform={`rotate(${phosphorylated ? -6 : 6} 50 50)`} style={{ transition: "transform 400ms ease" }}>
          <ellipse cx="50" cy="50" rx="12" ry="9" fill="var(--primary)" opacity="0.85" />
          <ellipse cx="50" cy="44" rx="8" ry="4" fill="var(--primary)" opacity="0.5" />
          <text x="50" y="51.5" fontSize="3.6" textAnchor="middle" fill="#fff" fontWeight="bold">{conformation}</text>
        </g>
        {/* Фосфатная метка */}
        {phosphorylated ? (
          <g>
            <circle cx="50" cy="38" r="2.4" fill="#f59e0b" />
            <text x="50" y="39" fontSize="2.6" textAnchor="middle" fill="#fff" fontWeight="bold">P</text>
          </g>
        ) : null}

        {/* АТФ/АДФ у цитоплазматического домена */}
        <g opacity={atpBound ? 1 : 0.25}>
          <circle cx="61" cy="60" r="3" fill="#8b5cf6" />
          <text x="61" y="61.2" fontSize="2.8" textAnchor="middle" fill="#fff">{atpBound && step <= 2 ? "ATP" : "ADP"}</text>
        </g>

        {/* Ионы натрия: 3 шт. */}
        {sodium.map((ion, index) => {
          const point = ion.path[step];
          const x = point.x;
          const y = point.y;
          const inPump = naInPump && index === 0;
          const outside = naOutside;
          return (
            <g key={ion.id} style={{ transition: "transform 500ms ease", transform: `translate(${x}px, ${y}px)` }}>
              <circle r="3.4" fill={ion.color} opacity={inPump ? 0.35 : outside ? 0.9 : 1} />
              <text fontSize="3.2" textAnchor="middle" fill="#fff" dy="1.2">Na</text>
            </g>
          );
        })}
        {/* Ионы калия: 2 шт. */}
        {potassium.map((ion, index) => {
          const point = ion.path[step];
          const x = point.x;
          const y = point.y;
          const inPump = kInPump;
          return (
            <g key={ion.id} style={{ transition: "transform 500ms ease", transform: `translate(${x}px, ${y}px)` }}>
              <circle r="3.4" fill={ion.color} opacity={inPump ? 0.35 : step === 5 ? 0.9 : 1} />
              <text fontSize="3.2" textAnchor="middle" fill="#fff" dy="1.2">K</text>
            </g>
          );
        })}

        {/* Направление электрогенного тока */}
        {step === 4 || step === 7 ? (
          <g opacity="0.85">
            <path d="M 76 26 L 76 40" stroke="var(--status-warn-fg)" strokeWidth="1.2" markerEnd="none" />
            <polygon points="74,40 78,40 76,44" fill="var(--status-warn-fg)" />
            <text x="79" y="34" fontSize="3" fill="var(--status-warn-fg)">+ заряд наружу</text>
          </g>
        ) : null}
      </svg>

      {examMode ? (
        <div className="mt-3">
          <p className="text-sm font-semibold">Какой этап цикла показан?</p>
          <div className="mt-2 grid gap-2">
            {examOptions.map((option, index) => {
              const isCorrect = index === correctExamIndex;
              const selected = examAnswer === index;
              const showState = examAnswer !== null && (selected || isCorrect);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setExamAnswer(index)}
                  className={[
                    "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm",
                    showState && isCorrect
                      ? "border-[var(--status-ok-fg)] bg-[var(--status-ok-bg)]"
                      : selected && examAnswer !== null && !isCorrect
                        ? "border-[var(--status-critical-fg)] bg-[var(--status-critical-bg)]"
                        : "border-[var(--border)] hover:border-[var(--primary)]",
                  ].join(" ")}
                >
                  <span>{option}</span>
                  {showState && isCorrect ? <span className="text-[var(--status-ok-fg)]">✓</span> : null}
                </button>
              );
            })}
          </div>
          {examAnswer !== null ? (
            <p className="mt-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs leading-5">
              <span className="font-semibold">{examAnswer === correctExamIndex ? "Верно. " : "Пока неверно. "}</span>
              {steps[step].explanation}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
          <b>{steps[step].title}</b>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{steps[step].explanation}</p>
        </div>
      )}

      {/* Управление проигрывателем */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => goTo(step - 1)}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--primary-soft)]"
          aria-label="Предыдущий этап"
        >
          <ChevronLeft className="h-4 w-4" /> Назад
        </button>
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white"
          aria-pressed={playing}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Пауза" : "Запуск"}
        </button>
        <button
          type="button"
          onClick={() => goTo(step + 1)}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--primary-soft)]"
          aria-label="Следующий этап"
        >
          Далее <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => goTo(0)}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs hover:bg-[var(--primary-soft)]"
          aria-label="К началу цикла"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <label className="inline-flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={loop}
            onChange={(event) => setLoop(event.target.checked)}
            className="accent-[var(--primary)]"
          />
          Повтор цикла
        </label>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Скорость анимации">
          {SPEEDS.map((speed, index) => (
            <button
              key={speed.label}
              type="button"
              onClick={() => setSpeedIndex(index)}
              className={[
                "rounded-lg border px-2 py-1 text-xs font-semibold",
                index === speedIndex
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)] hover:border-[var(--primary)]",
              ].join(" ")}
              aria-pressed={index === speedIndex}
            >
              {speed.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
