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
export async function presenceHeartbeat(){return api<any>("/presence/heartbeat",{method:"POST",body:"{}"})}
export async function adminPresence(within=180){return api<any>("/admin/presence?within="+encodeURIComponent(String(within)))} 
export async function listSubjects(course?:number,semester?:number){const q=new URLSearchParams();if(course!=null)q.set("course",String(course));if(semester!=null)q.set("semester",String(semester));return api<any>(`/subjects${q.toString()?`?${q}`:""}`)}
export async function listGroups(){return api<any>("/groups")}
export type ApiTest=any;
export async function listTests(subjectId?:string){return api<any>(`/tests${subjectId?`?subject_id=${encodeURIComponent(subjectId)}`:""}`)}
export async function getTest(id:string){return api<any>(`/tests/${id}`)}
export async function listMyAttempts(subjectId?:string){const q=subjectId?`?subject_id=${encodeURIComponent(subjectId)}`:"";return api<any>(`/my/attempts${q}`)}
export async function startTestAttempt(id:string){return api<any>(`/tests/${id}/start`,{method:"POST",body:"{}"})}
export async function finishAttempt(id:string,score?:number,maxScore?:number){return api<any>(`/tests/attempts/${id}/finish`,{method:"POST",body:JSON.stringify({score,max_score:maxScore})})}
export async function listHomeworks(){return api<any>("/homeworks")}
export async function submitHomework(id:string,textAnswer?:string,fileId?:string){return api<any>(`/homeworks/${id}/submit`,{method:"POST",body:JSON.stringify({text_answer:textAnswer,file_id:fileId})})}
export async function uploadFile(file:File,groupId?:string,specialtySlug?:string){const fd=new FormData();fd.append("file",file);if(groupId)fd.append("group_id",groupId);if(specialtySlug)fd.append("specialty_slug",specialtySlug);return api<any>("/files/upload",{method:"POST",body:fd})}
export async function fetchMaterialFile(id:string):Promise<Blob|null>{
  if(typeof window==="undefined") return null;
  const token=getToken();
  try{
    let res=await fetch(`${API_URL}/materials/${encodeURIComponent(id)}/file`,{headers:token?{Authorization:`Bearer ${token}`}:{},cache:"no-store"});
    if(res.status===401){
      const refreshToken=getRefreshToken();
      if(refreshToken){
        const rr=await fetch(`${API_URL}/auth/refresh`,{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({refresh_token:refreshToken}),cache:"no-store"});
        if(rr.ok){
          const parsed=JSON.parse(await rr.text()) as {data?:{access_token?:string;refresh_token?:string}};
          if(parsed.data?.access_token){
            setTokens(parsed.data.access_token,parsed.data.refresh_token);
            res=await fetch(`${API_URL}/materials/${encodeURIComponent(id)}/file`,{headers:{Authorization:`Bearer ${parsed.data.access_token}`},cache:"no-store"});
          }
        }
      }
    }
    if(!res.ok)return null;
    const blob=await res.blob();
    return blob.size?blob:null;
  }catch{return null;}
}

