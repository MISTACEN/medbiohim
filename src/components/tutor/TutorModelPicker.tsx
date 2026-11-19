"use client";

import { BrainCircuit, Check, ChevronDown } from "lucide-react";

import { PROVIDER_CAPABILITIES, PROVIDER_LABEL, PROVIDER_ORDER } from "./model";
import type { TutorChatView } from "./useTutorChat";

/** Селектор модели: провайдер + конкретная модель. */
export function TutorModelPicker({ chat }: { chat: TutorChatView }) {
  return (
    <div className="relative" ref={chat.pickerRef}>
      <button
        type="button"
        onClick={()=>chat.setPickerOpen(v=>!v)}
        aria-expanded={chat.pickerOpen}
        aria-haspopup="listbox"
        className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-semibold transition hover:border-[var(--primary)]/50"
      >
        <BrainCircuit className="h-4 w-4 text-[var(--primary)]" />
        <span className="max-w-[220px] truncate">{chat.provider==="auto"?"Авто":PROVIDER_LABEL[chat.provider]}{chat.model&&chat.provider!=="auto"&&chat.provider!=="custom"?` · ${chat.model}`:""}</span>
        <ChevronDown className={"h-3.5 w-3.5 text-[var(--muted)] transition "+(chat.pickerOpen?"rotate-180":"")} />
      </button>
      {chat.pickerOpen && (
        <div className="absolute left-0 top-full z-40 mt-1.5 max-h-[70vh] w-80 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-xl" role="listbox" aria-label="Выбор нейросети">
          {PROVIDER_ORDER.map(p=>{
            const m=p==="auto"||p==="custom"?null:chat.meta[p];
            const on=p==="auto"?true:p==="custom"?!!m?.available:!!m?.available;
            const models=p==="auto"||p==="custom"?[]:chat.modelsFor(p);
            const reason=m?.reason||null;
            return (
              <div key={p} className="rounded-xl px-1 py-1">
                <button
                  type="button"
                  role="option"
                  aria-selected={chat.provider===p}
                  disabled={!on}
                  onClick={()=>{chat.chooseProvider(p);chat.setPickerOpen(false);}}
                  className={"flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition disabled:opacity-40 "+(chat.provider===p?"bg-[var(--primary-soft)] font-semibold text-[var(--primary)]":"hover:bg-[var(--background)]")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {PROVIDER_LABEL[p]}
                      {chat.provider===p?<Check className="h-3.5 w-3.5"/>:null}
                    </span>
                    <span className="block truncate text-[11px] font-normal text-[var(--muted)]">
                      {p==="auto"?"платформа сама выберет доступную модель"
                        :p==="custom"?(m?.reason||"подключается в Настройках")
                        :reason?reason
                        :PROVIDER_CAPABILITIES[p]||(m?.model?`по умолчанию: ${m.model}`:"не настроен на сервере")}
                    </span>
                  </span>
                  <span className={"h-2 w-2 shrink-0 rounded-full "+(on?"bg-[var(--status-ok-fg)]":"bg-[var(--muted)]")}/>
                </button>
                {chat.provider===p&&models.length>0&&(
                  <div className="mt-1 flex flex-wrap gap-1 px-2.5 pb-1.5">
                    {models.map(mm=>(
                      <button
                        key={mm}
                        type="button"
                        onClick={()=>chat.setModel(mm)}
                        className={"rounded-full border px-2 py-0.5 text-[11px] font-semibold transition "+(chat.model===mm?"border-[var(--primary)] bg-[var(--primary)] text-white":"border-[var(--border)] text-[var(--muted)] hover:border-[var(--primary)]/60 hover:text-[var(--primary)]")}
                      >
                        {mm}
                      </button>
                    ))}
                    {!chat.model&&<span className="rounded-full px-2 py-0.5 text-[11px] text-[var(--muted)]">модель по умолчанию</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
