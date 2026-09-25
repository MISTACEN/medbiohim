/** API client for SpaceWeb backend. */
const API_URL="/api/v1";
export type ApiSuccess<T>={ok:true;data:T;requestId:string};
export type ApiError={ok:false;error:{code:string;message:string;details?:unknown};requestId:string};
export type ApiResult<T>=ApiSuccess<T>|ApiError;
function getToken(){if(typeof window==="undefined")return null;const t=localStorage.getItem("mb_access_token");return t&&t.trim()?t.trim():null}
function getRefreshToken(){if(typeof window==="undefined")return null;const t=localStorage.getItem("mb_refresh_token");return t&&t.trim()?t.trim():null}
export function setTokens(access:string,refresh?:string){localStorage.setItem("mb_access_token",access);if(refresh)localStorage.setItem("mb_refresh_token",refresh)}
export function clearTokens(){localStorage.removeItem("mb_access_token");localStorage.removeItem("mb_refresh_token")}
async function request<T>(path:string,options:RequestInit={},tokenOverride?:string):Promise<{res:Response;text:string}>{const headers:Record<string,string>={Accept:"application/json",...(options.headers as Record<string,string>|undefined)};const isForm=typeof FormData!=="undefined"&&options.body instanceof FormData;if(options.body&&!isForm&&!headers["Content-Type"])headers["Content-Type"]="application/json";const token=tokenOverride??getToken();if(token)headers.Authorization=`Bearer ${token}`;const res=await fetch(`${API_URL}${path.startsWith("/")?path:`/${path}`}`,{...options,headers,cache:"no-store"});return{res,text:await res.text()}}
export async function api<T>(path:string,options:RequestInit={}):Promise<ApiResult<T>>{try{let {res,text}=await request<T>(path,options);if(res.status===401&&path!=="/auth/refresh"){const refreshToken=getRefreshToken();if(refreshToken){try{const rr=await fetch(`${API_URL}/auth/refresh`,{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({refresh_token:refreshToken}),cache:"no-store"});const rt=await rr.text();if(rr.ok){const parsed=JSON.parse(rt) as {ok?:boolean;data?:{access_token?:string;refresh_token?:string}};const access=parsed.data?.access_token;if(access){setTokens(access,parsed.data?.refresh_token);({res,text}=await request<T>(path,options,access));}}}catch{}}}try{return JSON.parse(text) as ApiResult<T>}catch{return{ok:false,error:{code:"BAD_RESPONSE",message:res.ok?"Сервер вернул не JSON":`HTTP ${res.status}`},requestId:res.headers.get("x-request-id")||"client"}}}catch{return{ok:false,error:{code:"NETWORK",message:"Сеть недоступна"},requestId:"client"}}}
const trainerImageCache=new Map<string,string>();
const trainerImageInflight=new Map<string,Promise<string|null>>();
export async function getTrainerImageUrl(id:string):Promise<string|null>{
  if(typeof window==="undefined")return null;
  const key=String(id);
  const cached=trainerImageCache.get(key);
  if(cached)return cached;
  const pending=trainerImageInflight.get(key);
  if(pending)return pending;
  const run=async():Promise<string|null=>{
    try{
      let token=getToken();
      let res=await fetch(`${API_URL}/trainers/feed/${encodeURIComponent(key)}/image`,{headers:token?{Authorization:`Bearer ${token}`}:{},cache:"force-cache"});
      if(res.status===401){
        const refreshToken=getRefreshToken();
        if(refreshToken){
          const rr=await fetch(`${API_URL}/auth/refresh`,{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({refresh_token:refreshToken}),cache:"no-store"});
          if(rr.ok){try{const parsed=JSON.parse(await rr.text()) as {data?:{access_token?:string;refresh_token?:string}};if(parsed.data?.access_token){setTokens(parsed.data.access_token,parsed.data.refresh_token);token=parsed.data.access_token;res=await fetch(`${API_URL}/trainers/feed/${encodeURIComponent(key)}/image`,{headers:{Authorization:`Bearer ${token}`},cache:"force-cache"});}}catch{}}
        }
      }
      if(!res.ok)return null;
      const url=URL.createObjectURL(await res.blob());
      trainerImageCache.set(key,url);
      return url;
    }catch{return null}
  };
  const promise=run().finally(()=>{trainerImageInflight.delete(key);});
  trainerImageInflight.set(key,promise);
  return promise;
}
export function prefetchTrainerImages(ids:(string|null|undefined)[]):void{
  if(typeof window==="undefined")return;
  for(const id of ids){if(!id)continue;const key=String(id);if(trainerImageCache.has(key)||trainerImageInflight.has(key))continue;void getTrainerImageUrl(key);}
}
export async function login(email:string,password:string){return api<{access_token:string;refresh_token:string;expires_in:number;user:{id:string;email:string};roles?:string[]}>("/auth/login",{method:"POST",body:JSON.stringify({email,password})})}
export async function me(){return api<{user:{id?:string;full_name?:string|null;email?:string|null;avatar_url?:string|null;group_id?:string|null;group_name?:string|null;group_code?:string|null;course_number?:number|null;semester?:number|null};roles?:string[];groups?:Array<{id:string;name:string;code?:string;course_number?:number|null}>;current_group?:{id:string;name:string;code?:string;course_number?:number|null}|null;course?:number|null;semester?:number|null}>("/auth/me")}
export async function refreshSession(){const refreshToken=typeof window!=="undefined"?localStorage.getItem("mb_refresh_token"):null;if(!refreshToken)return{ok:false as const,error:{code:"NO_REFRESH_TOKEN",message:"Сессия требует повторного входа."},requestId:"client"};const res=await api<{access_token:string;refresh_token?:string}>("/auth/refresh",{method:"POST",body:JSON.stringify({refresh_token:refreshToken})});if(res.ok&&res.data.access_token)setTokens(res.data.access_token,res.data.refresh_token);return res}
export async function health(){return api<{status:string;phase?:string}>("/health")}
export async function listSubjects(course?:number,semester?:number){const q=new URLSearchParams();if(course!=null)q.set("course",String(course));if(semester!=null)q.set("semester",String(semester));const qs=q.toString();return api<{items:Array<{id:string;name:string;course_number?:number;semester?:number;control_type?:string;slug?:string;lecture_hours?:number|null;practice_hours?:number|null;self_study_hours?:number|null;total_hours?:number|null;credits?:number|null}>}>(`/subjects${qs?`?${qs}`:""}`)}
export async function listGroups(){return api<{items:unknown[]}>("/groups")}
export type ApiTest={id:string;title?:string;name?:string;description?:string|null;subject_id?:string|null;subject_name?:string|null;questions_count?:number;type?:string;is_published?:boolean;source_key?:string|null;source_file_id?:string|null;source_file_name?:string|null};
export async function listTests(subjectId?:string){return api<{items:ApiTest[]}>(`/tests${subjectId?`?subject_id=${encodeURIComponent(subjectId)}`:""}`)}
export async function getTest(id:string){return api<{test:ApiTest;questions:Array<{id:string;body?:string;q?:string;options?:string[];difficulty?:number}>;answers_local?:Array<number|null>}>(`/tests/${id}`)}
export async function startTestAttempt(id:string){return api<{attempt:{id:string;status:string}}>(`/tests/${id}/start`,{method:"POST",body:"{}"})
}
export async function finishAttempt(id:string,score?:number,maxScore?:number){return api<{attempt:unknown}>(`/tests/attempts/${id}/finish`,{method:"POST",body:JSON.stringify({score,max_score:maxScore})})}
export type ApiHomeworkAttachment={file_id:string;name?:string|null;mime_type?:string|null;size_bytes?:number|null;attachment_type?:string;caption?:string|null;inline_view?:boolean;download_url?:string|null};
export type ApiHomework={id:string;title:string;description?:string|null;due_at?:string|null;subject_name?:string|null;submission_id?:string|null;submission_status?:string|null;grade?:number|null;submitted_at?:string|null;attachments?:ApiHomeworkAttachment[]};
export async function listHomeworks(){return api<{items:ApiHomework[]}>("/homeworks")}
export async function submitHomework(id:string,textAnswer?:string,fileId?:string){return api<{submission:unknown}>(`/homeworks/${id}/submit`,{method:"POST",body:JSON.stringify({text_answer:textAnswer,file_id:fileId})})}
export async function uploadFile(file:File,groupId?:string,specialtySlug?:string){const fd=new FormData();fd.append("file",file);if(groupId)fd.append("group_id",groupId);if(specialtySlug)fd.append("specialty_slug",specialtySlug);return api<{file:{id:string;object_key?:string;original_name?:string;specialty_slug?:string|null}}>("/files/upload",{method:"POST",body:fd})}
export async function getTrainerFeed(subject="histology",specialty="mbh",limit=30,offset=0){const q=new URLSearchParams({subject,specialty,limit:String(limit),offset:String(offset)});return api<{items:unknown[];limit:number;offset:number}>(`/trainers/feed?${q.toString()}`)}
export async function answerTrainerCard(payload:{card_id:string;option_id?:string;answer_text?:string;is_skipped?:boolean;time_ms?:number|null}){return api<{answer:unknown;correct:boolean|null}>("/trainers/feed/answer",{method:"POST",body:JSON.stringify(payload)})}
export async function listSessions(status?:string){const q=status?`?status=${encodeURIComponent(status)}`:"";return api<{items:Array<{id:string;type?:string;ref_id?:string;current_index?:number;status?:string}>}>(`/learning/sessions${q}`)}
export async function createSession(payload:Record<string,unknown>){return api<{session:{id:string}}>("/learning/sessions",{method:"POST",body:JSON.stringify(payload)})}
export async function updateSession(id:string,payload:Record<string,unknown>){return api<{session:unknown}>(`/learning/sessions/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(payload)})}
export async function listSchedule(from?:string,to?:string){const q=new URLSearchParams();if(from)q.set("from",from);if(to)q.set("to",to);const qs=q.toString();return api<{items:unknown[]}>(`/schedule${qs?`?${qs}`:""}`)}
export async function getDashboard(){return api<Record<string,unknown>>("/dashboard")}
export async function getProgress(){return api<Record<string,unknown>>("/progress")}
export async function getCurriculum(){return api<{items:unknown[]}>("/curriculum")}
export async function getSubject(id:string){return api<{subject:{id:string;name:string;slug?:string|null};modules?:unknown[]}>(`/subjects/${id}`)}
export async function listMaterials(params:{groupId?:string;subjectId?:string;subjectSlug?:string;type?:string;q?:string}={}){const q=new URLSearchParams();if(params.groupId)q.set("group_id",params.groupId);if(params.subjectId)q.set("subject_id",params.subjectId);if(params.subjectSlug)q.set("subject_slug",params.subjectSlug);if(params.type)q.set("type",params.type);if(params.q)q.set("q",params.q);const qs=q.toString();return api<{items:unknown[]}>(`/materials${qs?`?${qs}`:""}`)}