export async function getTrainerFeed(subject="histology",specialty="mbh",limit=30,offset=0){const q=new URLSearchParams({subject,specialty,limit:String(limit),offset:String(offset)});return api<any>(`/trainers/feed?${q}`)}
export async function answerTrainerCard(payload:any){return api<any>("/trainers/feed/answer",{method:"POST",body:JSON.stringify(payload)})}
export async function listSessions(status?:string){return api<any>(`/sessions${status?`?status=${encodeURIComponent(status)}`:""}`)}
export async function createSession(payload:Record<string,unknown>){return api<any>("/sessions",{method:"POST",body:JSON.stringify(payload)})}
export async function updateSession(id:string,payload:Record<string,unknown>){return api<any>(`/sessions/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(payload)})}
export async function listSchedule(from?:string,to?:string){const q=new URLSearchParams();if(from)q.set("from",from);if(to)q.set("to",to);return api<any>(`/schedule${q.toString()?`?${q}`:""}`)}
export async function getDashboard(){return api<any>("/dashboard")}
export async function getProgress(subjectId?:string){const q=subjectId?`?subject_id=${encodeURIComponent(subjectId)}`:"";return api<any>(`/progress${q}`)}
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

export async function adminDbAudit(limit = 200): Promise<any> { return api("/admin/db/audit?limit=" + encodeURIComponent(String(limit))) as any; }
export async function adminDbDelete(table:string,id:string): Promise<any> { return api("/admin/db/" + encodeURIComponent(table) + "/" + encodeURIComponent(id), { method:"DELETE" }) as any; }
export async function adminDbDeleteByKey(table:string,key:Record<string,unknown>): Promise<any> { return api("/admin/db/" + encodeURIComponent(table) + "/row", { method:"DELETE", body:JSON.stringify({key}) }) as any; }
export async function adminDbInsert(table:string,row:Record<string,unknown>): Promise<any> { return api("/admin/db/" + encodeURIComponent(table), { method:"POST", body:JSON.stringify(row) }) as any; }
export async function adminDbList(table:string,limit=200): Promise<any> { return api("/admin/db/" + encodeURIComponent(table) + "?limit=" + encodeURIComponent(String(limit))) as any; }
export async function adminDbMeta(..._args: any[]): Promise<any> { return api("/admin/db/meta") as any; }
export async function adminDbUpdate(table:string,id:string,payload:Record<string,unknown>): Promise<any> { return api("/admin/db/" + encodeURIComponent(table) + "/" + encodeURIComponent(id), { method:"PATCH", body:JSON.stringify(payload) }) as any; }
export async function adminDbUpdateByKey(table:string,key:Record<string,unknown>,payload:Record<string,unknown>): Promise<any> { return api("/admin/db/" + encodeURIComponent(table) + "/row", { method:"PATCH", body:JSON.stringify({key,row:payload}) }) as any; }
export async function adminBindTelegramChat(chatId:string|number,groupId:string): Promise<any> { return api("/admin/telegram/chats/" + encodeURIComponent(String(chatId)) + "/bind", { method:"POST", body:JSON.stringify({group_id:groupId}) }) as any; }
export async function adminContentArchive(table:string,id:string): Promise<any> { return api("/admin/content/archive", { method:"POST", body:JSON.stringify({table,id}) }) as any; }
export async function adminContentMove(table:string,id:string,payload:Record<string,unknown>={}): Promise<any> { return api("/admin/content/move", { method:"POST", body:JSON.stringify({table,id,...payload}) }) as any; }
export async function adminContentImport(payload:Record<string,unknown>): Promise<any> { return api("/admin/content/import", { method:"POST", body:JSON.stringify(payload) }) as any; }
export async function adminCreateAnnouncement(title:string,body:string,pinned=false): Promise<any> { return api("/admin/announcements", { method:"POST", body:JSON.stringify({title,body,pinned}) }) as any; }
export async function adminCreateHomework(payload:Record<string,unknown>): Promise<any> { return api("/admin/homeworks", { method:"POST", body:JSON.stringify(payload) }) as any; }
export async function adminCreateQuestion(payload:Record<string,unknown>): Promise<any> { return api("/admin/questions", { method:"POST", body:JSON.stringify(payload) }) as any; }
export async function adminCreateWork(payload:Record<string,unknown>): Promise<any> { return api("/admin/problem-center/work", { method:"POST", body:JSON.stringify(payload) }) as any; }
export async function adminDeleteAnnouncement(id:string): Promise<any> { return api("/admin/announcements/" + encodeURIComponent(id), { method:"DELETE" }) as any; }
export async function adminDeleteCommunity(id:string): Promise<any> { return api("/admin/community/" + encodeURIComponent(id), { method:"DELETE" }) as any; }
export async function adminDeleteHomework(id:string): Promise<any> { return api("/admin/homeworks/" + encodeURIComponent(id), { method:"DELETE" }) as any; }
export async function adminDeleteLecture(id:string): Promise<any> { return api("/admin/lectures/" + encodeURIComponent(id), { method:"DELETE" }) as any; }
export async function adminDeleteMaterial(id:string): Promise<any> { return api("/admin/materials/" + encodeURIComponent(id), { method:"DELETE" }) as any; }
export async function adminDeleteQuestion(id:string): Promise<any> { return api("/admin/questions/" + encodeURIComponent(id), { method:"DELETE" }) as any; }
export async function adminGenerateLecture(payload:Record<string,unknown>): Promise<any> { return api("/admin/lectures/generate", { method:"POST", body:JSON.stringify(payload) }) as any; }
export async function adminImportContentPackage(payload:Record<string,unknown>): Promise<any> { return api("/admin/content/package/import", { method:"POST", body:JSON.stringify(payload) }) as any; }
export async function adminListAnnouncements(): Promise<any> { return api("/admin/announcements") as any; }
export async function adminListCommunity(): Promise<any> { return api("/admin/community") as any; }
export async function adminListHomeworks(): Promise<any> { return api("/admin/homeworks") as any; }
export async function adminListLectures(status?:string,subject?:string): Promise<any> { const q=new URLSearchParams(); if(status)q.set("status",status); if(subject)q.set("subject",subject); return api("/admin/lectures" + (q.toString()?"?"+q:"")) as any; }
export async function adminListMaterials(): Promise<any> { return api("/admin/materials") as any; }
export async function adminListQuestions(params:Record<string,unknown>={}): Promise<any> { const q=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{if(v!=null&&v!=="")q.set(k,String(v))}); return api("/admin/questions" + (q.toString()?"?"+q:"")) as any; }
export async function adminListSchedule(groupId?:string,semester?:number): Promise<any> { const q=new URLSearchParams(); if(groupId)q.set("group_id",groupId); if(semester!=null)q.set("semester",String(semester)); return api("/admin/schedule" + (q.toString()?"?"+q:"")) as any; }
export async function adminListUsers(): Promise<any> { return api("/admin/users") as any; }
export async function adminOverview(): Promise<any> { return api("/admin/overview") as any; }
export async function adminProblemCenter(): Promise<any> { return api("/admin/problem-center") as any; }
export async function adminPublishLecture(id:string): Promise<any> { return api("/admin/lectures/" + encodeURIComponent(id) + "/publish", {method:"POST",body:"{}"}) as any; }
export async function adminRejectLecture(id:string): Promise<any> { return api("/admin/lectures/" + encodeURIComponent(id) + "/reject", {method:"POST",body:"{}"}) as any; }
export async function adminSaveSchedule(payload:Record<string,unknown>): Promise<any> { return api("/admin/schedule", { method:"PUT", body:JSON.stringify(payload) }) as any; }
export async function adminSetTelegramWebhook(): Promise<any> { return api("/admin/telegram/set-webhook", { method:"POST", body:"{}" }) as any; }
export async function adminSetUserRole(userId:string,role:string,action="assign"): Promise<any> { return api("/admin/users/roles", { method:"POST", body:JSON.stringify({user_id:userId,role,action}) }) as any; }
export async function adminTelegramChats(): Promise<any> { return api("/admin/telegram/chats") as any; }
export async function adminUpdateCommunity(id:string,payload:Record<string,unknown>): Promise<any> { return api("/admin/community/" + encodeURIComponent(id), { method:"PATCH", body:JSON.stringify(payload) }) as any; }
export async function adminUpdateLecture(id:string,payload:Record<string,unknown>): Promise<any> { return api("/admin/lectures/" + encodeURIComponent(id), { method:"PATCH", body:JSON.stringify(payload) }) as any; }
export async function adminUpdateQuestion(id:string,payload:Record<string,unknown>): Promise<any> { return api("/admin/questions/" + encodeURIComponent(id), { method:"PUT", body:JSON.stringify(payload) }) as any; }
export async function adminUpdateBankQuestion(id:string,payload:Record<string,unknown>): Promise<any> { return api("/admin/question-bank/" + encodeURIComponent(id), { method:"PUT", body:JSON.stringify(payload) }) as any; }
export async function adminUpdateQuestionReport(id:string,status:string): Promise<any> { return api("/admin/question-reports/" + encodeURIComponent(id), { method:"PATCH", body:JSON.stringify({status}) }) as any; }
export async function adminUpdateSite(site:Record<string,unknown>): Promise<any> { return api("/admin/site", { method:"PUT", body:JSON.stringify(site) }) as any; }
export async function adminUpdateWork(id:string,payload:Record<string,unknown>): Promise<any> { return api("/admin/problem-center/work/" + encodeURIComponent(id), { method:"PATCH", body:JSON.stringify(payload) }) as any; }
export async function createCommunityPost(title:string,body:string): Promise<any> { return api("/community/posts", { method:"POST", body:JSON.stringify({title,body}) }) as any; }
export async function createGroup(payload:Record<string,unknown>): Promise<any> { return api("/groups", { method:"POST", body:JSON.stringify(payload) }) as any; }
export async function createSubject(payload:Record<string,unknown>): Promise<any> { return api("/subjects", { method:"POST", body:JSON.stringify(payload) }) as any; }
export async function deleteGroup(id:string): Promise<any> { return api("/groups/" + encodeURIComponent(id), { method:"DELETE" }) as any; }
export async function deleteSubject(id:string): Promise<any> { return api("/subjects/" + encodeURIComponent(id), { method:"DELETE" }) as any; }
export async function finishPreparation(sessionId:string): Promise<any> { return api("/tests/preparation/" + encodeURIComponent(sessionId) + "/finish", {method:"POST",body:"{}"}) as any; }
export async function generateTicket(bankId:string,count=3,mode="practice"): Promise<any> { return api("/tickets/generate", {method:"POST",body:JSON.stringify({bank_id:bankId,count,mode})}) as any; }
export async function getFile(id:string): Promise<any> { return api("/files/" + encodeURIComponent(id)) as any; }
export async function getLecture(id:string): Promise<any> { return api("/lectures/" + encodeURIComponent(id)) as any; }
export async function getLessonPlan(params:Record<string,unknown>={}): Promise<any> { const q=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{if(v!=null&&v!=="")q.set(k,String(v))}); return api("/lesson-plan" + (q.toString()?"?"+q:"")) as any; }
export async function getPreparation(sessionId:string): Promise<any> { return api("/tests/preparation/" + encodeURIComponent(sessionId)) as any; }
export async function getQuestion(id:string): Promise<any> { return api("/questions/" + encodeURIComponent(id)) as any; }
export async function getScheduleMeta(course?:number,semester?:number): Promise<any> { const q=new URLSearchParams(); if(course!=null)q.set("course",String(course)); if(semester!=null)q.set("semester",String(semester)); return api("/schedule/meta" + (q.toString()?"?"+q:"")) as any; }
export async function getSubjectGradebook(id:string): Promise<any> { const clean=String(id??"").trim(); if(!clean) return { ok:false, error:{code:"VALIDATION_ERROR",message:"subject id required"}, requestId:"client" }; return api("/subjects/" + encodeURIComponent(clean) + "/gradebook") as any; }
export async function listCommunityPosts(..._args: any[]): Promise<any> { return api("/community/posts") as any; }
export async function listLectures(subject?:string): Promise<any> { const q=subject?"?subject="+encodeURIComponent(subject):""; return api("/lectures"+q) as any; }
export async function listQuestionSubjects(..._args: any[]): Promise<any> { return api("/questions/subjects") as any; }
export async function listQuestions(params:Record<string,unknown>={}): Promise<any> { const q=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{if(v!=null&&v!=="")q.set(k,String(v))}); return api("/questions"+(q.toString()?"?"+q:"")) as any; }
export async function listSubjectsCatalog(..._args: any[]): Promise<any> { return api("/subjects-catalog") as any; }
export async function listTicketBanks(..._args: any[]): Promise<any> { return api("/tickets") as any; }
export async function getSubjectPlan(slug:string): Promise<any> { const clean=String(slug??"").trim(); if(!clean) return { ok:false, error:{code:"VALIDATION_ERROR",message:"subject slug required"}, requestId:"client" }; return api("/subject-plans/" + encodeURIComponent(clean)) as any; }
export async function preparationAiReview(sessionId:string): Promise<any> { return api("/tests/preparation/" + encodeURIComponent(sessionId) + "/ai-review", {method:"POST",body:"{}"}) as any; }
export async function register(email:string,password:string,fullName:string): Promise<any> { return api("/auth/register", { method:"POST", body:JSON.stringify({email,password,full_name:fullName}) }) as any; }
export async function reportQuestion(questionId:string,category:string,message=""): Promise<any> { return api("/questions/" + encodeURIComponent(questionId) + "/report", { method:"POST", body:JSON.stringify({category,message}) }) as any; }
export async function savePreparation(sessionId:string,payload:Record<string,unknown>): Promise<any> { return api("/tests/preparation/" + encodeURIComponent(sessionId), {method:"PATCH",body:JSON.stringify(payload)}) as any; }
export async function startPreparation(testId:string,mode:"full"|"count"|"sequential"="full",questionLimit?:number): Promise<any> { return api("/tests/" + encodeURIComponent(testId) + "/preparation/start", {method:"POST",body:JSON.stringify({mode,question_limit:questionLimit})}) as any; }
export async function getBankProgress(testId:string): Promise<any> { return api("/tests/" + encodeURIComponent(testId) + "/bank-progress") as any; }
export async function updateGroup(id:string,payload:Record<string,unknown>): Promise<any> { return api("/groups/" + encodeURIComponent(id), { method:"PATCH", body:JSON.stringify(payload) }) as any; }
export async function updateSubject(id:string,payload:Record<string,unknown>): Promise<any> { return api("/subjects/" + encodeURIComponent(id), { method:"PATCH", body:JSON.stringify(payload) }) as any; }
