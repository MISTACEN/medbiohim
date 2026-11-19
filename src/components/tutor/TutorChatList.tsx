"use client";

import { Plus, Trash2 } from "lucide-react";

import { PROVIDER_LABEL } from "./model";
import type { TutorChatView } from "./useTutorChat";

/** Левая колонка: список чатов с провайдером/моделью и кнопкой удаления. */
export function TutorChatList({ chat }: { chat: TutorChatView }) {
  return (
    <aside className={"min-w-0 "+(chat.mobileList?"flex":"hidden lg:flex")}><div className="flex h-full min-h-0 w-full min-w-0 flex-col border-r border-[var(--border)] bg-[var(--background)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] p-3"><b className="text-sm">Мои чаты</b><button type="button" onClick={()=>void chat.newChat()} className="rounded-lg bg-[var(--primary)] p-2 text-white" aria-label="Новый чат"><Plus className="h-4 w-4"/></button></div>
      <div className="flex-1 overflow-y-auto p-2">
        {chat.items.map(c=>{
          const providerLabel=c.provider==="auto"?"Авто":PROVIDER_LABEL[c.provider]||c.provider;
          return <div key={c.id} className={"group mb-1 flex items-center gap-1 rounded-xl "+(chat.conversation?.id===c.id?"bg-[var(--primary-soft)]":"hover:bg-[var(--card)]")}>
            <button type="button" onClick={()=>void chat.loadConversation(c.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left"><div className="truncate text-sm font-medium">{c.title}</div><div className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{providerLabel}{c.model?" · "+c.model:""}</div></button>
            <button type="button" onClick={()=>void chat.removeChat(c.id)} className="mr-1 rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--status-critical-bg)] hover:text-[var(--status-critical-fg)]" aria-label={`Удалить чат ${c.title}`}><Trash2 className="h-3.5 w-3.5"/></button>
          </div>;
        })}
      </div>
    </div></aside>
  );
}
