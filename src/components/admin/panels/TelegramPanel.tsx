"use client";

/** Telegram → задания: композиция. GigaChat сортирует сообщения, задания попадают в выбранную учебную группу. */
import { Bot, RefreshCw, Send, Sparkles } from "lucide-react";
import { TelegramChats } from "@/components/admin/panels/TelegramChats";
import { TelegramMessages } from "@/components/admin/panels/TelegramMessages";
import { useTelegramPanel } from "@/components/admin/panels/useTelegramPanel";

export function TelegramPanel() {
  const panel = useTelegramPanel();
  const {
    chats, groups, messages, aiStatus, chatFilter,
    busy, publishing, note, error,
    reload, selectChat, bind, webhook, publish,
    chatTitle, cloudflareAiReady, gigachatReady, provider, ingestReady,
  } = panel;

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
        <button onClick={() => void webhook()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50">
          <Bot className="h-4 w-4" /> Настроить webhook
        </button>
      </div>
    </div>

    <div className="grid gap-3 md:grid-cols-2">
      <div className={"rounded-xl border p-4 text-sm " + (cloudflareAiReady ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]")}>
        <div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" /> Сортировка Cloudflare AI</div>
        <p className="mt-1">
          {cloudflareAiReady
            ? "Подключена без ключей и сертификатов · модель " + (aiStatus?.cloudflareAi?.model || "Workers AI")
            : "Биндинг Workers AI недоступен. Сообщения будут сортироваться резервными правилами."}
        </p>
        {provider === "gigachat" && <p className="mt-1">Выбран GigaChat: {gigachatReady ? "настроен" : "нет кредов, работает резерв"}.</p>}
        {provider === "auto" && <p className="mt-1">Режим auto: Cloudflare AI, затем GigaChat.</p>}
      </div>
      <div className={"rounded-xl border p-4 text-sm " + (ingestReady ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]")}>
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

    {(error || note) && <div className={"rounded-xl border bg-white p-3 text-sm " + (error ? "text-[var(--status-critical-fg)]" : "text-gray-700")}>{error || note}</div>}

    <TelegramChats
      chats={chats}
      groups={groups}
      busy={busy}
      onBind={(chat, groupId) => void bind(chat, groupId)}
    />

    <TelegramMessages
      messages={messages}
      chats={chats}
      chatFilter={chatFilter}
      publishing={publishing}
      onSelectChat={selectChat}
      onPublish={(message) => void publish(message)}
      chatTitle={chatTitle}
    />

    <div className="rounded-xl border bg-slate-50 p-4 text-sm text-gray-600">
      <b>Важно:</b> для автоматического чтения обычных сообщений учебной группы Telegram бот должен получать все сообщения. Privacy Mode по умолчанию ограничивает такие обновления; для этого сценария его нужно отключить в @BotFather или добавить бота администратором.
    </div>
  </div>;
}
