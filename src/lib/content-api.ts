import { api, getTrainerImageUrl } from "@/lib/api";

export type SubjectMaterial = { id:string; subject_id:string; subject_name?:string|null; subject_slug?:string|null; type:string; title:string; content_html?:string|null; external_url?:string|null; source_key?:string|null; order_index?:number|null; module_id?:string|null; topic_id?:string|null; };
export type TrainerCard = { id:string; subject_id?:string|null; subject_slug:string; specialty_slug?:string|null; mode_set?:string; preparation?:{name?:string;organ?:string;imagePath?:string}; hotspots?:unknown[]; question?:{prompt?:string;mode?:string;explanation?:string;allowSkip?:boolean;options?:Array<{id:string;label:string;correct?:boolean}>}; tags?:string[]; difficulty?:number|null; source_key?:string|null; };

export async function listSubjectMaterials(params:{subjectId?:string;subjectSlug?:string;type?:string}={}){
  const q=new URLSearchParams(); if(params.subjectId)q.set("subject_id",params.subjectId); if(params.subjectSlug)q.set("subject_slug",params.subjectSlug); if(params.type)q.set("type",params.type);
  const s=q.toString()?("?"+q.toString()):""; return api<{items:SubjectMaterial[];source:string}>("/subject-materials"+s);
}
export async function getContentSource(id:string){return api<{source:{id:string;title:string;source_path:string;mime_type?:string|null;original_format?:string|null;source_archive?:string|null;note?:string|null}}>(`/content-sources/${encodeURIComponent(id)}`)}
export async function listTrainerFeed(subject="histology",specialty="mbh",limit=50,offset=0){const q=new URLSearchParams({subject,specialty,limit:String(limit),offset:String(offset)});return api<{items:TrainerCard[];limit:number;offset:number;source:string}>(`/trainers/feed?${q.toString()}`)}
export async function submitTrainerAnswer(payload:{card_id:string;option_id?:string;answer_text?:string;is_skipped?:boolean;time_ms?:number}){return api<{answer:Record<string,unknown>;correct:boolean|null}>("/trainers/feed/answer",{method:"POST",body:JSON.stringify(payload)})}