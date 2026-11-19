"use client";

import Link from "next/link";
import { BrainCircuit, Loader2, Sparkles } from "lucide-react";

import { AnswerSources } from "@/components/ai/AnswerSources";
import { TutorMarkdown } from "@/components/ai/TutorMarkdown";

import { CNS_STARTERS, MODULE_LINKS, stripInlineSourceList } from "./model";
import type { TutorChatView } from "./useTutorChat";

/** Лента сообщений: пустое состояние с модулями подготовки, сообщения и конспект из файла. */
export function TutorMessages({ chat }: { chat: TutorChatView }) {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      {chat.messages.length===0&&(
        <div className="mx-auto w-full max-w-2xl py-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)]"><Sparkles className="h-6 w-6 text-[var(--primary)]"/></div>
          <b>Начните диалог</b>
          <p className="mt-1 text-sm text-[var(--muted)]">Сообщения будут сохранены. Можно закрыть страницу и продолжить позже.</p>

          {/* Модули подготовки — переходы без выхода из тьютора. */}
          <div className="mt-5 flex flex-wrap justify-center gap-1.5">
            {MODULE_LINKS.map(({href,label,icon:Icon})=>(
              <Link key={href} href={href} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[11px] font-semibold transition hover:border-[var(--primary)]/60 hover:text-[var(--primary)]">
                <Icon className="h-4 w-4 shrink-0 text-[var(--primary)]" /> {label}
              </Link>
            ))}
          </div>

          {/* Подготовка ЦНС: включает предмет physiology — RAG подтянет корпус знаний ЦНС. */}
          <div className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-left">
            <p className="flex items-center gap-2 text-xs font-bold"><BrainCircuit className="h-4 w-4 text-[var(--primary)]" /> Подготовка к ЦНС</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Конспекты, шпаргалка и задачи из методички — тьютор отвечает со сносками на них. Нажмите тему:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CNS_STARTERS.map(q=>(
                <button key={q} type="button" onClick={()=>chat.applyCnsStarter(q)} className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] transition hover:border-[var(--primary)]/60 hover:text-[var(--primary)]">
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Возможности моделей — честная сводка, чтобы знать, что спрашивать. */}
          <details className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-left">
            <summary className="cursor-pointer text-xs font-bold">Что умеют модели в этом чате</summary>
            <ul className="mt-1.5 space-y-1 text-xs text-[var(--muted)]">
              <li>• <b className="text-[var(--foreground)]">Все модели</b>: текст, таблицы, списки, схемы mermaid и формулы — отрисовываются прямо в чате.</li>
              <li>• <b className="text-[var(--foreground)]">GigaChat</b>: лучший русский, нормативная база РФ. <b className="text-[var(--foreground)]">Groq</b>: самый быстрый, reasoning. <b className="text-[var(--foreground)]">Gemini</b>: видит картинки (из RU недоступен).</li>
              <li>• «Точный» режим отвечает по лекциям предмета и материалам ЦНС со сносками [N]; «Быстрый» — без базы.</li>
              <li>• Изображения не генерирует ни одна подключённая модель, но <b className="text-[var(--foreground)]">Gemini и GPT видят ваши картинки</b> — прикрепите фото кнопкой скрепки.</li>
            </ul>
          </details>
        </div>
      )}
      {chat.messages.map(m=>(
        <div key={m.id} className={"flex "+(m.role==="user"?"justify-end":"justify-start")}>
          <div className={"min-w-0 max-w-[92%] break-words rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[82%] "+(m.role==="user"?"bg-[var(--primary)] text-white whitespace-pre-wrap":"border border-[var(--border)] bg-[var(--background)]")}>
            {m.role==="assistant"?<TutorMarkdown content={m.metadata?.sources?stripInlineSourceList(m.content):m.content}/>:m.content}
            {m.role==="assistant"?<AnswerSources sources={m.metadata?.sources}/>:null}
            {m.model&&<div className="mt-2 text-[10px] opacity-60">{m.provider} · {m.model}</div>}
          </div>
        </div>
      ))}
      {chat.notesBusy&&<div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin"/>Читаю файл (фото → OCR, аудио → расшифровка, PDF → текст) и собираю конспект…</div>}
      {chat.notesResult&&(
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-sm">📋 Конспект: {chat.notesResult.filename}</b>
            <span className="text-[10px] text-[var(--muted)]">{chat.notesResult.provider} · {chat.notesResult.model} · локально (в историю чата не пишется)</span>
          </div>
          <div className="mt-2 max-h-[360px] overflow-y-auto rounded-xl border border-[var(--border)] p-3"><TutorMarkdown content={chat.notesResult.notes}/></div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {chat.notesResult.savedId
              ? <a href={"/lectures/"+encodeURIComponent(chat.notesResult.savedId)} className="rounded-full bg-[var(--status-ok-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--status-ok-fg)]">Сохранено как личная лекция — открыть →</a>
              : <button type="button" onClick={()=>void chat.saveNotesAsLecture()} disabled={chat.notesBusy} className="rounded-full border border-[var(--primary)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)] disabled:opacity-40">Сохранить как личную лекцию</button>}
            <button type="button" onClick={()=>void chat.discussNotes()} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--primary)]/60 hover:text-[var(--primary)]">Обсудить в чате ↓</button>
          </div>
        </div>
      )}
      {chat.loading&&<div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin"/>AI формирует ответ…</div>}<div ref={chat.bottomRef}/>
    </div>
  );
}
