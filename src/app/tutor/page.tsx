"use client";

/**
 * AI-тьютор: чат с историей на сервере, выбором нейросети (провайдер +
 * конкретная модель) и панелью модулей подготовки.
 *
 * Выбор модели: кастомный дропдаун вместо <select> — по провайдеру видны
 * статус (доступность/причина) и чипы моделей из /ai/providers (models[]).
 * Выбор сохраняется в чате (ai_conversations.provider + model), при отправке
 * уходит в /ai/conversations/:id/messages.
 *
 * Панель модулей: быстрые переходы в план подготовки, карточки/SRS, устный
 * экзамен, конспект из файла/аудио; блок «Подготовка ЦНС» включает предмет
 * physiology и стартовые вопросы из корпуса знаний ЦНС (RAG тьютора).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot, Loader2, Send, Sparkles, Plus, Trash2, ChevronLeft, ChevronDown,
  Check, BookOpenCheck, ListChecks, Mic, NotebookPen, GraduationCap, BrainCircuit, Paperclip, X,
} from "lucide-react";
import { aiConversations, aiCreateConversation, aiDeleteConversation, aiGetConversation, aiNotesFromFile, aiProviders, aiSendMessage, type AiChatMode, type AiConversation, type AiMessage, type AiProvider, type AiProviderMeta } from "@/lib/features-api";
import { createMyLecture } from "@/lib/api/myLectures";
import { AnswerSources } from "@/components/ai/AnswerSources";
import { TutorMarkdown } from "@/components/ai/TutorMarkdown";
import { listSubjectsCatalog } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { AiQuickActions } from "@/components/study/AiQuickActions";

const PROVIDER_LABEL: Record<AiProvider, string> = {
  auto: "Авто — лучший доступный",
  openai: "OpenAI",
  groq: "Groq",
  gigachat: "GigaChat",
  gemini: "Gemini",
  mistral: "Mistral",
  openrouter: "OpenRouter",
  custom: "Своя модель",
};

/** Порядок в дропдауне: авто, российский контур, глобальные, своя модель. */
const PROVIDER_ORDER: AiProvider[] = ["auto", "gigachat", "gemini", "groq", "mistral", "openai", "openrouter", "custom"];

/** Резервный список моделей, пока /ai/providers не отдал свой. */
const FALLBACK_MODELS: Partial<Record<AiProvider, string[]>> = {
  gigachat: ["GigaChat-2-Max", "GigaChat-2-Pro", "GigaChat-2", "GigaChat"],
  groq: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  gemini: ["gemini-3.6-flash", "gemini-2.0-flash"],
  mistral: ["mistral-small-latest", "mistral-medium-latest"],
  openai: ["gpt-4.1-mini", "gpt-4o-mini"],
};

/**
 * Что модель умеет в рамках нашего чата (честно и без маркетинга):
 * все — текст/таблицы/схемы mermaid в ответе; мультимодальность и рассуждения —
 * только у отдельных моделей. Изображения не генерирует никто из подключённых.
 */
const PROVIDER_CAPABILITIES: Partial<Record<AiProvider, string>> = {
  gigachat: "Русский язык, нормативка РФ · таблицы · без картинок",
  gemini: "Видит изображения · длинный контекст · из RU недоступен",
  groq: "Самый быстрый · reasoning-модель gpt-oss",
  mistral: "Быстрый, Европа · таблицы",
  openai: "Сильная универсальная · таблицы",
  openrouter: "Шлюз к сотням моделей",
  custom: "Ваша модель · возможности зависят от неё",
};

/** Инструменты чата: подставляют готовую инструкцию в поле ввода. */
const CHAT_TOOLS = [
  { label: "Таблица", prompt: "Оформи ответ таблицей в markdown: " },
  { label: "Схема", prompt: "Покажи схему/алгоритм mermaid-диаграммой: " },
  { label: "Формулы", prompt: "Объясни с формулами (LaTeX в $...$): " },
  { label: "Карточки", prompt: "Составь 5 пар вопрос–ответ для карточек по теме: " },
];

