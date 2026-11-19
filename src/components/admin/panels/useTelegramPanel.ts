"use client";

/** Telegram → задания: состояние и действия — чаты, привязка групп, публикации. */
import { useCallback, useEffect, useState } from "react";
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
import {
  type TelegramAiStatus,
  type TelegramGroup,
  type TelegramMessageRow,
} from "@/components/admin/panels/model";

export function useTelegramPanel() {
  const [chats, setChats] = useState<TelegramAdminChat[]>([]);
  const [groups, setGroups] = useState<TelegramGroup[]>([]);
  const [messages, setMessages] = useState<TelegramMessageRow[]>([]);
  const [aiStatus, setAiStatus] = useState<TelegramAiStatus | null>(null);
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
      if (groupsResult.ok) setGroups((groupsResult.data.items || []) as TelegramGroup[]);
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

  async function publish(message: TelegramMessageRow) {
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

  return {
    chats, groups, messages, aiStatus, chatFilter,
    busy, publishing, note, error,
    reload, selectChat, bind, webhook, publish,
    chatTitle, cloudflareAiReady, gigachatReady, provider, ingestReady,
  };
}
