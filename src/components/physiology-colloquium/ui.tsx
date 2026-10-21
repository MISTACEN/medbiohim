"use client";

import { CheckCircle2 } from "lucide-react";
import type { BankQuestion } from "@/lib/physiology-colloquium/content";

export function ProgressBar({
  value,
  total,
  className = "",
  tone = "indigo",
}: {
  value: number;
  total: number;
  className?: string;
  tone?: "indigo" | "violet" | "emerald" | "amber" | "rose";
}) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const tones = {
    indigo: "bg-indigo-500",
    violet: "bg-violet-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };
  return (
    <div
      className={"h-2 w-full overflow-hidden rounded-full bg-slate-100 " + className}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
    >
      <div
        className={"h-full rounded-full transition-all duration-500 " + tones[tone]}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function ReadinessRing({ percent, label }: { percent: number; label?: string }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  const color = percent >= 70 ? "#059669" : percent >= 40 ? "#d97706" : "#4f46e5";

  return (
    <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
      <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128" aria-hidden>
        <circle cx="64" cy="64" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-slate-900">{percent}%</span>
        {label && <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>}
      </div>
    </div>
  );
}

export function OptionList({
  question,
  selected,
  onToggle,
  checked,
}: {
  question: BankQuestion;
  selected: number[];
  onToggle?: (optionNumber: number) => void;
  checked: boolean;
}) {
  const options = question.options ?? [];
  const correct = question.correct ?? [];
  const multiple = correct.length > 1;

  return (
    <div className="mt-3 grid gap-2">
      <p className="text-xs text-slate-500">
        {multiple ? "Выбери все правильные варианты." : "Выбери один правильный вариант."}
      </p>
      {options.map((option) => {
        const isSelected = selected.includes(option.number);
        const isCorrect = correct.includes(option.number);
        const isWrongSelected = checked && isSelected && !isCorrect;
        const tone = checked && isCorrect
          ? "border-emerald-300 bg-emerald-50"
          : isWrongSelected
            ? "border-rose-300 bg-rose-50"
            : isSelected
              ? "border-indigo-300 bg-indigo-50"
              : "border-slate-200 hover:border-indigo-200";

        return (
          <label
            key={option.number}
            className={"flex items-start gap-3 rounded-xl border p-3 text-sm leading-5 transition " + tone + (checked ? " cursor-default" : " cursor-pointer")}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={`question-${question.id}`}
              checked={isSelected}
              disabled={checked || !onToggle}
              onChange={() => onToggle?.(option.number)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
            />
            <span className="min-w-0 flex-1">
              <span className="mr-2 font-bold text-slate-500">{option.number})</span>
              {option.text}
            </span>
            {checked && isCorrect && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />}
          </label>
        );
      })}
    </div>
  );
}

export function StatTile({
  value,
  label,
  hint,
  tone = "indigo",
}: {
  value: string | number;
  label: string;
  hint?: string;
  tone?: "indigo" | "violet" | "emerald" | "amber";
}) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-700",
    violet: "bg-violet-50 text-violet-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className={"inline-flex rounded-lg px-2 py-1 text-xs font-extrabold " + tones[tone]}>{value}</div>
      <div className="mt-2 text-sm font-bold text-slate-900">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