/** Стартовые вопросы блока «Подготовка ЦНС» — темы корпуса знаний ЦНС. */
const CNS_STARTERS = [
  "Объясни типы торможения в ЦНС и их медиаторы — по методичке",
  "ЭЭГ-ритмы: когда какой ритм и почему это любят спрашивать в тестах",
  "Проведи через ситуационную задачу по синаптической передаче",
  "Кратко: спинной мозг — проводящие пути и рефлексы",
  "ВНС: отличия симпатической и парасимпатической на уровне медиаторов",
];

const MODULE_LINKS = [
  { href: "/study#подготовка", label: "План подготовки", icon: ListChecks },
  { href: "/cards", label: "Карточки SRS", icon: BookOpenCheck },
  { href: "/cards?tab=packs", label: "Пак карточек по теме", icon: Sparkles },
  { href: "/tests/preparation", label: "Устный экзамен", icon: GraduationCap },
  { href: "__attach__", label: "Конспект из файла/аудио", icon: NotebookPen },
];

export default function TutorPage() {
  const [items,setItems]=useState<AiConversation[]>([]);
  const [conversation,setConversation]=useState<AiConversation|null>(null);
  const [messages,setMessages]=useState<AiMessage[]>([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [booting,setBooting]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [provider,setProvider]=useState<AiProvider>("auto");
  const [model,setModel]=useState<string>("");
  const [meta,setMeta]=useState<Partial<Record<AiProvider,AiProviderMeta>>>({});
  const [subjects,setSubjects]=useState<Array<{name:string;slug:string}>>([]);
  const [psRegionHint,setPsRegionHint]=useState(false);
  const [pickerOpen,setPickerOpen]=useState(false);
  // Фото (vision): data URL'ы — видят Gemini, OpenAI, Groq (vision-модели), BYOM.
  const [images,setImages]=useState<string[]>([]);
  const fileRef=useRef<HTMLInputElement>(null);
  // Файл-вложение (pdf/фото/аудио/текст) → конспект прямо в чате (без перехода на /study/import).
  const [attachFile,setAttachFile]=useState<File|null>(null);
  const [notesBusy,setNotesBusy]=useState(false);
  const [notesResult,setNotesResult]=useState<{ filename:string; notes:string; provider:string; model:string; savedId:string|null }|null>(null);
  const VISION_PROVIDERS=new Set<AiProvider>(["gemini","openai","groq","openrouter","custom"]);
  const [mobileList,setMobileList]=useState(true);
  const bottomRef=useRef<HTMLDivElement>(null);
  const pickerRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  // «Точный» держит ответ на лекциях предмета и корпусе ЦНС со сносками [N]; «Быстрый» — без RAG.
  const [mode,setMode]=useState<AiChatMode>("precise");
  const [subjectSlug,setSubjectSlug]=useState("");
  // iOS: клавиатура накрывает ввод — приподнимаем контейнер на её инсент.
  const keyboardInset = useKeyboardInset();

  const modelsFor = useCallback((p: AiProvider): string[] => {
    const fromApi = meta[p]?.models;
    if (fromApi?.length) return fromApi;
    return FALLBACK_MODELS[p] || [];
  }, [meta]);

  const loadConversation = useCallback(async (id:string)=>{
    setLoading(true); setError(null);
    const r=await aiGetConversation(id);
    setLoading(false);
    if(!r.ok){setError(describeApiError(r.error));return;}
    setConversation(r.data.conversation);
    setProvider(r.data.conversation.provider);
    setModel(r.data.conversation.model||"");
    setSubjectSlug(r.data.conversation.subject_slug||"");
    setMessages(r.data.messages.filter(m=>m.role!=="system"));
    setMobileList(false);
  }, []);

  // «Спросить тьютора» из поиска кладёт вопрос в sessionStorage — раньше он не читался.
  useEffect(() => {
    if (booting) return;
    let prefill = "";
    try {
      prefill = sessionStorage.getItem("tutor_prefill") || "";
      if (prefill) sessionStorage.removeItem("tutor_prefill");
    } catch { /* приватный режим — подсказку просто не показываем */ }
    if (!prefill.trim()) return;
    setInput((current) => (current.trim() ? current : prefill));
    inputRef.current?.focus();
  }, [booting]);

  const boot = useCallback(async ()=>{
    setBooting(true);
    const [cs,ps,ss]=await Promise.all([aiConversations(),aiProviders(),listSubjectsCatalog()]);
    if(ps.ok){
      setMeta(ps.data.providers);
      if (ps.data.providers.gemini?.available === false && ps.data.providers.gemini?.reason) setPsRegionHint(true);
      if (ps.data.providers.custom?.prefer_own) setProvider("custom");
    }
    if(ss.ok) {
      // В БД предмет может занимать несколько активных строк под одним слагом
      // (курсы/семестры) — в селекторе нужен один пункт на слаг, иначе React
      // падает на дублирующихся ключах.
      const seen = new Set<string>();
      const list = (ss.data.items || [])
        .map((s: any) => ({ name: String(s.name || ""), slug: String(s.slug || "").trim() }))
        .filter((s: { name: string; slug: string }): s is { name: string; slug: string } => Boolean(s.slug))
        .filter((s: { name: string; slug: string }) => (seen.has(s.slug) ? false : (seen.add(s.slug), true)));
      setSubjects(list);
    }
    if(!cs.ok){setError(describeApiError(cs.error));setBooting(false);return;}
    setItems(cs.data.items||[]);
    if(cs.data.items?.[0]) await loadConversation(cs.data.items[0].id);
    else {
      const created=await aiCreateConversation({provider:"auto"});
      if(created.ok){setItems([created.data.conversation]);await loadConversation(created.data.conversation.id);}
      else setError(describeApiError(created.error));
    }
    setBooting(false);
  }, [loadConversation]);

  useEffect(()=>{void boot();},[boot]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);
  // Дропдаун модели закрывается кликом вне.
  useEffect(()=>{
    if(!pickerOpen) return;
    function onDocClick(e:MouseEvent){
      if(pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown",onDocClick);
    return ()=>document.removeEventListener("mousedown",onDocClick);
  },[pickerOpen]);

  async function newChat(){
    const r=await aiCreateConversation({
      provider,
      ...(provider!=="auto"&&provider!=="custom"&&model?{model}:{}) as {model?:string},
      subject_slug:subjectSlug||undefined,
    });
    if(!r.ok){setError(describeApiError(r.error));return;}
    setItems(x=>[r.data.conversation,...x]);setConversation(r.data.conversation);setMessages([]);setMobileList(false);setError(null);
    setTimeout(()=>inputRef.current?.focus(),50);
  }

  async function removeChat(id:string){
    const r=await aiDeleteConversation(id);
    if(!r.ok){setError(describeApiError(r.error));return;}
    const next=items.filter(x=>x.id!==id);setItems(next);
    if(conversation?.id===id){
      if(next[0]) await loadConversation(next[0].id);
      else await newChat();
    }
  }

  /** Файл → конспект прямо в чате: расшифровка/OCR/текст → markdown. Результат
   * локальный (в истории чата не сохраняется), кнопки: сохранить как личную
   * лекцию или отправить в чат для обсуждения. */
  async function sendNotes(file: File){
    if(!conversation) return;
    setNotesBusy(true); setError(null); setNotesResult(null);
    setMessages(m=>[...m,{id:"local-"+Date.now(),role:"user",content:"📎 Конспект из файла: "+file.name,created_at:new Date().toISOString()}]);
    try{
      const content_base64=await fileToBase64(file);
      const r=await aiNotesFromFile({ content_base64, mime: file.type||"application/octet-stream", filename: file.name });
      if(!r.ok){ setError(describeApiError(r.error)); }
      else setNotesResult({ filename:file.name, notes:r.data.notes_markdown, provider:r.data.provider, model:r.data.model, savedId:null });
    }catch{ setError("Не удалось прочитать файл."); }
    setNotesBusy(false);
  }

  async function saveNotesAsLecture(){
    if(!notesResult) return;
    setNotesBusy(true);
    const slug=subjectSlug||undefined;
    const r=await createMyLecture({ title: "Конспект: "+notesResult.filename.replace(/\.[^.]+$/,""), subject_slug: slug, body_md: notesResult.notes, lesson_type: "lecture" });
    setNotesBusy(false);
    if(!r.ok){ setError(describeApiError(r.error)); return; }
    const id=String(r.data?.id || r.data?.lecture?.id || "");
    setNotesResult({ ...notesResult, savedId: id });
  }

  /** Отправить конспект в чат — он попадёт в историю, и его можно обсудить. */
  async function discussNotes(){
    if(!notesResult||!conversation) return;
    setInput(notesResult.notes.slice(0,12000));
    setNotesResult(null);
    inputRef.current?.focus();
  }

  async function send(){
    const q=input.trim();
    if(attachFile&&notesBusy===false){ const f=attachFile; setAttachFile(null); setInput(""); await sendNotes(f); return; }
    if(!q||loading||!conversation)return;
    setInput("");setError(null);setLoading(true);
    setMessages(m=>[...m,{id:"local-"+Date.now(),role:"user",content:q,created_at:new Date().toISOString()}]);
    const r=await aiSendMessage(conversation.id,q,provider,subjectSlug||undefined,mode,provider!=="auto"&&provider!=="custom"&&model?model:undefined,images.length?images:undefined);
    setImages([]);
    setLoading(false);
    if(!r.ok){setError(describeApiError(r.error));return;}
    setConversation(r.data.conversation);
    // Фактический провайдер/модель ответа могут отличаться от выбранных
    // (фолбэк) — синхронизируем селектор с тем, что реально ответило.
    setProvider(r.data.conversation.provider);
    setModel(r.data.conversation.model||"");
    setItems(x=>x.map(c=>c.id===conversation.id?r.data.conversation:c));
    setMessages(m=>[...m.filter(x=>!x.id.startsWith("local-")),r.data.user_message,r.data.assistant_message]);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^,]+,/, ""));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    });
  }

  function pickAttachment(files: FileList | null){
    if(!files||!files.length) return;
    const f=files[0];
    setError(null);
    const isImage=f.type.startsWith("image/");
    const isAudio=/^audio\//.test(f.type)||/\.(mp3|m4a|ogg|wav|webm)$/i.test(f.name);
    const limit=isAudio?4*1024*1024:8*1024*1024;
    if(f.size>limit){ setError(isAudio?"Аудио больше 4 МБ — сожмите запись (mp3 64 кбит/с ≈ 8 минут в 4 МБ).":"Файл больше 8 МБ — уменьшите фото или разберите PDF по частям."); return; }
    if(isImage&&VISION_PROVIDERS.has(provider)){ // фото → vision-режим (модель видит картинку)
      void (async()=>{
        const dataUrl=await fileToBase64(f);
        setImages((cur)=>[...cur,dataUrl].slice(0,4));
      })();
      return;
    }
    setImages([]); setAttachFile(f); setNotesResult(null); // pdf/фото/аудио/текст → конспект в чате
  }

  function onKeyDown(e:React.KeyboardEvent<HTMLTextAreaElement>){
    if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void send();}
  }

  function chooseProvider(p: AiProvider){
    setProvider(p);
    // Смена провайдера сбрасывает модель, если она из списка другого провайдера.
    if(p==="auto"||p==="custom") setModel("");
    else if(model && !modelsFor(p).includes(model)) setModel("");
    // Панель не закрываем, если у провайдера есть модели — иначе не выбрать
    // конкретную модель без второго открытия; закроется кликом вне.
    const hasModels = p!=="auto"&&p!=="custom"&&modelsFor(p).length>0;
    if(!hasModels) setPickerOpen(false);
  }

  function applyCnsStarter(question: string){
    setSubjectSlug("physiology");
    setInput(question);
    setMobileList(false);
    setTimeout(()=>inputRef.current?.focus(),50);
  }

  const anyPlatformAvailable = useMemo(
    () => ["gigachat","gemini","groq","mistral","openai","openrouter"].some((p) => meta[p as AiProvider]?.available),
    [meta],
  );
  const currentModels = provider!=="auto"&&provider!=="custom" ? modelsFor(provider) : [];

  if(booting) return <div className="flex h-[calc(100dvh-6rem)] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]"/></div>;

  return (
    <div className="mx-auto flex h-[calc(100dvh-5.5rem)] max-w-6xl flex-col gap-3" style={keyboardInset ? { height: `calc(100dvh - 5.5rem - ${keyboardInset}px)` } : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Bot className="h-7 w-7 text-[var(--primary)]"/>AI-тьютор</h1><p className="mt-1 text-sm text-[var(--muted)]">История сохраняется и восстанавливается после перезагрузки страницы.</p></div>
        <div className="flex items-center gap-1.5 text-xs">
          {PROVIDER_ORDER.filter(p=>p!=="auto"&&p!=="custom").map(p=>{
            const m=meta[p];
            const on=!!m?.available;
            return <span key={p} title={m?.reason||undefined} className={on?"rounded-full bg-[var(--status-ok-bg)] px-2.5 py-1 font-semibold text-[var(--status-ok-fg)]":"rounded-full bg-[var(--muted)]/20 px-2.5 py-1 text-[var(--muted)]"}>{PROVIDER_LABEL[p].split(" ")[0]} {on?"●":"○"}</span>;
          })}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm md:grid-cols-[280px_1fr]">
        <aside className={mobileList?"flex":"hidden md:flex"}><div className="flex h-full min-h-0 flex-col border-r border-[var(--border)] bg-[var(--background)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] p-3"><b className="text-sm">Мои чаты</b><button type="button" onClick={()=>void newChat()} className="rounded-lg bg-[var(--primary)] p-2 text-white" aria-label="Новый чат"><Plus className="h-4 w-4"/></button></div>
          <div className="flex-1 overflow-y-auto p-2">
            {items.map(c=>{
              const providerLabel=c.provider==="auto"?"Авто":PROVIDER_LABEL[c.provider]||c.provider;
              return <div key={c.id} className={"group mb-1 flex items-center gap-1 rounded-xl "+(conversation?.id===c.id?"bg-[var(--primary-soft)]":"hover:bg-[var(--card)]")}>
                <button type="button" onClick={()=>void loadConversation(c.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left"><div className="truncate text-sm font-medium">{c.title}</div><div className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{providerLabel}{c.model?" · "+c.model:""}</div></button>
                <button type="button" onClick={()=>void removeChat(c.id)} className="mr-1 rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--status-critical-bg)] hover:text-[var(--status-critical-fg)]" aria-label={`Удалить чат ${c.title}`}><Trash2 className="h-3.5 w-3.5"/></button>
              </div>;
            })}
          </div>
        </div></aside>
        <section className={mobileList?"hidden md:flex":"flex"}>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
              <button type="button" onClick={()=>setMobileList(true)} className="rounded-lg p-2 hover:bg-[var(--background)] md:hidden" aria-label="К списку чатов"><ChevronLeft className="h-4 w-4"/></button>

              {/* Селектор модели: провайдер + конкретная модель. */}
              <div className="relative" ref={pickerRef}>
                <button
                  type="button"
                  onClick={()=>setPickerOpen(v=>!v)}
                  aria-expanded={pickerOpen}
                  aria-haspopup="listbox"
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-semibold transition hover:border-[var(--primary)]/50"
                >
                  <BrainCircuit className="h-4 w-4 text-[var(--primary)]" />
                  <span className="max-w-[220px] truncate">{provider==="auto"?"Авто":PROVIDER_LABEL[provider]}{model&&provider!=="auto"&&provider!=="custom"?` · ${model}`:""}</span>
                  <ChevronDown className={"h-3.5 w-3.5 text-[var(--muted)] transition "+(pickerOpen?"rotate-180":"")} />
                </button>
                {pickerOpen && (
                  <div className="absolute left-0 top-full z-40 mt-1.5 max-h-[70vh] w-80 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-xl" role="listbox" aria-label="Выбор нейросети">
                    {PROVIDER_ORDER.map(p=>{
                      const m=p==="auto"||p==="custom"?null:meta[p];
                      const on=p==="auto"?true:p==="custom"?!!m?.available:!!m?.available;
                      const models=p==="auto"||p==="custom"?[]:modelsFor(p);
                      const reason=m?.reason||null;
                      return (
                        <div key={p} className="rounded-xl px-1 py-1">
                          <button
                            type="button"
                            role="option"
                            aria-selected={provider===p}
                            disabled={!on}
                            onClick={()=>{chooseProvider(p);setPickerOpen(false);}}
                            className={"flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition disabled:opacity-40 "+(provider===p?"bg-[var(--primary-soft)] font-semibold text-[var(--primary)]":"hover:bg-[var(--background)]")}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                {PROVIDER_LABEL[p]}
                                {provider===p?<Check className="h-3.5 w-3.5"/>:null}
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
                          {provider===p&&models.length>0&&(
                            <div className="mt-1 flex flex-wrap gap-1 px-2.5 pb-1.5">
                              {models.map(mm=>(
                                <button
                                  key={mm}
                                  type="button"
                                  onClick={()=>setModel(mm)}
                                  className={"rounded-full border px-2 py-0.5 text-[11px] font-semibold transition "+(model===mm?"border-[var(--primary)] bg-[var(--primary)] text-white":"border-[var(--border)] text-[var(--muted)] hover:border-[var(--primary)]/60 hover:text-[var(--primary)]")}
                                >
                                  {mm}
                                </button>
                              ))}
                              {!model&&<span className="rounded-full px-2 py-0.5 text-[11px] text-[var(--muted)]">модель по умолчанию</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] p-0.5 text-xs" role="group" aria-label="Режим ответа">
                {([["precise","Точный"],["fast","Быстрый"]] as const).map(([value,label])=>(
                  <button key={value} type="button" onClick={()=>setMode(value)} aria-pressed={mode===value} title={value==="precise"?"Ответ по лекциям предмета и материалам ЦНС, со сносками [N]":"Быстрее, без поиска по лекциям"} className={"rounded-lg px-2.5 py-1.5 font-semibold transition "+(mode===value?"bg-[var(--primary)] text-white":"text-[var(--muted)] hover:text-[var(--primary)]")}>{label}</button>
                ))}
              </div>
              {!anyPlatformAvailable && (
                <span className="text-xs text-[var(--muted)]">Доступен только режим «Авто»: остальные модели не настроены на сервере.</span>
              )}
              <select value={subjectSlug} onChange={e=>setSubjectSlug(e.target.value)} className="min-w-[170px] rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" aria-label="Предмет"><option value="">Все предметы</option>{subjects.map(s=><option key={s.slug} value={s.slug}>{s.name}</option>)}</select>
              <span className="ml-auto truncate text-xs text-[var(--muted)]">{conversation?.title}</span>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {messages.length===0&&(
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
                        <button key={q} type="button" onClick={()=>applyCnsStarter(q)} className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] transition hover:border-[var(--primary)]/60 hover:text-[var(--primary)]">
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
              {messages.map(m=>(
                <div key={m.id} className={"flex "+(m.role==="user"?"justify-end":"justify-start")}>
                  <div className={"max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[82%] "+(m.role==="user"?"bg-[var(--primary)] text-white whitespace-pre-wrap":"border border-[var(--border)] bg-[var(--background)]")}>
                    {m.role==="assistant"?<TutorMarkdown content={m.content}/>:m.content}
                    {m.role==="assistant"?<AnswerSources sources={m.metadata?.sources}/>:null}
                    {m.model&&<div className="mt-2 text-[10px] opacity-60">{m.provider} · {m.model}</div>}
                  </div>
                </div>
              ))}
              {notesBusy&&<div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin"/>Читаю файл (фото → OCR, аудио → расшифровка, PDF → текст) и собираю конспект…</div>}
              {notesResult&&(
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="text-sm">📋 Конспект: {notesResult.filename}</b>
                    <span className="text-[10px] text-[var(--muted)]">{notesResult.provider} · {notesResult.model} · локально (в историю чата не пишется)</span>
                  </div>
                  <div className="mt-2 max-h-[360px] overflow-y-auto rounded-xl border border-[var(--border)] p-3"><TutorMarkdown content={notesResult.notes}/></div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {notesResult.savedId
                      ? <a href={"/lectures/"+encodeURIComponent(notesResult.savedId)} className="rounded-full bg-[var(--status-ok-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--status-ok-fg)]">Сохранено как личная лекция — открыть →</a>
                      : <button type="button" onClick={()=>void saveNotesAsLecture()} disabled={notesBusy} className="rounded-full border border-[var(--primary)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)] disabled:opacity-40">Сохранить как личную лекцию</button>}
                    <button type="button" onClick={()=>void discussNotes()} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--primary)]/60 hover:text-[var(--primary)]">Обсудить в чате ↓</button>
                  </div>
                </div>
              )}
              {loading&&<div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin"/>AI формирует ответ…</div>}<div ref={bottomRef}/>
            </div>
            <div className="border-t border-[var(--border)] p-3 sm:p-4">
              {error&&<div className="mb-2 rounded-lg bg-[var(--status-critical-bg)] px-3 py-2 text-sm text-[var(--status-critical-fg)]">{error}</div>}
              {attachFile&&(
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-soft)] px-3 py-1 font-semibold text-[var(--primary)]">
                    📄 {attachFile.name} · {(attachFile.size/1024/1024).toFixed(1)} МБ
                    {/^audio\//.test(attachFile.type)||/\.(mp3|m4a|ogg|wav|webm)$/i.test(attachFile.name)?" · аудио→расшифровка":attachFile.type==="application/pdf"?" · PDF":/^image\//.test(attachFile.type)?" · фото→OCR":" · текст"}
                  </span>
                  <span className="text-[var(--muted)]">Enter/отправить — сделаю конспект прямо здесь</span>
                  <button type="button" onClick={()=>setAttachFile(null)} className="rounded-full border border-[var(--border)] px-2 py-0.5 font-semibold text-[var(--muted)] hover:text-[var(--status-critical-fg)]" aria-label="Убрать файл">убрать</button>
                </div>
              )}
              {images.length>0&&(
                <div className="mb-2 flex flex-wrap gap-2">
                  {images.map((img,i)=>(
                    <div key={i} className="relative">
                      <img src={img} alt={"фото "+(i+1)} className="h-16 w-16 rounded-lg border border-[var(--border)] object-cover"/>
                      <button type="button" onClick={()=>setImages((cur)=>cur.filter((_,j)=>j!==i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--status-critical-fg)] p-0.5 text-white" aria-label="Убрать фото"><X className="h-3 w-3"/></button>
                    </div>
                  ))}
                  {!VISION_PROVIDERS.has(provider)&&<p className="self-center text-xs text-[var(--status-warn-fg)]">Модель {PROVIDER_LABEL[provider]} не видит картинки — переключитесь на Gemini, GPT или Свою модель.</p>}
                </div>
              )}
              {/* Инструменты чата: готовые инструкции (таблица/схема/формулы/карточки). */}
              <div className="mb-2 flex flex-wrap gap-1.5">
                {CHAT_TOOLS.map(({label,prompt})=>(
                  <button key={label} type="button" onClick={()=>{ setInput(prompt+ (input.trim()? input.trim() : "")); inputRef.current?.focus(); }} className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] transition hover:border-[var(--primary)]/60 hover:text-[var(--primary)]">
                    {label}
                  </button>
                ))}
              </div>
              <AiQuickActions topic={input} onPrompt={(p) => { setInput(p); inputRef.current?.focus(); }} />
              <div className="flex gap-2"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.txt,.md,audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav,.mp3,.m4a,.ogg,.wav,.webm,.pdf" className="hidden" onChange={(e)=>{pickAttachment(e.target.files); e.currentTarget.value="";}}/><button type="button" onClick={()=>fileRef.current?.click()} disabled={loading||!conversation} aria-label="Прикрепить фото" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--primary)]/60 hover:text-[var(--primary)] disabled:opacity-40"><Paperclip className="h-5 w-5"/></button><textarea ref={inputRef} rows={2} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKeyDown} disabled={loading||!conversation} placeholder="Ваш вопрос… Enter — отправить" className="min-h-[48px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/30"/><button type="button" onClick={()=>void send()} disabled={loading||!input.trim()||!conversation} aria-label="Отправить" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white disabled:opacity-40">{loading?<Loader2 className="h-5 w-5 animate-spin"/>:<Send className="h-5 w-5"/>}</button></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
