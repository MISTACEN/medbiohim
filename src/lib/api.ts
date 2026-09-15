/**
 * API client for SpaceWeb backend.
 * On Vercel: NEXT_PUBLIC_API_URL=/api/v1 (same-origin proxy rewrite).
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "/api/v1";
export type ApiSuccess<T> = { ok: true; data: T; requestId: string };
export type ApiError = { ok: false; error: { code: string; message: string; details?: unknown }; requestId: string };
export type ApiResult<T> = ApiSuccess<T> | ApiError;
function getToken(): string | null { if (typeof window === "undefined") return null; return localStorage.getItem("mb_access_token"); }
export function setTokens(access: string, refresh?: string) { localStorage.setItem("mb_access_token", access); if (refresh) localStorage.setItem("mb_refresh_token", refresh); }
export function clearTokens() { localStorage.removeItem("mb_access_token"); localStorage.removeItem("mb_refresh_token"); }
export async function api<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const headers: Record<string,string> = { Accept:"application/json", ...(options.headers as Record<string,string>|undefined) };
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isForm && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const token=getToken(); if(token) headers.Authorization=`Bearer ${token}`;
  try { const res=await fetch(`${API_URL}${path.startsWith("/")?path:`/${path}`}`,{...options,headers}); const text=await res.text(); try{return JSON.parse(text) as ApiResult<T>}catch{return{ok:false,error:{code:"BAD_RESPONSE",message:res.ok?"Сервер вернул не JSON":`HTTP ${res.status}`},requestId:"client"}} }
  catch { return {ok:false,error:{code:"NETWORK",message:"Сеть недоступна"},requestId:"client"}; }
}
export async function login(email:string,password:string){return api<{access_token:string;refresh_token:string;expires_in:number;user:{id:string;email:string};roles?:string[]}>("/auth/login",{method:"POST",body:JSON.stringify({email,password})});}
export async function me(){return api<{user:unknown;roles?:string[];groups?:unknown[]}>("/auth/me");}
export async function refreshSession(){
  const refreshToken=typeof window!=="undefined"?localStorage.getItem("mb_refresh_token"):null;
  if(!refreshToken)return{ok:false as const,error:{code:"NO_REFRESH_TOKEN",message:"Сессия требует повторного входа."},requestId:"client"};
  const res=await api<{access_token:string;refresh_token?:string}>("/auth/refresh",{method:"POST",body:JSON.stringify({refresh_token:refreshToken})});
  if(res.ok&&res.data.access_token)setTokens(res.data.access_token,res.data.refresh_token); return res;
}
export async function health(){return api<{status:string;phase?:string}>("/health");}
export async function listSubjects(course?:number,semester?:number){const q=new URLSearchParams();if(course!=null)q.set("course",String(course));if(semester!=null)q.set("semester",String(semester));const qs=q.toString();return api<{items:Array<{id:string;name:string;course_number?:number;semester?:number;control_type?:string;}]}>(`/subjects${qs?`?${qs}`:""}`);}
export async function listGroups(){return api<{items:unknown[]}>("/groups");}
export type ApiTest={id:string;title?:string;name?:string;description?:string|null;subject_id?:string|null;subject_name?:string|null;questions_count?:number;type?:string;is_published?:boolean;};
export async function listTests(subjectId?:string){const qs=subjectId?`?subject_id=${encodeURIComponent(subjectId)}`:"";return api<{items:ApiTest[]}>(`/tests${qs}`);}
export async function getTest(id:string){return api<{test:ApiTest;questions:Array<{id:string;body?:string;q?:string;options?:string[];difficulty?:number}>;answers_local?:Array<number|null>}>(`/tests/${id}`);}
export async function startTestAttempt(testId:string){return api<{attempt:{id:string;status:string}}>(`/tests/${testId}/start`,{method:"POST",body:"{}"});}
export async function finishAttempt(attemptId:string,score?:number,maxScore?:number){return api<{attempt:unknown}>(`/tests/attempts/${attemptId}/finish`,{method:"POST",body:JSON.stringify({score,max_score:maxScore})});}
export type ApiHomework={id:string;title:string;description?:string|null;due_at?:string|null;subject_name?:string|null;submission_id?:string|null;submission_status?:string|null;grade?:number|null;submitted_at?:string|null;};
export async function listHomeworks(){return api<{items:ApiHomework[]}>("/homeworks");}
export async function submitHomework(id:string,textAnswer?:string,fileId?:string){return api<{submission:unknown}>(`/homeworks/${id}/submit`,{method:"POST",body:JSON.stringify({text_answer:textAnswer,file_id:fileId})});}
export async function uploadFile(file:File,groupId?:string){const fd=new FormData();fd.append("file",file);if(groupId)fd.append("group_id",groupId);return api<{file:{id:string;object_key?:string;original_name?:string}}>("/files/upload",{method:"POST",body:fd});}
export async function uploadFileBase64(originalName:string,mimeType:string,contentBase64:string){return api<{file:{id:string}}>("/files/upload",{method:"POST",body:JSON.stringify({original_name:originalName,mime_type:mimeType,content_base64:contentBase64})});}
export async function getFile(id:string){return api<{file:unknown;download?:{url?:string}}>(`/files/${id}`);}
export async function register(email:string,password:string,fullName?:string){return api<{access_token?:string|null;refresh_token?:string|null;needs_email_confirm?:boolean}>("/auth/register",{method:"POST",body:JSON.stringify({email,password,full_name:fullName})});}
export async function getSite(){return api<{site:Record<string,unknown>;announcements:Array<{id:string;title:string;body:string;pinned?:boolean}>}>("/site");}
export async function adminOverview(){return api<{site:Record<string,unknown>;counts:Record<string,number>}>("/admin/overview");}
export async function adminUpdateSite(data:Record<string,unknown>){return api<{site:Record<string,unknown>}>("/admin/site",{method:"PUT",body:JSON.stringify(data)});}
export async function adminListAnnouncements(){return api<{items:Array<{id:string;title:string;body:string;pinned?:boolean}>}>("/admin/announcements");}
export async function adminCreateAnnouncement(title:string,body:string,pinned?:boolean){return api<{item:{id:string}}>("/admin/announcements",{method:"POST",body:JSON.stringify({title,body,pinned})});}
export async function adminUpdateAnnouncement(id:string,patch:{title?:string;body?:string;pinned?:boolean}){return api<{item:unknown}>(`/admin/announcements/${id}`,{method:"PATCH",body:JSON.stringify(patch)});}
export async function adminDeleteAnnouncement(id:string){return api<{deleted:boolean}>(`/admin/announcements/${id}`,{method:"DELETE"});}
export async function createGroup(payload:{name:string;code?:string;course_number?:number}){return api<Record<string,unknown>>("/groups",{method:"POST",body:JSON.stringify(payload)});}
export async function createSubject(payload:{name:string;course_number?:number;semester?:number;control_type?:string}){return api<Record<string,unknown>>("/subjects",{method:"POST",body:JSON.stringify(payload)});}
export async function getDashboard(){return api<{profile:{user:{id:string;full_name?:string;email?:string};roles:string[];groups:Array<{id:string;name:string;code?:string}>};announcements:Array<{id:string;title:string;body:string}>;schedule:Array<Record<string,unknown>>;homeworks:Array<Record<string,unknown>>;tests:Array<Record<string,unknown>>}>("/dashboard");}
export type ScheduleItem={id:string;schedule_id?:string;group_id?:string;group_name?:string;group_code?:string;semester?:number|null;version?:number;subject_id?:string|null;subject_name?:string|null;date:string;start_time:string;end_time:string;type:string;room?:string|null;building?:string|null;notes?:string|null;is_cancelled?:boolean;};
export async function listSchedule(from?:string,to?:string){const q=new URLSearchParams();if(from)q.set("from",from);if(to)q.set("to",to);const qs=q.toString();return api<{items:ScheduleItem[]}>(`/schedule${qs?`?${qs}`:""}`);}
export async function adminListSchedule(groupId?:string,semester?:number){const q=new URLSearchParams();if(groupId)q.set("group_id",groupId);if(semester!=null)q.set("semester",String(semester));const qs=q.toString();return api<{items:ScheduleItem[]}>(`/admin/schedule${qs?`?${qs}`:""}`);}
export async function adminSaveSchedule(payload:{group_id:string;semester?:number|null;academic_year_id?:string|null;entries:Array<Partial<ScheduleItem>>}){return api<{schedule_id:string;group_id:string;semester:number|null;version:number;entries_saved:number}>("/admin/schedule",{method:"PUT",body:JSON.stringify(payload)});}
export async function listMaterials(groupId?:string){const q=groupId?`?group_id=${encodeURIComponent(groupId)}`:"";return api<{items:unknown[]}>(`/materials${q}`);}
export async function listCommunityPosts(){return api<{items:Array<{id:string;title:string;body:string;author_name?:string}>}>("/community/posts");}
export async function createCommunityPost(title:string,body:string){return api<{post:Record<string,unknown>}>("/community/posts",{method:"POST",body:JSON.stringify({title,body})});}
export async function getProgress(){return api<{homework:unknown;tests:unknown}>("/progress");}
export async function getSubject(id:string){return api<{subject:{id:string;name:string};modules?:unknown[]}>(`/subjects/${id}`);}
export async function claimAdmin(secret:string){return api<{roles:string[];message:string;session_refresh_required?:boolean;metadata_synced?:boolean}>("/admin/claim-admin",{method:"POST",body:JSON.stringify({secret})});}
export async function adminListUsers(){return api<{items:Array<{id:string;email?:string;full_name?:string;roles:string[]}>}>("/admin/users");}
export async function adminSetUserRole(userId:string,role:string,action:"assign"|"revoke"="assign"){return api<{roles:string[]}>("/admin/users/roles",{method:"POST",body:JSON.stringify({user_id:userId,role,action})});}
export async function adminGetCurriculum(){return api<{items:Array<Record<string,unknown>>}>("/admin/curriculum");}
export async function adminSaveCurriculum(items:Array<Record<string,unknown>>){return api<{items:Array<Record<string,unknown>}>("/admin/curriculum",{method:"PUT",body:JSON.stringify({items})});}
export async function adminGetTests(){return api<{items:Array<Record<string,unknown>>;db_items?:Array<Record<string,unknown>>}>("/admin/tests");}
export async function adminSaveTests(items:Array<Record<string,unknown>>){return api<{items:Array<Record<string,unknown>>}>("/admin/tests",{method:"PUT",body:JSON.stringify({items})});}
export async function getCurriculum(){return api<{items:Array<Record<string,unknown>>}>("/curriculum");}
export async function adminListHomeworks(){return api<{items:Array<Record<string,unknown>>}>("/admin/homeworks");}
export async function adminCreateHomework(payload:{title:string;description?:string;subject_id?:string;group_id?:string;due_at?:string}){return api<{item:Record<string,unknown>}>("/admin/homeworks",{method:"POST",body:JSON.stringify(payload)});}
export async function adminDeleteHomework(id:string){return api<{deleted:boolean}>(`/admin/homeworks/${id}`,{method:"DELETE"});}
export async function adminListMaterials(){return api<{items:Array<Record<string,unknown>>}>("/admin/materials");}
export async function adminDeleteMaterial(id:string){return api<{deleted:boolean}>(`/admin/materials/${id}`,{method:"DELETE"});}
export async function adminListCommunity(){return api<{items:Array<Record<string,unknown>>}>("/admin/community");}
export async function adminUpdateCommunity(id:string,patch:Record<string,unknown>){return api<{post:Record<string,unknown>}>(`/admin/community/${id}`,{method:"PATCH",body:JSON.stringify(patch)});}
export async function adminDeleteCommunity(id:string){return api<{deleted:boolean}>(`/admin/community/${id}`,{method:"DELETE"});}
export function hasToken():boolean{return !!getToken();}
