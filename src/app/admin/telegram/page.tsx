"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, RefreshCw, Link2, CheckCircle2, AlertCircle, Sparkles, Send, FileText } from "lucide-react";
import {
  adminBindTelegramChat,
  adminPublishTelegramMessage,
  adminSetTelegramWebhook,
  adminTelegramAiStatus,
  adminTelegramChats,
  adminTelegramMessages,
  listGroups,
  type TelegramAdminChat,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";

type Group = { id: string; name?: string; code?: string };
type AiStatus = {
  provider?: string;
  cloudflareAi?: { configured?: boolean; model?: string };
  gigachat?: { configured?: boolean; transport?: string; model?: string };
  ingest?: { configured?: boolean; verifier?: string };
  webhook?: { configured?: boolean };
};
type TelegramMessage = {
  id: string;
  telegram_chat_id: number;
  telegram_message_id: number;
  message_text?: string | null;
  caption?: string | null;
  telegram_date?: string | null;
  classification?: string | null;
  classification_confidence?: number | null;
  processing_status?: string | null;
  ai_reason?: string | null;
  ai_subject_hint?: string | null;
  ai_due_hint?: string | null;
  created_at?: string | null;
  telegram_homework_links?: Array<{ homework_id?: string | null; relation_type?: string | null }> | { homework_id?: string | null } | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  homework: "Задание",
  material_candidate: "Материал",
  schedule: "Расписание",
  other: "Другое",
};

function categoryClass(category: string | null | undefined) {
  if (category === "homework") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (category === "material_candidate") return "bg-sky-50 text-sky-700 border-sky-200";
  if (category === "schedule") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function homeworkId(message: TelegramMessage): string | null {
  const raw = message.telegram_homework_links;
  const links = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const link of links) if (link?.homework_id) return String(link.homework_id);
  return null;
}

function messageText(message: TelegramMessage): string {
  return String(message.message_text || message.caption || "").replace(/\s+/g, " ").trim();
}

function shortDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function AdminTelegramPage() {
  const [chats, setChats] = useState<TelegramAdminChat[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [chatFilter, setChatFilter] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (filter: string) => {
    setBusy(true);
    setError(null);
    try {
      const [chatsResult, groupsResult, messagesResult, statusResult] = await Promise.all([
        adminTelegramChats(),
        listGroups(),
        adminTelegramMessages(filter || undefined, 80),
        adminTelegramAiStatus(),
      ]);
      if (chatsResult.ok) setChats(chatsResult.data.items || []);
      else setError(describeApiError(chatsResult.error));
      if (groupsResult.ok) setGroups((groupsResult.data.items || []) as Group[]);
      if (messagesResult.ok) setMessages(messagesResult.data.items || []);
      else setError(describeApiError(messagesResult.error));
      if (statusResult.ok) setAiStatus(statusResult.data || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void reload(""); }, [reload]);

  function selectChat(value: string) {
    setChatFilter(value);
    void reload(value);
  }

  async function bind(chat: TelegramAdminChat, groupId: string) {
    if (!groupId) return;
    setBusy(true);
    setError(null);
    const result = await adminBindTelegramChat(chat.telegram_chat_id, groupId);
    if (result.ok) {
      setChats((prev) => prev.map((item) => item.telegram_chat_id === chat.telegram_chat_id ? result.data.chat : item));
      setNote("Группа Telegram привязана к учебной группе. Новые задания будут попадать в неё.");
    } else setError(describeApiError(result.error));
    setBusy(false);
  }

  async function webhook() {
    setBusy(true);
    setError(null);
    const result = await adminSetTelegramWebhook();
    if (result.ok) setNote("Webhook настроен: " + result.data.url);
    else setError(describeApiError(result.error));
    setBusy(false);
  }

  async function publish(message: TelegramMessage) {
    setPublishing(message.id);
    setError(null);
    const result = await adminPublishTelegramMessage(message.id);
    setPublishing(null);
    if (!result.ok) return setError(describeApiError(result.error));
    setNote("Задание создано: " + String(result.data?.homework?.title || ""));
    await reload(chatFilter);
  }

  const chatTitle = (chatId: number) => chats.find((chat) => Number(chat.telegram_chat_id) === Number(chatId))?.telegram_title || String(chatId);
  const cloudflareAiReady = aiStatus?.cloudflareAi?.configured === true;
  const gigachatReady = aiStatus?.gigachat?.configured === true;
  const provider = aiStatus?.provider || "cloudflare";
  const ingestReady = aiStatus?.ingest?.configured === true;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Telegram → задания</h1>
        <p className="mt-1 text-sm text-gray-500">GigaChat сортирует сообщения, задания попадают в выбранную учебную группу.</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => void reload(chatFilter)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50">
          <RefreshCw className={"h-4 w-4 " + (busy ? "animate-spin" : "")} /> Обновить
        </button>
        <button onClick={webhook} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50">
          <Bot className="h-4 w-4" /> Настроить webhook
        </button>
      </div>
    </div>

    <div className="grid gap-3 md:grid-cols-2">
      <div className={"rounded-xl border p-4 text-sm " + (cloudflareAiReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900")}>
        <div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" /> Сортировка Cloudflare AI</div>
        <p className="mt-1">
          {cloudflareAiReady
            ? "Подключена без ключей и сертификатов · модель " + (aiStatus?.cloudflareAi?.model || "Workers AI")
            : "Биндинг Workers AI недоступен. Сообщения будут сортироваться резервными правилами."}
        </p>
        {provider === "gigachat" && <p className="mt-1">Выбран GigaChat: {gigachatReady ? "настроен" : "нет кредов, работает резерв"}.</p>}
        {provider === "auto" && <p className="mt-1">Режим auto: Cloudflare AI, затем GigaChat.</p>}
      </div>
      <div className={"rounded-xl border p-4 text-sm " + (ingestReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800")}>
        <div className="flex items-center gap-2 font-semibold"><Send className="h-4 w-4" /> Приём из групп</div>
        <p className="mt-1">
          {ingestReady
            ? aiStatus?.ingest?.verifier === "bot"
              ? "API проверяет секрет через бота: сообщения принимаются."
              : "Секрет бота и API совпадает: сообщения принимаются."
            : "Приём из групп не настроен: сообщения отклоняются с 503."}
        </p>
      </div>
    </div>

    {(error || note) && <div className={"rounded-xl border bg-white p-3 text-sm " + (error ? "text-rose-700" : "text-gray-700")}>{error || note}</div>}

    <div className="card overflow-hidden">
      <div className="border-b px-4 py-3 font-semibold">Обнаруженные Telegram-чаты</div>
      {chats.length === 0 ? <div className="p-8 text-center text-sm text-gray-500">
        <AlertCircle className="mx-auto mb-2 h-6 w-6" />Пока нет чатов. Добавь бота в учебную группу и отправь новое сообщение.
      </div> : <div className="divide-y">{chats.map((chat) => <div key={chat.telegram_chat_id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="font-medium">{chat.telegram_title || "Без названия"}</div>
          <div className="mt-1 text-xs text-gray-500">{chat.telegram_chat_type} · ID {chat.telegram_chat_id}</div>
          <div className="mt-2 text-xs">{chat.is_verified && chat.group_name
            ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {chat.group_name}{chat.group_code ? " · " + chat.group_code : ""}</span>
            : <span className="text-amber-700">Не привязан</span>}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-gray-400" />
          <select defaultValue={chat.group_id || ""} disabled={busy} onChange={(event) => void bind(chat, event.target.value)} className="min-w-64 rounded-lg border bg-white px-3 py-2 text-sm">
            <option value="">Выбрать учебную группу…</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name || group.id}{group.code ? " · " + group.code : ""}</option>)}
          </select>
        </div>
      </div>)}</div>}
    </div>

    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="font-semibold">Последние сообщения · {messages.length}</div>
        <select value={chatFilter} onChange={(event) => selectChat(event.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm">
          <option value="">Все чаты</option>
          {chats.map((chat) => <option key={chat.telegram_chat_id} value={String(chat.telegram_chat_id)}>{chat.telegram_title || chat.telegram_chat_id}</option>)}
        </select>
      </div>
      {messages.length === 0 ? <div className="p-8 text-center text-sm text-gray-500">
        <FileText className="mx-auto mb-2 h-6 w-6" />Сообщений пока нет. После первого сообщения в привязанной группе здесь появится разбор GigaChat.
      </div> : <div className="divide-y">{messages.map((message) => {
        const linked = homeworkId(message);
        const category = message.classification || "other";
        const confidence = Math.round(Math.max(0, Math.min(1, Number(message.classification_confidence) || 0)) * 100);
        return <div key={message.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className={"rounded-full border px-2 py-0.5 font-semibold " + categoryClass(category)}>{CATEGORY_LABEL[category] || category}</span>
            <span>{confidence}%</span>
            <span>· {chatTitle(message.telegram_chat_id)}</span>
            <span>· {shortDate(message.telegram_date || message.created_at)}</span>
            {message.processing_status && <span>· {message.processing_status}</span>}
          </div>
          <p className="whitespace-pre-wrap text-sm text-gray-800">{messageText(message) || "Без текста (вложение)"}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {message.ai_subject_hint && <span>Предмет: {message.ai_subject_hint}</span>}
            {message.ai_due_hint && <span>Срок: {message.ai_due_hint}</span>}
            {message.ai_reason && <span title={message.ai_reason}>Источник: {message.ai_reason.startsWith("rules_") ? "правила" : message.ai_reason.includes("cloudflare") ? "Cloudflare AI" : message.ai_reason.includes("gigachat") ? "GigaChat" : "правила"}</span>}
          </div>
          {linked ? <div className="text-xs font-medium text-emerald-700">Задание создано · {linked.slice(0, 8)}</div> : <button
            type="button"
            onClick={() => void publish(message)}
            disabled={publishing === message.id}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />{publishing === message.id ? "Создаём…" : "Создать задание"}
          </button>}
        </div>;
      })}</div>}
    </div>

    <div className="rounded-xl border bg-slate-50 p-4 text-sm text-gray-600">
      <b>Важно:</b> для автоматического чтения обычных сообщений учебной группы Telegram бот должен получать все сообщения. Privacy Mode по умолчанию ограничивает такие обновления; для этого сценария его нужно отключить в @BotFather или добавить бота администратором.
    </div>
  </div>;
}
