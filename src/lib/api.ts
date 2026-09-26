/** API client for SpaceWeb backend — restored exports for Vercel. */
const API_URL="/api/v1";
export type ApiSuccess<T>={ok:true;data:T;requestId:string};
export type ApiError={ok:false;error:{code:string;message:string;details?:unknown};requestId:string};
export type ApiResult<T>=ApiSuccess<T>|ApiError;
export type AcademicState = {
  profile?: any;
  session: any;
  plan: any;
  metrics: any;
  debts: any[];
  upcoming: any[];
  weak_topics: any[];
  recommendations: any[];
  states?: any[];
  topic_progress?: any[];
  generated_at?: string;
};
function getToken(){if(typeof window==="undefined")return null;const t=localStorage.getItem("mb_access_token");return t&&t.trim()?t.trim():null}
function getRefreshToken(){if(typeof window==="undefined")return null;const t=localStorage.getItem("mb_refresh_token");return t&&t.trim()?t.trim():null}
export function setTokens(access:string,refresh?:string){localStorage.setItem("mb_access_token",access);if(refresh)localStorage.setItem("mb_refresh_token",refresh)}
export function clearTokens(){localStorage.removeItem("mb_access_token");localStorage.removeItem("mb_refresh_token")}
export function hasToken(){return !!getToken()}
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

  const run=async()=>{
    let token=getToken();
    for(let attempt=0;attempt<3;attempt++){
      try{
        const bust=attempt===0?"":`?retry=${attempt}-${Date.now()}`;
        let res=await fetch(`${API_URL}/trainers/feed/${encodeURIComponent(key)}/image${bust}`,{
          headers:token?{Authorization:`Bearer ${token}`}:{},
          cache:attempt===0?"force-cache":"no-store",
        });
        if(res.status===401){
          const refreshToken=getRefreshToken();
          if(refreshToken){
            const rr=await fetch(`${API_URL}/auth/refresh`,{
              method:"POST",
              headers:{"Accept":"application/json","Content-Type":"application/json"},
              body:JSON.stringify({refresh_token:refreshToken}),
              cache:"no-store"
            });
            if(rr.ok){
              try{
                const parsed=JSON.parse(await rr.text()) as {data?:{access_token?:string;refresh_token?:string}};
                if(parsed.data?.access_token){
                  setTokens(parsed.data.access_token,parsed.data.refresh_token);
                  token=parsed.data.access_token;
                  res=await fetch(`${API_URL}/trainers/feed/${encodeURIComponent(key)}/image?retry=auth-${Date.now()}`,{
                    headers:{Authorization:`Bearer ${token}`},
                    cache:"no-store"
                  });
                }
              }catch{}
            }
          }
        }
        if(res.ok){
          const blob=await res.blob();
          if(blob.size>0){
            const url=URL.createObjectURL(blob);
            trainerImageCache.set(key,url);
            return url;
          }
        }
      }catch{}
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
    }
    return null;
  };
  const promise=run().finally(()=>{trainerImageInflight.delete(key);});
  trainerImageInflight.set(key,promise);
  return promise;
}
export async function retryTrainerImage(id:string):Promise<string|null>{
  if(typeof window==="undefined")return null;
  const key=String(id);
  const old=trainerImageCache.get(key);
  if(old){try{URL.revokeObjectURL(old);}catch{} trainerImageCache.delete(key);}
  trainerImageInflight.delete(key);
  return getTrainerImageUrl(key);
}
export function prefetchTrainerImages(ids:(string|null|undefined)[]):void{
  if(typeof window==="undefined")return;
  for(const id of ids){if(!id)continue;const key=String(id);if(trainerImageCache.has(key)||trainerImageInflight.has(key))continue;void getTrainerImageUrl(key);}
}
export function peekTrainerImageUrl(id: string): string | null { if (typeof window === "undefined") return null; return trainerImageCache.get(String(id)) ?? null; }
export async function login(email:string,password:string){return api<any>("/auth/login",{method:"POST",body:JSON.stringify({email,password})})}
export async function me(){return api<any>("/auth/me")}
export async function refreshSession(){const r=typeof window!=="undefined"?localStorage.getItem("mb_refresh_token"):null;if(!r)return{ok:false as const,error:{code:"NO_REFRESH_TOKEN",message:"Сессия требует повторного входа."},requestId:"client"};const res=await api<{access_token:string;refresh_token?:string}>("/auth/refresh",{method:"POST",body:JSON.stringify({refresh_token:r})});if(res.ok&&res.data.access_token)setTokens(res.data.access_token,res.data.refresh_token);return res}
export async function health(){return api<any>("/health")}
export async function listSubjects(course?:number,semester?:number){const q=new URLSearchParams();if(course!=null)q.set("course",String(course));if(semester!=null)q.set("semester",String(semester));return api<any>(`/subjects${q.toString()?`?${q}`:""}`)}
export async function listGroups(){return api<any>("/groups")}
export type ApiTest=any;
export async function listTests(subjectId?:string){return api<any>(`/tests${subjectId?`?subject_id=${encodeURIComponent(subjectId)}`:""}`)}
export async function getTest(id:string){return api<any>(`/tests/${id}`)}
export async function startTestAttempt(id:string){return api<any>(`/tests/${id}/start`,{method:"POST",body:"{}"})}
export async function finishAttempt(id:string,score?:number,maxScore?:number){return api<any>(`/tests/attempts/${id}/finish`,{method:"POST",body:JSON.stringify({score,max_score:maxScore})})}
export async function listHomeworks(){return api<any>("/homeworks")}
export async function submitHomework(id:string,textAnswer?:string,fileId?:string){return api<any>(`/homeworks/${id}/submit`,{method:"POST",body:JSON.stringify({text_answer:textAnswer,file_id:fileId})})}
export async function uploadFile(file:File,groupId?:string,specialtySlug?:string){const fd=new FormData();fd.append("file",file);if(groupId)fd.append("group_id",groupId);if(specialtySlug)fd.append("specialty_slug",specialtySlug);return api<any>("/files/upload",{method:"POST",body:fd})}
export async function getTrainerFeed(subject="histology",specialty="mbh",limit=30,offset=0){const q=new URLSearchParams({subject,specialty,limit:String(limit),offset:String(offset)});return api<any>(`/trainers/feed?${q}`)}
export async function answerTrainerCard(payload:any){return api<any>("/trainers/feed/answer",{method:"POST",body:JSON.stringify(payload)})}
export async function listSessions(status?:string){return api<any>(`/sessions${status?`?status=${encodeURIComponent(status)}`:""}`)}
export async function createSession(payload:Record<string,unknown>){return api<any>("/sessions",{method:"POST",body:JSON.stringify(payload)})}
export async function updateSession(id:string,payload:Record<string,unknown>){return api<any>(`/sessions/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(payload)})}
export async function listSchedule(from?:string,to?:string){const q=new URLSearchParams();if(from)q.set("from",from);if(to)q.set("to",to);return api<any>(`/schedule${q.toString()?`?${q}`:""}`)}
export async function getDashboard(){return api<any>("/dashboard")}
export async function getProgress(){return api<any>("/progress")}
export async function getCurriculum(){return api<any>("/curriculum")}
export async function getSubject(id:string){return api<any>(`/subjects/${id}`)}
export async function listMaterials(params:any={}){const q=new URLSearchParams();Object.entries(params||{}).forEach(([k,v])=>{if(v!=null&&v!=="")q.set(String(k),String(v))});return api<any>(`/materials${q.toString()?`?${q}`:""}`)}
export async function getAcademicState(){return api<AcademicState>("/academic/state")}
export async function generateAcademicAiPlan(){return api<{plan:any;items:any[];source_state:AcademicState}>("/academic/ai-plan",{method:"POST",body:"{}"})}
export type AdminDbRow = any;
export type AdminDbMeta = any;
export type AdminContentImportPayload = any;
export type ApiHomework = any;
export type ApiMaterial = any;
export type BankQuestion = any;
export type Lecture = any;
export type LectureListItem = any;
export type PreparationQuestion = any;
export type ScheduleItem = any;
export type ScheduleMeta = any;
export type SubjectPlan = any;
export type SubjectPlanWeek = any;
export type TelegramAdminChat = any;
export type TrainerFeedCard = any;
export async function adminDbTables(..._args: any[]): Promise<any> { return api(`/admin/db/tables`) as any; }
export async function adminDbAudit(..._args: any[]): Promise<any> { return api(`/admin/db/audit`) as any; }
export async function adminDbDelete(..._args: any[]): Promise<any> { return api(`/api-compat/adminDbDelete`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminDbDeleteByKey(..._args: any[]): Promise<any> { return api(`/api-compat/adminDbDeleteByKey`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminDbInsert(..._args: any[]): Promise<any> { return api(`/api-compat/adminDbInsert`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminDbList(..._args: any[]): Promise<any> { return api(`/api-compat/adminDbList`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminDbMeta(..._args: any[]): Promise<any> { return api(`/admin/db/meta`) as any; }
export async function adminDbUpdate(..._args: any[]): Promise<any> { return api(`/api-compat/adminDbUpdate`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminDbUpdateByKey(..._args: any[]): Promise<any> { return api(`/api-compat/adminDbUpdateByKey`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminBindTelegramChat(..._args: any[]): Promise<any> { return api(`/api-compat/adminBindTelegramChat`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminContentArchive(..._args: any[]): Promise<any> { return api(`/api-compat/adminContentArchive`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminContentImport(..._args: any[]): Promise<any> { return api(`/api-compat/adminContentImport`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminContentMove(..._args: any[]): Promise<any> { return api(`/api-compat/adminContentMove`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminCreateAnnouncement(..._args: any[]): Promise<any> { return api(`/api-compat/adminCreateAnnouncement`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminCreateHomework(..._args: any[]): Promise<any> { return api(`/api-compat/adminCreateHomework`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminCreateQuestion(..._args: any[]): Promise<any> { return api(`/api-compat/adminCreateQuestion`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminCreateWork(..._args: any[]): Promise<any> { return api(`/api-compat/adminCreateWork`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminDeleteAnnouncement(..._args: any[]): Promise<any> { return api(`/api-compat/adminDeleteAnnouncement`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminDeleteCommunity(..._args: any[]): Promise<any> { return api(`/api-compat/adminDeleteCommunity`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminDeleteHomework(..._args: any[]): Promise<any> { return api(`/api-compat/adminDeleteHomework`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminDeleteLecture(..._args: any[]): Promise<any> { return api(`/api-compat/adminDeleteLecture`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminDeleteMaterial(..._args: any[]): Promise<any> { return api(`/api-compat/adminDeleteMaterial`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminDeleteQuestion(..._args: any[]): Promise<any> { return api(`/api-compat/adminDeleteQuestion`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminGenerateLecture(..._args: any[]): Promise<any> { return api(`/api-compat/adminGenerateLecture`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminImportContentPackage(..._args: any[]): Promise<any> { return api(`/api-compat/adminImportContentPackage`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminListAnnouncements(..._args: any[]): Promise<any> { return api(`/api-compat/adminListAnnouncements`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminListCommunity(..._args: any[]): Promise<any> { return api(`/api-compat/adminListCommunity`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminListHomeworks(..._args: any[]): Promise<any> { return api(`/api-compat/adminListHomeworks`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminListLectures(..._args: any[]): Promise<any> { return api(`/api-compat/adminListLectures`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminListMaterials(..._args: any[]): Promise<any> { return api(`/api-compat/adminListMaterials`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminListQuestions(..._args: any[]): Promise<any> { return api(`/api-compat/adminListQuestions`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminListSchedule(..._args: any[]): Promise<any> { return api(`/api-compat/adminListSchedule`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminListUsers(..._args: any[]): Promise<any> { return api(`/api-compat/adminListUsers`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminOverview(..._args: any[]): Promise<any> { return api(`/api-compat/adminOverview`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminProblemCenter(..._args: any[]): Promise<any> { return api(`/api-compat/adminProblemCenter`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminPublishLecture(..._args: any[]): Promise<any> { return api(`/api-compat/adminPublishLecture`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminRejectLecture(..._args: any[]): Promise<any> { return api(`/api-compat/adminRejectLecture`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminSaveSchedule(..._args: any[]): Promise<any> { return api(`/api-compat/adminSaveSchedule`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminSetTelegramWebhook(..._args: any[]): Promise<any> { return api(`/api-compat/adminSetTelegramWebhook`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminSetUserRole(..._args: any[]): Promise<any> { return api(`/api-compat/adminSetUserRole`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminTelegramChats(..._args: any[]): Promise<any> { return api(`/api-compat/adminTelegramChats`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminUpdateCommunity(..._args: any[]): Promise<any> { return api(`/api-compat/adminUpdateCommunity`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminUpdateLecture(..._args: any[]): Promise<any> { return api(`/api-compat/adminUpdateLecture`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminUpdateQuestion(..._args: any[]): Promise<any> { return api(`/api-compat/adminUpdateQuestion`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminUpdateQuestionReport(..._args: any[]): Promise<any> { return api(`/api-compat/adminUpdateQuestionReport`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminUpdateSite(..._args: any[]): Promise<any> { return api(`/api-compat/adminUpdateSite`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function adminUpdateWork(..._args: any[]): Promise<any> { return api(`/api-compat/adminUpdateWork`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function claimAdmin(..._args: any[]): Promise<any> { return api(`/api-compat/claimAdmin`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function createCommunityPost(..._args: any[]): Promise<any> { return api(`/api-compat/createCommunityPost`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function createGroup(..._args: any[]): Promise<any> { return api(`/api-compat/createGroup`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function createSubject(..._args: any[]): Promise<any> { return api(`/api-compat/createSubject`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function deleteGroup(..._args: any[]): Promise<any> { return api(`/api-compat/deleteGroup`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function deleteSubject(..._args: any[]): Promise<any> { return api(`/api-compat/deleteSubject`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function finishPreparation(..._args: any[]): Promise<any> { return api(`/api-compat/finishPreparation`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function generateTicket(..._args: any[]): Promise<any> { return api(`/api-compat/generateTicket`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function getFile(..._args: any[]): Promise<any> { return api(`/api-compat/getFile`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function getLecture(..._args: any[]): Promise<any> { return api(`/api-compat/getLecture`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function getLessonPlan(..._args: any[]): Promise<any> { return api(`/api-compat/getLessonPlan`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function getPreparation(..._args: any[]): Promise<any> { return api(`/api-compat/getPreparation`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function getQuestion(..._args: any[]): Promise<any> { return api(`/api-compat/getQuestion`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function getScheduleMeta(..._args: any[]): Promise<any> { return api(`/api-compat/getScheduleMeta`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function getSubjectGradebook(..._args: any[]): Promise<any> { const id=String(_args[0]??"").trim(); if(!id) return { ok:false, error:{code:"VALIDATION_ERROR",message:"subject id required"}, requestId:"client" }; return api(`/subjects/${encodeURIComponent(id)}/gradebook`) as any; }
export async function getSubjectPlan(..._args: any[]): Promise<any> { const slug=String(_args[0]??"").trim(); if(!slug) return { ok:false, error:{code:"VALIDATION_ERROR",message:"subject slug required"}, requestId:"client" }; return api(`/subject-plans/${encodeURIComponent(slug)}`) as any; }
export async function getTrainer(..._args: any[]): Promise<any> { return api(`/api-compat/getTrainer`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function listCommunityPosts(..._args: any[]): Promise<any> { return api(`/api-compat/listCommunityPosts`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function listLectures(..._args: any[]): Promise<any> { return api(`/api-compat/listLectures`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function listQuestionSubjects(..._args: any[]): Promise<any> { return api(`/api-compat/listQuestionSubjects`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function listQuestions(..._args: any[]): Promise<any> { return api(`/api-compat/listQuestions`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function listSubjectsCatalog(..._args: any[]): Promise<any> { return api(`/subjects-catalog`) as any; }
export async function listTicketBanks(..._args: any[]): Promise<any> { return api(`/tickets`) as any; }
export async function listTrainers(..._args: any[]): Promise<any> { return api(`/api-compat/listTrainers`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function preparationAiReview(..._args: any[]): Promise<any> { return api(`/api-compat/preparationAiReview`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function register(..._args: any[]): Promise<any> { return api(`/api-compat/register`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function reportQuestion(..._args: any[]): Promise<any> { return api(`/api-compat/reportQuestion`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function savePreparation(..._args: any[]): Promise<any> { return api(`/api-compat/savePreparation`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function startPreparation(..._args: any[]): Promise<any> { return api(`/api-compat/startPreparation`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function updateGroup(..._args: any[]): Promise<any> { return api(`/api-compat/updateGroup`, { method: "POST", body: JSON.stringify(_args) }) as any; }
export async function updateSubject(..._args: any[]): Promise<any> { return api(`/api-compat/updateSubject`, { method: "POST", body: JSON.stringify(_args) }) as any; }
