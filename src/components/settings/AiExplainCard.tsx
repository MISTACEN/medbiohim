"use client";

import clsx from "clsx";
import { Sparkles } from "lucide-react";

const PROVIDERS: [string, string][] = [
  ["auto", "Авто (рекомендуется)"],
  ["gigachat", "GigaChat"],
  ["groq", "Groq"],
  ["mistral", "Mistral"],
  ["openai", "OpenAI"],
  ["openrouter", "OpenRouter"],
  ["custom", "Своя модель"],
];

export type AiExplainCardProps = {
  value: string;
  onSelect: (id: string) => void;
};

/** Выбор провайдера для кнопки «Объяснить · ИИ». */
export function AiExplainCard({ value, onSelect }: AiExplainCardProps) {
  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5" /> ИИ-пояснения в тестах</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Какая нейросеть отвечает по кнопке «Объяснить · ИИ» и в разборе ошибок. «Авто» — сервер выбирает сам по доступности ключей.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={clsx(
              "rounded-xl border px-3 py-2 text-sm font-semibold transition",
              value === id
                ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                : "border-[var(--border)] text-slate-600 hover:border-indigo-300",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--muted)]">
        Настройка применяется к кнопкам в тренировке и в разборе после теста; сами ответы на вопросы она не меняет.
      </p>
    </section>
  );
}
