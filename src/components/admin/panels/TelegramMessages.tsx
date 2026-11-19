"use client";

/** Telegram → задания: последние сообщения с разбором и публикацией. */
import { CheckCircle2, FileText } from "lucide-react";
import type { TelegramAdminChat } from "@/lib/api";
import {
  TELEGRAM_CATEGORY_LABEL,
  telegramCategoryClass,
  telegramHomeworkId,
  telegramMessageText,
  telegramShortDate,
  type TelegramMessageRow,
} from "@/components/admin/panels/model";

export function TelegramMessages({
  messages,
  chats,
  chatFilter,
  publishing,
  onSelectChat,
  onPublish,
  chatTitle,
}: {
  messages: TelegramMessageRow[];
  chats: TelegramAdminChat[];
  chatFilter: string;
  publishing: string | null;
  onSelectChat: (value: string) => void;
  onPublish: (message: TelegramMessageRow) => void;
  chatTitle: (chatId: number) => string;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="font-semibold">Последние сообщения · {messages.length}</div>
        <select value={chatFilter} onChange={(event) => onSelectChat(event.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm">
          <option value="">Все чаты</option>
          {chats.map((chat) => <option key={chat.telegram_chat_id} value={String(chat.telegram_chat_id)}>{chat.telegram_title || chat.telegram_chat_id}</option>)}
        </select>
      </div>
      {messages.length === 0 ? <div className="p-8 text-center text-sm text-gray-500">
        <FileText className="mx-auto mb-2 h-6 w-6" />Сообщений пока нет. После первого сообщения в привязанной группе здесь появится разбор GigaChat.
      </div> : <div className="divide-y">{messages.map((message) => {
        const linked = telegramHomeworkId(message);
        const category = message.classification || "other";
        const confidence = Math.round(Math.max(0, Math.min(1, Number(message.classification_confidence) || 0)) * 100);
        return <div key={message.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className={"rounded-full border px-2 py-0.5 font-semibold " + telegramCategoryClass(category)}>{TELEGRAM_CATEGORY_LABEL[category] || category}</span>
            <span>{confidence}%</span>
            <span>· {chatTitle(message.telegram_chat_id)}</span>
            <span>· {telegramShortDate(message.telegram_date || message.created_at)}</span>
            {message.processing_status && <span>· {message.processing_status}</span>}
          </div>
          <p className="whitespace-pre-wrap text-sm text-gray-800">{telegramMessageText(message) || "Без текста (вложение)"}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {message.ai_subject_hint && <span>Предмет: {message.ai_subject_hint}</span>}
            {message.ai_due_hint && <span>Срок: {message.ai_due_hint}</span>}
            {message.ai_reason && <span title={message.ai_reason}>Источник: {message.ai_reason.startsWith("rules_") ? "правила" : message.ai_reason.includes("cloudflare") ? "Cloudflare AI" : message.ai_reason.includes("gigachat") ? "GigaChat" : "правила"}</span>}
          </div>
          {linked ? <div className="text-xs font-medium text-[var(--status-ok-fg)]">Задание создано · {linked.slice(0, 8)}</div> : <button
            type="button"
            onClick={() => onPublish(message)}
            disabled={publishing === message.id}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />{publishing === message.id ? "Создаём…" : "Создать задание"}
          </button>}
        </div>;
      })}</div>}
    </div>
  );
}
