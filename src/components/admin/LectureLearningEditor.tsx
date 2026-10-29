"use client";

import { useEffect, useMemo, useState } from "react";
import { FilePlus2, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { listSubjectMaterials, listTrainerFeed, type SubjectMaterial, type TrainerCard } from "@/lib/content-api";

type Subject = { slug: string; name: string };
type LearningItem = {
  material_id?: string;
  source_key?: string;
  title?: string;
  original_name?: string;
  original_format?: string;
  page_start?: number;
  page_end?: number;
  page_label?: string;
  exact_section?: string;
  page_note?: string;
  kind?: string;
  trainer_id?: string;
  name?: string;
  label?: string;
};

type LearningValue = {
  methodics?: LearningItem[];
  files?: LearningItem[];
  preparations?: LearningItem[];
  electronograms?: LearningItem[];
  [key: string]: unknown;
};

type Props = {
  value?: LearningValue | null;
  onChange: (value: LearningValue) => void;
  subject: Subject | null;
};

const emptyLearning: LearningValue = {
  methodics: [], files: [], preparations: [], electronograms: [],
};

function cloneValue(value?: LearningValue | null): LearningValue {
  return {
    ...emptyLearning,
    ...(value || {}),
    methodics: Array.isArray(value?.methodics) ? value!.methodics!.map((x)=>({...x})) : [],
    files: Array.isArray(value?.files) ? value!.files!.map((x)=>({...x})) : [],
    preparations: Array.isArray(value?.preparations) ? value!.preparations!.map((x)=>({...x})) : [],
    electronograms: Array.isArray(value?.electronograms) ? value!.electronograms!.map((x)=>({...x})) : [],
  };
}

export function LectureLearningEditor({value,onChange,subject}:Props) {
  const [local,setLocal] = useState<LearningValue>(()=>cloneValue(value));
  const [materials,setMaterials] = useState<SubjectMaterial[]>([]);
  const [trainer,setTrainer] = useState<TrainerCard[]>([]);
  const [loadingMaterials,setLoadingMaterials] = useState(false);
  const [loadingTrainer,setLoadingTrainer] = useState(false);
  const [picker,setPicker] = useState<"methodic"|"file"|"preparation"|"electronogram"|null>(null);
  const [query,setQuery] = useState("");

  useEffect(()=>{ setLocal(cloneValue(value)); },[value]);

  function commit(next:LearningValue){
    const normalized=cloneValue(next);
    setLocal(normalized);
    onChange(normalized);
  }

  async function openPicker(kind:"methodic"|"file"|"preparation"|"electronogram"){
    setPicker(kind);setQuery("");
    if(kind==="methodic"||kind==="file"){
      setLoadingMaterials(true);
      try{
        const r:any=await listSubjectMaterials({subjectSlug:subject?.slug || undefined});
        setMaterials(Array.isArray(r?.data?.items)?r.data.items:[]);
      }finally{setLoadingMaterials(false);}
    }else{
      setLoadingTrainer(true);
      try{
        const r:any=await listTrainerFeed(subject?.slug || "histology","mbh",500,0);
        setTrainer(Array.isArray(r?.data?.items)?r.data.items:[]);
      }finally{setLoadingTrainer(false);}
    }
  }

  function addMaterial(item:SubjectMaterial,kind:"methodic"|"file"){
    const next=cloneValue(local);
    const bucket=kind==="methodic"?"methodics":"files";
    const row:LearningItem={
      material_id:item.id,
      source_key:item.source_key || undefined,
      title:item.title,
      original_name:item.source?.name || item.title,
      original_format:item.source?.original_format || item.type,
      kind:item.type,
    };
    if(!next[bucket]!.some((x)=>x.material_id===row.material_id)) next[bucket]=[...(next[bucket]||[]),row];
    commit(next);setPicker(null);
  }

  function addTrainer(item:TrainerCard,kind:"preparation"|"electronogram"){
    const next=cloneValue(local);
    const bucket=kind==="preparation"?"preparations":"electronograms";
    const row:LearningItem={
      trainer_id:item.id,
      source_key:item.source_key || undefined,
      name:item.preparation?.name || item.id,
      label:item.preparation?.name || item.id,
    };
    if(!next[bucket]!.some((x)=>x.trainer_id===row.trainer_id)) next[bucket]=[...(next[bucket]||[]),row];
    commit(next);setPicker(null);
  }

  function updateItem(bucket:"methodics"|"files"|"preparations"|"electronograms",index:number,patch:Partial<LearningItem>){
    const next=cloneValue(local);
    next[bucket] = (next[bucket] || []).map((item,i)=>i===index?{...item,...patch}:item);
    commit(next);
  }

  function removeItem(bucket:"methodics"|"files"|"preparations"|"electronograms",index:number){
    const next=cloneValue(local);
    next[bucket]=(next[bucket]||[]).filter((_,i)=>i!==index);
    commit(next);
  }

  const filteredMaterials=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return materials.filter((m)=>!q||[
      m.title,m.type,m.source?.name,m.source_key,m.module_title,m.topic_title
    ].join(" ").toLowerCase().includes(q)).slice(0,80);
  },[materials,query]);

  const filteredTrainer=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return trainer.filter((item)=>{
      const mode=String(item.mode_set||"").toLowerCase();
      const isEm=mode==="electronogram";
      if(picker==="preparation"&&isEm)return false;
      if(picker==="electronogram"&&!isEm)return false;
      return !q||[
        item.id,item.preparation?.name,item.preparation?.organ,item.preparation?.stain,
        item.plan_topic_title,item.question?.prompt,...(item.tags||[])
      ].join(" ").toLowerCase().includes(q);
    }).slice(0,100);
  },[trainer,query,picker]);

  const Section=({title,bucket,addLabel,onAdd}:{
    title:string;bucket:"methodics"|"files"|"preparations"|"electronograms";addLabel:string;onAdd:()=>void
  })=><section className="rounded-2xl border border-[var(--border)] bg-white/60 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h4 className="text-sm font-bold">{title} ({local[bucket]?.length||0})</h4><p className="mt-0.5 text-[11px] text-[var(--muted)]">Эти связи сохраняются вместе с лекцией.</p></div>
      <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"><Plus className="h-3.5 w-3.5"/>{addLabel}</button>
    </div>
    <div className="mt-3 space-y-2">
      {(local[bucket]||[]).map((item,index)=><div key={(item.material_id||item.trainer_id||item.source_key||"row")+"-"+index} className="rounded-xl border border-[var(--border)] bg-slate-50/70 p-3">
        <div className="flex items-start gap-2">
          {bucket==="preparations"||bucket==="electronograms"?<ImagePlus className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-ok-fg)]"/>:<FilePlus2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600"/>}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">{item.original_name||item.title||item.name||item.label||"Связанный материал"}</div>
            {item.exact_section&&<div className="mt-1 text-[11px] text-[var(--muted)]">{item.exact_section}</div>}
            {(bucket==="methodics")&&<div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input value={item.page_start??""} onChange={(e)=>updateItem(bucket,index,{page_start:e.target.value?Number(e.target.value):undefined})} inputMode="numeric" className="rounded-lg border px-2 py-1.5 text-xs" placeholder="Стр. от"/>
              <input value={item.page_end??""} onChange={(e)=>updateItem(bucket,index,{page_end:e.target.value?Number(e.target.value):undefined})} inputMode="numeric" className="rounded-lg border px-2 py-1.5 text-xs" placeholder="Стр. до"/>
              <input value={item.page_label||""} onChange={(e)=>updateItem(bucket,index,{page_label:e.target.value})} className="rounded-lg border px-2 py-1.5 text-xs sm:col-span-2" placeholder="Например: стр. 13–24"/>
            </div>}
            {(bucket==="methodics")&&<><input value={item.exact_section||""} onChange={(e)=>updateItem(bucket,index,{exact_section:e.target.value})} className="mt-2 w-full rounded-lg border px-2 py-1.5 text-xs" placeholder="Точный раздел методички"/><input value={item.page_note||""} onChange={(e)=>updateItem(bucket,index,{page_note:e.target.value})} className="mt-2 w-full rounded-lg border px-2 py-1.5 text-xs" placeholder="Примечание по пагинации"/></>}
          </div>
          <button type="button" onClick={()=>removeItem(bucket,index)} className="rounded-lg p-1.5 text-[var(--status-critical-fg)] hover:bg-[var(--status-critical-bg)]" title="Удалить связь"><Trash2 className="h-3.5 w-3.5"/></button>
        </div>
      </div>)}
      {(local[bucket]?.length||0)===0&&<div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)]">Связей пока нет.</div>}
    </div>
  </section>;

  return <>
    <div className="mt-4 space-y-3 rounded-3xl border border-indigo-100 bg-indigo-50/30 p-4">
      <div><h3 className="text-sm font-extrabold text-indigo-900">Учебная связка лекции</h3><p className="mt-1 text-xs text-indigo-800/70">Здесь администратор управляет тем, что относится к этому пункту плана: методичка и страницы → схемы/файлы → препарат → ЭМ.</p></div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Методички" bucket="methodics" addLabel="Добавить методичку" onAdd={()=>void openPicker("methodic")}/>
        <Section title="Файлы и схемы" bucket="files" addLabel="Добавить файл" onAdd={()=>void openPicker("file")}/>
        <Section title="Препараты" bucket="preparations" addLabel="Добавить препарат" onAdd={()=>void openPicker("preparation")}/>
        <Section title="Электронограммы" bucket="electronograms" addLabel="Добавить ЭМ" onAdd={()=>void openPicker("electronogram")}/>
      </div>
    </div>

    {picker&&<div className="fixed inset-0 z-[10002] flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-wider text-indigo-600">Добавить связь</div><h3 className="text-lg font-extrabold">{picker==="methodic"?"Методичка":picker==="file"?"Файл / схема":picker==="preparation"?"Микропрепарат":"Электронограмма"}</h3></div><button type="button" onClick={()=>setPicker(null)} className="rounded-xl p-2 hover:bg-slate-100">×</button></div>
        <input value={query} onChange={(e)=>setQuery(e.target.value)} className="mt-4 w-full rounded-xl border p-3 text-sm" placeholder="Поиск по названию, теме, препарату…"/>
        <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto">
          {(picker==="methodic"||picker==="file") ? (
            loadingMaterials?<div className="p-6 text-center text-sm text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin"/></div>:
            filteredMaterials.map((item)=><button key={item.id} type="button" onClick={()=>addMaterial(item,picker)} className="w-full rounded-2xl border p-3 text-left hover:bg-indigo-50"><div className="text-sm font-semibold">{item.title}</div><div className="mt-1 text-[11px] text-slate-500">{item.type} · {item.source?.name||item.source_key||"без source key"} · {item.module_title||item.topic_title||""}</div></button>)
          ):(
            loadingTrainer?<div className="p-6 text-center text-sm text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin"/></div>:
            filteredTrainer.map((item)=><button key={item.id} type="button" onClick={()=>addTrainer(item,picker)} className="w-full rounded-2xl border p-3 text-left hover:bg-indigo-50"><div className="text-sm font-semibold">{item.preparation?.name||item.id}</div><div className="mt-1 text-[11px] text-slate-500">{item.preparation?.organ||""}{item.preparation?.stain?" · "+item.preparation.stain:""}{item.plan_topic_title?" · "+item.plan_topic_title:""}</div></button>)
          )}
        </div>
        <div className="mt-3 flex justify-end"><button type="button" onClick={()=>setPicker(null)} className="rounded-xl border px-4 py-2 text-sm">Закрыть</button></div>
      </div>
    </div>}
  </>;
}

export default LectureLearningEditor;
