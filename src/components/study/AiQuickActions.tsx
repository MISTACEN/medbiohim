"use client";

/**
 * Быстрые ИИ-действия в тьюторе: мнемоники, доска, тона объяснения.
 * Кнопка берёт тему из текущего ввода чата (если пусто — просто ставит
 * шаблон в поле и фокусирует, тема дописывается вручную).
 * Это roadmap §2.9.
 */
import { Lightbulb, PenLine, Baby, GraduationCap, MessageCircleHeart } from "lucide-react";

const ACTIONS = [
  { id: "mnemonic", icon: Lightbulb, label: "Мнемоника", template: "Придумай мнемонику для запоминания: ", hint: "фраза, по буквам которой вспомнишь всё" },
  { id: "board", icon: PenLine, label: "Схема на доске", template: "Нарисуй схему на доске в формате mermaid: ", hint: "инфографика или шпаргалка" },
  { id: "child", icon: Baby, label: "Как пятилетнему", template: "Объясни как пятилетнему ребёнку: ", hint: "максимально просто" },
  { id: "gossip", icon: MessageCircleHeart, label: "Как сплетню", template: "Объясни как сплетню — со страстью и интригой: ", hint: "запоминается лучше лекции" },
  { id: "exam", icon: GraduationCap, label: "Как на экзамене", template: "Объясни как на экзамене — формально, по структуре, как отвечают на кафедре: ", hint: "строго и по делу" },
] as const;

export function AiQuickActions({ topic, onPrompt }: {
  topic: string;
  onPrompt: (prompt: string) => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onPrompt(topic.trim() ? action.template + topic.trim() : action.template)}
          title={action.hint}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] transition hover:border-[var(--primary)]/50 hover:bg-[var(--primary-soft)]"
        >
          <action.icon className="h-3.5 w-3.5" /> {action.label}
        </button>
      ))}
    </div>
  );
}
