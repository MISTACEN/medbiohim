"use client";

import { Loader2, Paperclip, Send, X } from "lucide-react";

import { AiQuickActions } from "@/components/study/AiQuickActions";

import { CHAT_TOOLS, PROVIDER_LABEL, VISION_PROVIDERS } from "./model";
import type { TutorChatView } from "./useTutorChat";

/** Композер: ошибка, вложение, фото, инструменты чата и поле отправки. */
export function TutorComposer({ chat }: { chat: TutorChatView }) {
  return (
    <div className="border-t border-[var(--border)] p-3 sm:p-4">
      {chat.error&&<div className="mb-2 rounded-lg bg-[var(--status-critical-bg)] px-3 py-2 text-sm text-[var(--status-critical-fg)]">{chat.error}</div>}
      {chat.attachFile&&(
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-soft)] px-3 py-1 font-semibold text-[var(--primary)]">
            📄 {chat.attachFile.name} · {(chat.attachFile.size/1024/1024).toFixed(1)} МБ
            {/^audio\//.test(chat.attachFile.type)||/\.(mp3|m4a|ogg|wav|webm)$/i.test(chat.attachFile.name)?" · аудио→расшифровка":chat.attachFile.type==="application/pdf"?" · PDF":/^image\//.test(chat.attachFile.type)?" · фото→OCR":" · текст"}
          </span>
          <span className="text-[var(--muted)]">Enter/отправить — сделаю конспект прямо здесь</span>
          <button type="button" onClick={()=>chat.setAttachFile(null)} className="rounded-full border border-[var(--border)] px-2 py-0.5 font-semibold text-[var(--muted)] hover:text-[var(--status-critical-fg)]" aria-label="Убрать файл">убрать</button>
        </div>
      )}
      {chat.images.length>0&&(
        <div className="mb-2 flex flex-wrap gap-2">
          {chat.images.map((img,i)=>(
            <div key={i} className="relative">
              <img src={img} alt={"фото "+(i+1)} className="h-16 w-16 rounded-lg border border-[var(--border)] object-cover"/>
              <button type="button" onClick={()=>chat.setImages((cur)=>cur.filter((_,j)=>j!==i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--status-critical-fg)] p-0.5 text-white" aria-label="Убрать фото"><X className="h-3 w-3"/></button>
            </div>
          ))}
          {!VISION_PROVIDERS.has(chat.provider)&&<p className="self-center text-xs text-[var(--status-warn-fg)]">Модель {PROVIDER_LABEL[chat.provider]} не видит картинки — переключитесь на Gemini, GPT или Свою модель.</p>}
        </div>
      )}
      {/* Инструменты чата: готовые инструкции (таблица/схема/формулы/карточки). */}
      <div className="mobile-scroll-x mb-2 flex flex-nowrap gap-1.5 overflow-x-auto pb-1 md:flex-wrap">
        {CHAT_TOOLS.map(({label,prompt})=>(
          <button key={label} type="button" onClick={()=>{ chat.setInput(prompt+ (chat.input.trim()? chat.input.trim() : "")); chat.inputRef.current?.focus(); }} className="shrink-0 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] transition hover:border-[var(--primary)]/60 hover:text-[var(--primary)]">
            {label}
          </button>
        ))}
      </div>
      <AiQuickActions topic={chat.input} onPrompt={(p) => { chat.setInput(p); chat.inputRef.current?.focus(); }} />
      <div className="flex gap-2"><input ref={chat.fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.txt,.md,audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav,.mp3,.m4a,.ogg,.wav,.webm,.pdf" className="hidden" onChange={(e)=>{chat.pickAttachment(e.target.files); e.currentTarget.value="";}}/><button type="button" onClick={()=>chat.fileRef.current?.click()} disabled={chat.loading||!chat.conversation} aria-label="Прикрепить фото" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--primary)]/60 hover:text-[var(--primary)] disabled:opacity-40"><Paperclip className="h-5 w-5"/></button><textarea ref={chat.inputRef} rows={2} value={chat.input} onChange={e=>chat.setInput(e.target.value)} onKeyDown={chat.onKeyDown} disabled={chat.loading||!chat.conversation} placeholder="Ваш вопрос… Enter — отправить" className="min-h-[48px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/30"/><button type="button" onClick={()=>void chat.send()} disabled={chat.loading||!chat.input.trim()||!chat.conversation} aria-label="Отправить" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white disabled:opacity-40">{chat.loading?<Loader2 className="h-5 w-5 animate-spin"/>:<Send className="h-5 w-5"/>}</button></div>
    </div>
  );
}
