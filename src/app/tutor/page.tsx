"use client";

import { useEffect, useRef, useState } from "react";
import { aiConversations, aiCreateConversation, aiDeleteConversation, aiGetConversation, aiProviders, aiSendMessage, type AiConversation, type AiMessage, type AiProvider } from "@/lib/features-api";
import { listSubjectsCatalog } from "@/lib/api";
import { Bot, Loader2, Send, Sparkles, Plus, Trash2, ChevronLeft } from "lucide-react";

export default function TutorPage() {
  const [items,setItems]=useState<AiConversation[]>([]);
  const [conversation,setConversation]=useState<AiConversation|null>(null);
  const [messages,setMessages]=useState<AiMessage[]>([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [booting,setBooting]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [provider,setProvider]=useState<AiProvider>("auto");
  const [available,setAvailable]=useState({gigachat:false,gemini:false});
  const [subjects,setSubjects]=useState<Array<{name:string;slug:string}>>([]);
  const [subjectSlug,setSubjectSlug]=useState("");
  const [mobileList,setMobileList]=useState(true);
  const bottomRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);

  async function loadConversation(id:string){
    setLoading(true); setError(null);
    const r=await aiGetConversation(id);
    setLoading(false);
    if(!r.ok){setError(r.error.message);return;}
    setConversation(r.data.conversation);
    setProvider(r.data.conversation.provider);
    setSubjectSlug(r.data.conversation.subject_slug||"");
    setMessages(r.data.messages.filter(m=>m.role!=="system"));
    setMobileList(false);
  }

  async function boot(){
    setBooting(true);
    const [cs,ps,ss]=await Promise.all([aiConversations(),aiProviders(),listSubjectsCatalog()]);
    if(ps.ok) setAvailable({gigachat:!!ps.data.providers.gigachat?.configured,gemini:!!ps.data.providers.gemini?.configured});
    if(ss.ok) {
      const list = (ss.data.items || [])
        .map((s) => ({ name: s.name, slug: String(s.slug || "").trim() }))
        .filter((s): s is { name: string; slug: string } => Boolean(s.slug));
      setSubjects(list);
    }
    if(!cs.ok){setError(cs.error.message);setBooting(false);return;}
    setItems(cs.data.items||[]);
    if(cs.data.items?.[0]) await loadConversation(cs.data.items[0].id);
    else {
      const created=await aiCreateConversation({provider:"auto"});
      if(created.ok){setItems([created.data.conversation]);await loadConversation(created.data.conversation.id);}
      else setError(created.error.message);
    }
    setBooting(false);
  }

  useEffect(()=>{void boot();},[]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);

  async function newChat(){
    const r=await aiCreateConversation({provider,subject_slug:subjectSlug||undefined});
    if(!r.ok){setError(r.error.message);return;}
    setItems(x=>[r.data.conversation,...x]);setConversation(r.data.conversation);setMessages([]);setMobileList(false);setError(null);
    setTimeout(()=>inputRef.current?.focus(),50);
  }

  async function removeChat(id:string){
    const r=await aiDeleteConversation(id);
    if(!r.ok){setError(r.error.message);return;}
    const next=items.filter(x=>x.id!==id);setItems(next);
    if(conversation?.id===id){
      if(next[0]) await loadConversation(next[0].id);
      else await newChat();
    }
  }

  async function send(){
    const q=input.trim();
    if(!q||loading||!conversation)return;
    setInput("");setError(null);setLoading(true);
    setMessages(m=>[...m,{id:"local-"+Date.now(),role:"user",content:q,created_at:new Date().toISOString()}]);
    const r=await aiSendMessage(conversation.id,q,provider,subjectSlug||undefined);
    setLoading(false);
    if(!r.ok){setError(r.error.message);return;}
    setConversation(r.data.conversation);
    setItems(x=>x.map(c=>c.id===conversation.id?r.data.conversation:c));
    setMessages(m=>[...m.filter(x=>!x.id.startsWith("local-")),r.data.user_message,r.data.assistant_message]);
  }

  function onKeyDown(e:React.KeyboardEvent<HTMLTextAreaElement>){
    if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void send();}
  }

  if(booting) return <div className="flex h-[calc(100vh-6rem)] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]"/></div>;

  return (
    <div className="mx-auto flex h-[calc(100vh-5.5rem)] max-w-6xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Bot className="h-7 w-7 text-[var(--primary)]"/>AI-тьютор</h1><p className="mt-1 text-sm text-[var(--muted)]">История хранится в Supabase и восстанавливается после перезагрузки.</p></div>
        <div className="flex items-center gap-2 text-xs">
          <span className={available.gigachat?"rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700":"rounded-full bg-slate-100 px-2.5 py-1 text-slate-500"}>GigaChat {available.gigachat?"●":"○"}</span>
          <span className={available.gemini?"rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700":"rounded-full bg-slate-100 px-2.5 py-1 text-slate-500"}>Gemini {available.gemini?"●":"○"}</span>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm md:grid-cols-[280px_1fr]">
        <aside className={mobileList?"flex":"hidden md:flex"}><div className="flex h-full min-h-0 flex-col border-r border-[var(--border)] bg-[var(--background)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] p-3"><b className="text-sm">Мои чаты</b><button type="button" onClick={()=>void newChat()} className="rounded-lg bg-[var(--primary)] p-2 text-white"><Plus className="h-4 w-4"/></button></div>
          <div className="flex-1 overflow-y-auto p-2">
            {items.map(c=><div key={c.id} className={"group mb-1 flex items-center gap-1 rounded-xl "+(conversation?.id===c.id?"bg-[var(--primary-soft)]":"hover:bg-[var(--card)]")}>
              <button type="button" onClick={()=>void loadConversation(c.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left"><div className="truncate text-sm font-medium">{c.title}</div><div className="mt-0.5 text-[10px] text-[var(--muted)]">{c.provider==="auto"?"Авто":c.provider==="gigachat"?"GigaChat":"Gemini"}{c.model?" · "+c.model:""}</div></button>
              <button type="button" onClick={()=>void removeChat(c.id)} className="mr-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5"/></button>
            </div>)}
          </div>
        </div></aside>
        <section className={mobileList?"hidden md:flex":"flex"}>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
              <button type="button" onClick={()=>setMobileList(true)} className="rounded-lg p-2 hover:bg-[var(--background)] md:hidden"><ChevronLeft className="h-4 w-4"/></button>
              <select value={provider} onChange={e=>setProvider(e.target.value as AiProvider)} className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                <option value="auto">Авто: GigaChat → Gemini</option><option value="gigachat" disabled={!available.gigachat}>GigaChat</option><option value="gemini" disabled={!available.gemini}>Gemini</option>
              </select>
              <select value={subjectSlug} onChange={e=>setSubjectSlug(e.target.value)} className="min-w-[170px] rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">Все предметы</option>{subjects.map(s=><option key={s.slug} value={s.slug}>{s.name}</option>)}</select>
              <span className="ml-auto truncate text-xs text-[var(--muted)]">{conversation?.title}</span>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {messages.length===0&&<div className="flex h-full flex-col items-center justify-center py-16 text-center"><div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary-soft)]"><Sparkles className="h-8 w-8 text-[var(--primary)]"/></div><b>Начните диалог</b><p className="mt-2 max-w-md text-sm text-[var(--muted)]">Сообщения будут сохранены. Можно закрыть страницу и продолжить позже.</p></div>}
              {messages.map(m=><div key={m.id} className={"flex "+(m.role==="user"?"justify-end":"justify-start")}><div className={"max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[82%] "+(m.role==="user"?"bg-[var(--primary)] text-white":"border border-[var(--border)] bg-[var(--background)]")}>{m.content}{m.model&&<div className="mt-2 text-[10px] opacity-60">{m.provider} · {m.model}</div>}</div></div>)}
              {loading&&<div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin"/>AI формирует ответ…</div>}<div ref={bottomRef}/>
            </div>
            <div className="border-t border-[var(--border)] p-3 sm:p-4">
              {error&&<div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div className="flex gap-2"><textarea ref={inputRef} rows={2} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKeyDown} disabled={loading||!conversation} placeholder="Ваш вопрос… Enter — отправить" className="min-h-[48px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/30"/><button type="button" onClick={()=>void send()} disabled={loading||!input.trim()||!conversation} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white disabled:opacity-40">{loading?<Loader2 className="h-5 w-5 animate-spin"/>:<Send className="h-5 w-5"/>}</button></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
