"use client";

import { useEffect, useState } from "react";
import { Bot, RefreshCw, Link2, CheckCircle2, AlertCircle } from "lucide-react";
import { adminBindTelegramChat, adminSetTelegramWebhook, adminTelegramChats, listGroups, type TelegramAdminChat } from "@/lib/api";
import { describeApiError } from "@/lib/errors";

type Group = { id:string; name?:string; code?:string };

export default function AdminTelegramPage(){
  const [chats,setChats]=useState<TelegramAdminChat[]>([]);
  const [groups,setGroups]=useState<Group[]>([]);
  const [busy,setBusy]=useState(false);
  const [note,setNote]=useState<string|null>(null);

  async function reload(){
    setBusy(true); setNote(null);
    try{
      const [c,g]=await Promise.all([adminTelegramChats(),listGroups()]);
      if(c.ok) setChats(c.data.items||[]); else setNote(describeApiError(c.error));
      if(g.ok) setGroups((g.data.items||[]) as Group[]);
    }catch(e){setNote(e instanceof Error?e.message:"Ошибка загрузки");}
    finally{setBusy(false);}
  }

  useEffect(()=>{reload()},[]);

  async function bind(chat:TelegramAdminChat,groupId:string){
    if(!groupId)return;
    setBusy(true); setNote(null);
    const r=await adminBindTelegramChat(chat.telegram_chat_id,groupId);
    if(r.ok){setChats(prev=>prev.map(x=>x.telegram_chat_id===chat.telegram_chat_id?r.data.chat:x));setNote("Группа Telegram привязана к учебной группе.");}
    else setNote(describeApiError(r.error));
    setBusy(false);
  }

  async function webhook(){
    setBusy(true); setNote(null);
    const r=await adminSetTelegramWebhook();
    if(r.ok) setNote("Webhook настроен: "+r.data.url);
    else setNote(describeApiError(r.error));
    setBusy(false);
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900">Telegram → задания</h1><p className="mt-1 text-sm text-gray-500">Привязка чатов групп и проверка webhook.</p></div>
      <div className="flex gap-2">
        <button onClick={reload} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50"><RefreshCw className={"h-4 w-4 "+(busy?"animate-spin":"")}/> Обновить</button>
        <button onClick={webhook} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50"><Bot className="h-4 w-4"/> Настроить webhook</button>
      </div>
    </div>

    {note && <div className="rounded-xl border bg-white p-3 text-sm text-gray-700">{note}</div>}

    <div className="card overflow-hidden">
      <div className="border-b px-4 py-3 font-semibold">Обнаруженные Telegram-чаты</div>
      {chats.length===0 ? <div className="p-8 text-center text-sm text-gray-500"><AlertCircle className="mx-auto mb-2 h-6 w-6"/>Пока нет чатов. Добавь бота в учебную группу и отправь новое сообщение.</div> :
        <div className="divide-y">{chats.map(chat=><div key={chat.telegram_chat_id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="font-medium">{chat.telegram_title || "Без названия"}</div><div className="mt-1 text-xs text-gray-500">{chat.telegram_chat_type} · ID {chat.telegram_chat_id}</div><div className="mt-2 text-xs">{chat.is_verified && chat.group_name ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4"/> {chat.group_name}{chat.group_code?" · "+chat.group_code:""}</span> : <span className="text-amber-700">Не привязан</span>}</div></div>
          <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-gray-400"/><select defaultValue={chat.group_id||""} disabled={busy} onChange={e=>bind(chat,e.target.value)} className="min-w-64 rounded-lg border bg-white px-3 py-2 text-sm"><option value="">Выбрать учебную группу…</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name||g.id}{g.code?" · "+g.code:""}</option>)}</select></div>
        </div>)}</div>}
    </div>

    <div className="rounded-xl border bg-slate-50 p-4 text-sm text-gray-600"><b>Важно:</b> для автоматического чтения обычных сообщений учебной группы Telegram бот должен получать все сообщения. Privacy Mode по умолчанию ограничивает такие обновления; для этого сценария его нужно отключить в @BotFather или добавить бота администратором.</div>
  </div>;
}
