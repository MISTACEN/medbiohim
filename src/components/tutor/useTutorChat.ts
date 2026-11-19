"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  aiConversations,
  aiCreateConversation,
  aiDeleteConversation,
  aiGetConversation,
  aiNotesFromFile,
  aiProviders,
  aiSendMessage,
  type AiChatMode,
  type AiConversation,
  type AiMessage,
  type AiProvider,
  type AiProviderMeta,
} from "@/lib/features-api";
import { createMyLecture } from "@/lib/api/myLectures";
import { listSubjectsCatalog } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";

import { FALLBACK_MODELS, VISION_PROVIDERS, type TutorNotesResult } from "./model";

/**
 * Данные и действия страницы AI-тьютора: история чатов, загрузка беседы,
 * отправка сообщений, конспект из файла и выбор провайдера/модели.
 * Разметка живёт в компонентах списка чатов, селектора модели, сообщений и композера.
 */
export function useTutorChat() {
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
  const [,setPsRegionHint]=useState(false);
  const [pickerOpen,setPickerOpen]=useState(false);
  // Фото (vision): data URL'ы — видят Gemini, OpenAI, Groq (vision-модели), BYOM.
  const [images,setImages]=useState<string[]>([]);
  const fileRef=useRef<HTMLInputElement>(null);
  // Файл-вложение (pdf/фото/аудио/текст) → конспект прямо в чате (без перехода на /study/import).
  const [attachFile,setAttachFile]=useState<File|null>(null);
  const [notesBusy,setNotesBusy]=useState(false);
  const [notesResult,setNotesResult]=useState<TutorNotesResult|null>(null);
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

  return {
    items, conversation, messages, input, setInput,
    loading, booting, error,
    provider, model, setModel, meta, subjects,
    pickerOpen, setPickerOpen, pickerRef,
    images, setImages, fileRef, attachFile, setAttachFile,
    notesBusy, notesResult, saveNotesAsLecture, discussNotes,
    mobileList, setMobileList, bottomRef, inputRef,
    mode, setMode, subjectSlug, setSubjectSlug,
    keyboardInset, modelsFor, anyPlatformAvailable,
    loadConversation, newChat, removeChat, send,
    pickAttachment, onKeyDown, chooseProvider, applyCnsStarter,
  };
}

export type TutorChatView = ReturnType<typeof useTutorChat>;
