"use client";

/** Telegram → задания: список обнаруженных чатов с привязкой к группам. */
import { AlertCircle, CheckCircle2, Link2 } from "lucide-react";
import type { TelegramAdminChat } from "@/lib/api";
import type { TelegramGroup } from "@/components/admin/panels/model";

export function TelegramChats({
  chats,
  groups,
  busy,
  onBind,
}: {
  chats: TelegramAdminChat[];
  groups: TelegramGroup[];
  busy: boolean;
  onBind: (chat: TelegramAdminChat, groupId: string) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b px-4 py-3 font-semibold">Обнаруженные Telegram-чаты</div>
      {chats.length === 0 ? <div className="p-8 text-center text-sm text-gray-500">
        <AlertCircle className="mx-auto mb-2 h-6 w-6" />Пока нет чатов. Добавь бота в учебную группу и отправь новое сообщение.
      </div> : <div className="divide-y">{chats.map((chat) => <div key={chat.telegram_chat_id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="font-medium">{chat.telegram_title || "Без названия"}</div>
          <div className="mt-1 text-xs text-gray-500">{chat.telegram_chat_type} · ID {chat.telegram_chat_id}</div>
          <div className="mt-2 text-xs">{chat.is_verified && chat.group_name
            ? <span className="inline-flex items-center gap-1 text-[var(--status-ok-fg)]"><CheckCircle2 className="h-4 w-4" /> {chat.group_name}{chat.group_code ? " · " + chat.group_code : ""}</span>
            : <span className="text-[var(--status-warn-fg)]">Не привязан</span>}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-gray-400" />
          <select defaultValue={chat.group_id || ""} disabled={busy} onChange={(event) => onBind(chat, event.target.value)} className="min-w-64 rounded-lg border bg-white px-3 py-2 text-sm">
            <option value="">Выбрать учебную группу…</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name || group.id}{group.code ? " · " + group.code : ""}</option>)}
          </select>
        </div>
      </div>)}</div>}
    </div>
  );
}
