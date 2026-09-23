/** API client for SpaceWeb backend. */
const API_URL="/api/v1";
export type ApiSuccess<T>={ok:true;data:T;requestId:string};
export type ApiError={ok:false;error:{code:string;message:string;details?:unknown};requestId:string};
export type ApiResult<T>=ApiSuccess<T>|ApiError;
function getToken(){if(typeof window==="undefined")return null;return localStorage.getItem("mb_access_token")}
export function setTokens(access:string,refresh?:string){localStorage.setItem("mb_access_token",access);if(refresh)localStorage.setItem("mb_refresh_token",refresh)}
export function clearTokens(){localStorage.removeItem("mb_access_token");localStorage.removeItem("mb_refresh_token")}
export async function api<T>(path:string,options:RequestInit={}):Promise<ApiResult<T>>{const headers:Record<string,string>={Accept:"application/json",...(options.headers as Record<string,string>|undefined)};const isForm=typeof FormData!=="undefined"&&options.body instanceof FormData;if(options.body&&!isForm&&!headers["Content-Type"])headers["Content-Type"]="application/json";const token=getToken();if(token)headers.Authorization=`Bearer ${token}`;try{const res=await fetch(`${API_URL}${path.startsWith("/")?path:`/${path}`}`,{...options,headers});const text=await res.text();try{return JSON.parse(text) as ApiResult<T>}catch{return{ok:false,error:{code:"BAD_RESPONSE",message:res.ok?"Сервер вернул не JSON":`HTTP ${res.status}`},requestId:"client"}}}catch{return{ok:false,error:{code:"NETWORK",message:"Сеть недоступна"},requestId:"client"}}}
export async function login(email:string,password:string){return api<{access_token:string;refresh_token:string;expires_in:number;user:{id:string;email:string};roles?:string[]}>("/auth/login",{method:"POST",body:JSON.stringify({email,password})})}
export async function me(){return api<{user:unknown;roles?:string[];groups?:unknown[]}>("/auth/me")}
export async function refreshSession(){const refreshToken=typeof window!=="undefined"?localStorage.getItem("mb_refresh_token"):null;if(!refreshToken)return{ok:false as const,error:{code:"NO_REFRESH_TOKEN",message:"Сессия требует повторного входа."},requestId:"client"};const res=await api<{access_token:string;refresh_token?:string}>("/auth/refresh",{method:"POST",body:JSON.stringify({refresh_token:refreshToken})});if(res.ok&&res.data.access_token)setTokens(res.data.access_token,res.data.refresh_token);return res}
export async function health(){return api<{status:string;phase?:string}>("/health")}
export async function listSubjects(course?:number,semester?:number){const q=new URLSearchParams();if(course!=null)q.set("course",String(course));if(semester!=null)q.set("semester",String(semester));const qs=q.toString();return api<{items:Array<{id:string;name:string;course_number?:number;semester?:number;control_type?:string;slug?:string;lecture_hours?:number|null;practice_hours?:number|null;self_study_hours?:number|null;total_hours?:number|null;credits?:number|null;slug?:string}>}>(`/subjects${qs?`?${qs}`:""}`)}
export async function listGroups(){return api<{items:unknown[]}>("/groups")}
export type ApiTest={id:string;title?:string;name?:string;description?:string|null;subject_id?:string|null;subject_name?:string|null;questions_count?:number;type?:string;is_published?:boolean};
export async function listTests(subjectId?:string){return api<{items:ApiTest[]}>(`/tests${subjectId?`?subject_id=${encodeURIComponent(subjectId)}`:""}`)}
export async function getTest(id:string){return api<{test:ApiTest;questions:Array<{id:string;body?:string;q?:string;options?:string[];difficulty?:number}>;answers_local?:Array<number|null>}>(`/tests/${id}`)}
export async function startTestAttempt(id:string){return api<{attempt:{id:string;status:string}}>(`/tests/${id}/start`,{method:"POST",body:"{}"})}
export async function finishAttempt(id:string,score?:number,maxScore?:number){return api<{attempt:unknown}>(`/tests/attempts/${id}/finish`,{method:"POST",body:JSON.stringify({score,max_score:maxScore})})}
export type ApiHomeworkAttachment={file_id:string;name?:string|null;mime_type?:string|null;size_bytes?:number|null;attachment_type?:string;caption?:string|null;inline_view?:boolean;download_url?:string|null};
export type ApiHomework={id:string;title:string;description?:string|null;due_at?:string|null;subject_name?:string|null;submission_id?:string|null;submission_status?:string|null;grade?:number|null;submitted_at?:string|null;attachments?:ApiHomeworkAttachment[]};
export async function listHomeworks(){return api<{items:ApiHomework[]}>("/homeworks")}
export async function submitHomework(id:string,textAnswer?:string,fileId?:string){return api<{submission:unknown}>(`/homeworks/${id}/submit`,{method:"POST",body:JSON.stringify({text_answer:textAnswer,file_id:fileId})})}
export async function uploadFile(file:File,groupId?:string){const fd=new FormData();fd.append("file",file);if(groupId)fd.append("group_id",groupId);return api<{file:{id:string;object_key?:string;original_name?:string}}>("/files/upload",{method:"POST",body:fd})}
export async function uploadFileBase64(originalName:string,mimeType:string,contentBase64:string){return api<{file:{id:string}}>("/files/upload",{method:"POST",body:JSON.stringify({original_name:originalName,mime_type:mimeType,content_base64:contentBase64})})}
export async function getFile(id:string){return api<{file:unknown;download?:{url?:string}}>(`/files/${id}`)}
export async function register(email:string,password:string,fullName?:string){return api<{access_token?:string|null;refresh_token?:string|null;needs_email_confirm?:boolean}>("/auth/register",{method:"POST",body:JSON.stringify({email,password,full_name:fullName})})}
export async function getSite(){return api<{site:Record<string,unknown>;announcements:Array<{id:string;title:string;body:string;pinned?:boolean}>}>("/site")}
export async function adminOverview(){return api<{site:Record<string,unknown>;counts:Record<string,number>}>("/admin/overview")}
export async function adminUpdateSite(data:Record<string,unknown>){return api<{site:Record<string,unknown>}>("/admin/site",{method:"PUT",body:JSON.stringify(data)})}
export async function adminListAnnouncements(){return api<{items:Array<{id:string;title:string;body:string;pinned?:boolean}>}>("/admin/announcements")}
export async function adminCreateAnnouncement(title:string,body:string,pinned?:boolean){return api<{item:{id:string}}>("/admin/announcements",{method:"POST",body:JSON.stringify({title,body,pinned})})}
export async function adminUpdateAnnouncement(id:string,patch:{title?:string;body?:string;pinned?:boolean}){return api<{item:unknown}>(`/admin/announcements/${id}`,{method:"PATCH",body:JSON.stringify(patch)})}
export async function adminDeleteAnnouncement(id:string){return api<{deleted:boolean}>(`/admin/announcements/${id}`,{method:"DELETE"})}
export async function createGroup(payload:{name:string;code?:string;course_number?:number;admission_year?:number}){return api<Record<string,unknown>>("/groups",{method:"POST",body:JSON.stringify(payload)})}
export async function createSubject(payload:{name:string;course_number?:number;semester?:number;control_type?:string}){return api<Record<string,unknown>>("/subjects",{method:"POST",body:JSON.stringify(payload)})}
export async function updateGroup(id:string,payload:Partial<{name:string;code:string;course_number:number;admission_year:number;is_active:boolean}>){return api<{group:Record<string,unknown>}>(`/groups/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(payload)})}
export async function deleteGroup(id:string,hard=false){return api<{deleted:boolean}>(`/groups/${encodeURIComponent(id)}${hard?"?hard=1":""}`,{method:"DELETE"})}
export async function updateSubject(id:string,payload:Partial<{name:string;course_number:number;semester:number;control_type:string}>){return api<{subject:Record<string,unknown>}>(`/subjects/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(payload)})}
export async function deleteSubject(id:string){return api<{deleted:boolean}>(`/subjects/${encodeURIComponent(id)}`,{method:"DELETE"})}
export async function getDashboard(){return api<{profile:{user:{id:string;full_name?:string;email?:string};roles:string[];groups:Array<{id:string;name:string;code?:string}>};announcements:Array<{id:string;title:string;body:string}>;schedule:Array<Record<string,unknown>>;homeworks:Array<Record<string,unknown>>;tests:Array<Record<string,unknown>>}>("/dashboard")}
export type ScheduleItem={id:string;schedule_id?:string;group_id?:string;group_name?:string;group_code?:string;course_number?:number|null;semester?:number|null;version?:number;subject_id?:string|null;subject_name?:string|null;date:string;start_time:string;end_time:string;type:string;room?:string|null;building?:string|null;notes?:string|null;is_cancelled?:boolean;event_kind?:string;is_makeup?:boolean;session_id?:string|null;teacher?:string|null;academic_hours?:number|null;week_parity?:"numerator"|"denominator"|"all"|null;recurrence_group?:string|null;parent_entry_id?:string|null;source_detail?:string|null;source?:string|null};
export type ScheduleMeta={periods:Array<{id:string;title:string;type:string;start_date:string;end_date?:string|null;notes?:string|null;is_current?:boolean}>;duration_rules:Array<{id:string;subject_id?:string|null;subject_name:string;academic_hours:number;notes?:string|null}>};
export async function getScheduleMeta(course?:number,semester?:number){const q=new URLSearchParams();if(course!=null)q.set("course",String(course));if(semester!=null)q.set("semester",String(semester));const qs=q.toString();return api<ScheduleMeta>(`/schedule/meta${qs?`?${qs}`:""}`)}
export async function listSchedule(from?:string,to?:string){const q=new URLSearchParams();if(from)q.set("from",from);if(to)q.set("to",to);const qs=q.toString();return api<{items:ScheduleItem[]}>(`/schedule${qs?`?${qs}`:""}`)}
export async function adminListSchedule(groupId?:string,semester?:number){const q=new URLSearchParams();if(groupId)q.set("group_id",groupId);if(semester!=null)q.set("semester",String(semester));const qs=q.toString();return api<{items:ScheduleItem[]}>(`/admin/schedule${qs?`?${qs}`:""}`)}
export async function adminSaveSchedule(payload:{group_id:string;semester?:number|null;academic_year_id?:string|null;entries:Array<Partial<ScheduleItem>>}){return api<{schedule_id:string;group_id:string;semester:number|null;version:number;entries_saved:number}>("/admin/schedule",{method:"PUT",body:JSON.stringify(payload)})}
export async function adminSaveScheduleLocal(items:Array<Partial<ScheduleItem>>){return api<{items:ScheduleItem[];count:number}>("/admin/schedule/local",{method:"PUT",body:JSON.stringify({items})})}
export async function saveSchedule(items:Array<Record<string,unknown>>){return api<{items:ScheduleItem[]}>("/schedule",{method:"PUT",body:JSON.stringify({items})})}
export type ApiMaterial={
  id:string; subject_id?:string|null; module_id?:string|null; topic_id?:string|null;
  type?:string|null; title:string; file_id?:string|null; external_url?:string|null;
  content_html?:string|null; order_index?:number|null; is_published?:boolean;
  source_key?:string|null; subject_name?:string|null; subject_slug?:string|null; specialty_slug?:string|null;
  source?:{key?:string|null;file_id?:string|null;name?:string|null;mime_type?:string|null;size_bytes?:number|null;download_url?:string|null};
};
export async function listMaterials(params:{groupId?:string;subjectId?:string;subjectSlug?:string;type?:string;q?:string}={}){
  const q=new URLSearchParams();
  if(params.groupId)q.set("group_id",params.groupId);
  if(params.subjectId)q.set("subject_id",params.subjectId);
  if(params.subjectSlug)q.set("subject_slug",params.subjectSlug);
  if(params.type)q.set("type",params.type);
  if(params.q)q.set("q",params.q);
  const qs=q.toString();
  return api<{items:ApiMaterial[];source?:string}>(`/materials${qs?`?${qs}`:""}`);
}
export async function getMaterial(id:string){return api<{item:ApiMaterial;source?:ApiMaterial["source"]}>(`/materials/${encodeURIComponent(id)}`)}

export type TrainerFeedCard={
  id:string; subject_slug:string; specialty_slug?:string|null; mode_set?:string|null;
  preparation:{name:string;organ?:string;stain?:string;imageUrl?:string;imagePath?:string};
  hotspots:Array<Record<string,unknown>>;
  question:{prompt:string;mode?:string;options:Array<{id:string;label:string;correct?:boolean}>;explanation?:string;allowSkip?:boolean};
  tags?:string[]; difficulty?:number|null; source_key?:string|null;
};
export async function getTrainerFeed(subject="histology",specialty="mbh",limit=30,offset=0){
  const q=new URLSearchParams({subject,specialty,limit:String(limit),offset:String(offset)});
  return api<{items:TrainerFeedCard[];limit:number;offset:number;source?:string}>(`/trainers/feed?${q.toString()}`);
}
export async function answerTrainerCard(payload:{card_id:string;option_id?:string;answer_text?:string;is_skipped?:boolean;time_ms?:number|null}){
  return api<{answer:unknown;correct:boolean|null}>("/trainers/feed/answer",{method:"POST",body:JSON.stringify(payload)});
}

export async function listCommunityPosts(){return api<{items:Array<{id:string;title:string;body:string;author_name?:string}>}>("/community/posts")}
export async function createCommunityPost(title:string,body:string){return api<{post:Record<string,unknown>}>("/community/posts",{method:"POST",body:JSON.stringify({title,body})})}
export async function getProgress(){return api<{overall_pct?:number;homework:unknown;tests:unknown;note?:string}>("/progress")}
export async function getSubject(id:string){return api<{subject:{id:string;name:string};modules?:unknown[]}>(`/subjects/${id}`)}
export async function claimAdmin(secret:string){return api<{roles:string[];message:string;session_refresh_required?:boolean;metadata_synced?:boolean}>("/admin/claim-admin",{method:"POST",body:JSON.stringify({secret})})}
export async function adminListUsers(){return api<{items:Array<{id:string;email?:string;full_name?:string;roles:string[]}>}>("/admin/users")}
export async function adminSetUserRole(userId:string,role:string,action:"assign"|"revoke"="assign"){return api<{roles:string[]}>("/admin/users/roles",{method:"POST",body:JSON.stringify({user_id:userId,role,action})})}
export async function adminGetCurriculum(){return api<{items:Array<Record<string,unknown>>}>("/admin/curriculum")}
export async function adminSaveCurriculum(items:Array<Record<string,unknown>>){return api<{items:Array<Record<string,unknown>>}>("/admin/curriculum",{method:"PUT",body:JSON.stringify({items})})}
export async function adminGetTests(){return api<{items:Array<Record<string,unknown>>;db_items?:Array<Record<string,unknown>>}>("/admin/tests")}
export async function adminSaveTests(items:Array<Record<string,unknown>>){return api<{items:Array<Record<string,unknown>>}>("/admin/tests",{method:"PUT",body:JSON.stringify({items})})}
export async function getCurriculum(){return api<{items:Array<Record<string,unknown>>}>("/curriculum")}
export type TelegramAdminChat={id:string;telegram_chat_id:number;telegram_chat_type:string;telegram_title?:string|null;group_id?:string|null;group_name?:string|null;group_code?:string|null;is_active:boolean;is_verified:boolean};
export async function adminTelegramChats(){return api<{items:TelegramAdminChat[]}>("/admin/telegram/chats")}
export async function adminBindTelegramChat(chatId:number|string,groupId:string){return api<{chat:TelegramAdminChat}>(`/admin/telegram/chats/${encodeURIComponent(String(chatId))}/bind`,{method:"POST",body:JSON.stringify({group_id:groupId})})}
export async function adminSetTelegramWebhook(){return api<{configured:boolean;url:string;telegram:Record<string,unknown>}>("/admin/telegram/set-webhook",{method:"POST",body:"{}"})}

export async function adminListHomeworks(){return api<{items:Array<Record<string,unknown>>}>("/admin/homeworks")}
export async function adminCreateHomework(payload:{title:string;description?:string;subject_id?:string;group_id?:string;due_at?:string}){return api<{item:Record<string,unknown>}>("/admin/homeworks",{method:"POST",body:JSON.stringify(payload)})}
export async function adminDeleteHomework(id:string){return api<{deleted:boolean}>(`/admin/homeworks/${id}`,{method:"DELETE"})}
export async function adminImportContentPackage(payload:Record<string,unknown>){
  return api<{stats:Record<string,number>;package_id?:string}>("/admin/content/package/import",{method:"POST",body:JSON.stringify(payload)});
}
export async function adminListMaterials(){return api<{items:Array<Record<string,unknown>>}>("/admin/materials")}
export async function adminDeleteMaterial(id:string){return api<{deleted:boolean}>(`/admin/materials/${id}`,{method:"DELETE"})}
export async function adminListCommunity(){return api<{items:Array<Record<string,unknown>>}>("/admin/community")}
export async function adminUpdateCommunity(id:string,patch:Record<string,unknown>){return api<{post:Record<string,unknown>}>(`/admin/community/${id}`,{method:"PATCH",body:JSON.stringify(patch)})}
export async function adminDeleteCommunity(id:string){return api<{deleted:boolean}>(`/admin/community/${id}`,{method:"DELETE"})}
export function hasToken(){return !!getToken()}

export type BankQuestion={id:string;subject:string;subject_slug?:string;topic?:string;type:string;kind?:string;text:string;answer?:string;has_answer?:boolean;options?:string[]|null;correct?:number|null}
export async function listQuestions(params:Record<string,string|number|undefined>={}){const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!=null&&v!=="")q.set(k,String(v))});const qs=q.toString();return api<{items:BankQuestion[];total:number;limit:number;offset:number}>(`/questions${qs?`?${qs}`:""}`)}
export async function listQuestionSubjects(){return api<{items:Array<{subject:string;subject_slug:string;count:number;kinds:Record<string,number>}>}>("/questions/subjects")}
export async function getQuestion(id:string){return api<{question:BankQuestion}>(`/questions/${encodeURIComponent(id)}`)}
export async function listTicketBanks(){return api<{items:Array<{id:string;title:string;subject:string;count:number}>}>("/tickets")}
export async function generateTicket(bank_id:string,count=3,mode:"practice"|"exam"="practice"){return api<{bank:{id:string;title:string;subject:string};questions:BankQuestion[];count:number;mode:string}>("/tickets/generate",{method:"POST",body:JSON.stringify({bank_id,count,mode})})}
export async function listTrainers(){return api<{items:Array<{id:string;title:string;subject:string;row_count:number}>}>("/trainers")}
export async function getTrainer(id:string){return api<{trainer:Record<string,unknown>}>(`/trainers/${encodeURIComponent(id)}`)}
export async function listSessions(status?:string){const qs=status?`?status=${encodeURIComponent(status)}`:"";return api<{items:Array<Record<string,unknown>>}>(`/sessions${qs}`)}
export async function createSession(payload:{type:string;ref_id?:string;title?:string;payload?:unknown;current_index?:number;answers?:unknown}){return api<{session:Record<string,unknown>}>("/sessions",{method:"POST",body:JSON.stringify(payload)})}
export async function updateSession(id:string,patch:Record<string,unknown>){return api<{session:Record<string,unknown>}>(`/sessions/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(patch)})}
export async function getSession(id:string){return api<{session:Record<string,unknown>}>(`/sessions/${encodeURIComponent(id)}`)}
export async function listNotes(){return api<{items:Array<{id:string;body:string;target_id?:string}>}>("/notes")}
export async function createNote(body:string,target_id?:string,target_type="question"){return api<{note:Record<string,unknown>}>("/notes",{method:"POST",body:JSON.stringify({body,target_id,target_type})})}
export async function listFavorites(){return api<{items:Array<{target_id:string;target_type:string}>}>("/favorites")}
export async function toggleFavorite(target_id:string,target_type="question"){return api<{favorited:boolean}>("/favorites/toggle",{method:"POST",body:JSON.stringify({target_id,target_type})})}
export async function adminListQuestions(params:Record<string,string|number|undefined>={}){const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!=null&&v!=="")q.set(k,String(v))});const qs=q.toString();return api<{items:BankQuestion[];total:number}>(`/admin/questions${qs?`?${qs}`:""}`)}
export async function adminCreateQuestion(payload:Partial<BankQuestion>&{text:string}){return api<{question:BankQuestion}>("/admin/questions",{method:"POST",body:JSON.stringify(payload)})}
export async function adminUpdateQuestion(id:string,payload:Partial<BankQuestion>){return api<{question:BankQuestion}>(`/admin/questions/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify(payload)})}
export async function adminDeleteQuestion(id:string){return api<{deleted:boolean}>(`/admin/questions/${encodeURIComponent(id)}`,{method:"DELETE"})}
export type SubjectPlanWeek={date?:string;week?:number;lecture?:string;practice?:string;study?:string[];control?:string|null;lab_detail?:string|null};
export type SubjectPlan={subject:string;subject_slug:string;semester?:string;control?:string;weeks:SubjectPlanWeek[]};
export async function getSubjectPlan(slug:string){return api<{plan:SubjectPlan;schedule_count:number}>(`/subject-plans/${encodeURIComponent(slug)}`)}
export async function getLessonPlan(params:{date?:string;subject_slug?:string;subject?:string}){const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v)q.set(k,v)});return api<{lesson:SubjectPlanWeek|null;weeks:SubjectPlanWeek[];plan_meta?:Record<string,unknown>}>(`/lesson-plan?${q}`)}
export async function adminSaveSubjectPlans(plans:SubjectPlan[]){return api<{plans:SubjectPlan[];count:number}>("/admin/subject-plans",{method:"PUT",body:JSON.stringify({plans})})}
export async function listSubjectsCatalog(){return api<{items:Array<{id:string;name:string;slug?:string;control_type?:string;hours_note?:string;category?:string;icon?:string;blurb?:string;course?:number;course_number?:number;semester?:number}>;program?:string;semester_label?:string;curriculum?:Record<string,unknown>}>("/subjects-catalog")}

/** AI lectures */
export type LectureListItem={id:string;title:string;subject:string;subject_slug:string;topic:string;summary?:string;published_at?:string|null;media_count?:number;status?:string}
export type Lecture=LectureListItem&{body_md:string;media?:Array<Record<string,unknown>>;sources?:Array<Record<string,unknown>>;generation?:Record<string,unknown>}
export async function listLectures(subject?:string){return api<{items:LectureListItem[];count:number}>(`/lectures${subject?`?subject=${encodeURIComponent(subject)}`:""}`)}
export async function getLecture(id:string){return api<{lecture:Lecture}>(`/lectures/${encodeURIComponent(id)}`)}
export async function adminListLectures(status?:string){return api<{items:Lecture[];count:number}>(`/admin/lectures${status?`?status=${encodeURIComponent(status)}`:""}`)}
export async function adminGenerateLecture(body:{subject_slug:string;topic:string;notes?:string}){return api<{lecture:Lecture}>("/admin/lectures/generate",{method:"POST",body:JSON.stringify(body)})}
export async function adminUpdateLecture(id:string,patch:Record<string,unknown>){return api<{lecture:Lecture}>(`/admin/lectures/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(patch)})}
export async function adminPublishLecture(id:string){return api<{lecture:Lecture}>(`/admin/lectures/${encodeURIComponent(id)}/publish`,{method:"POST"})}
export async function adminRejectLecture(id:string){return api<{lecture:Lecture}>(`/admin/lectures/${encodeURIComponent(id)}/reject`,{method:"POST"})}
export async function adminDeleteLecture(id:string){return api<{deleted:boolean}>(`/admin/lectures/${encodeURIComponent(id)}`,{method:"DELETE"})}


export type AdminDbRow = Record<string, unknown>;
export async function adminDbTables(){return api<{items:Array<{name:string;items:number|null;error?:string}>}>("/admin/db/tables")}
export async function adminDbList(table:string,limit=200){return api<{items:AdminDbRow[]}>(`/admin/db/${encodeURIComponent(table)}?limit=${limit}`)}
export async function adminDbInsert(table:string,row:AdminDbRow){return api<{item:AdminDbRow}>(`/admin/db/${encodeURIComponent(table)}`,{method:"POST",body:JSON.stringify(row)})}
export async function adminDbUpdate(table:string,id:string,row:AdminDbRow){return api<{item:AdminDbRow}>(`/admin/db/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(row)})}
export async function adminDbDelete(table:string,id:string){return api<{deleted:boolean}>(`/admin/db/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,{method:"DELETE"})}


export type AdminContentImportPayload = {
  tests: AdminDbRow[];
  questions: AdminDbRow[];
  test_questions: AdminDbRow[];
  dry_run?: boolean;
};
export async function adminContentImport(payload:AdminContentImportPayload){
  return api<{dry_run:boolean;created:{tests:number;questions:number;test_questions:number};errors:Array<{sheet:string;row:number;error:string}>}>(
    "/admin/content/import",
    {method:"POST",body:JSON.stringify(payload)}
  );
}


export type AdminDbMeta = {name:string;items:number|null;primary_key:string[];columns:string[]};
export async function adminDbMeta(){return api<{items:AdminDbMeta[]}>("/admin/db/meta");}
export async function adminDbUpdateByKey(table:string,key:AdminDbRow,row:AdminDbRow){return api<{item:AdminDbRow}>(`/admin/db/${encodeURIComponent(table)}/row`,{method:"PATCH",body:JSON.stringify({key,row})});}
export async function adminDbDeleteByKey(table:string,key:AdminDbRow){return api<{deleted:boolean}>(`/admin/db/${encodeURIComponent(table)}/row`,{method:"DELETE",body:JSON.stringify({key})});}
export async function adminDbAudit(limit=200){return api<{items:AdminDbRow[]}>(`/admin/db/audit?limit=${limit}`);}

export async function adminContentArchive(table:"tests"|"questions",id:string){return api<{item:AdminDbRow|null}>("/admin/content/archive",{method:"POST",body:JSON.stringify({table,id})})}
export async function adminContentMove(table:"tests"|"questions",id:string,patch:{subject_id?:string|null;module_id?:string|null;topic_id?:string|null}){return api<{item:AdminDbRow|null}>("/admin/content/move",{method:"POST",body:JSON.stringify({table,id,...patch})})}


export type PreparationQuestion={id:string;body?:string;text?:string;options?:string[];type?:string;answer?:string|null;topic_id?:string|null;topic_name?:string|null;module_name?:string|null};
export type PreparationSession={id:string;test_id:string;mode:"full"|"count";question_limit?:number|null;question_ids:string[];current_index:number;status:string;last_saved_at?:string};
export async function startPreparation(testId:string,mode:"full"|"count"="full",questionLimit?:number){return api<{session:PreparationSession}>(`/tests/${encodeURIComponent(testId)}/preparation/start`,{method:"POST",body:JSON.stringify({mode,question_limit:questionLimit})})}
export async function getPreparation(id:string){return api<{session:PreparationSession;questions:PreparationQuestion[];answers:Array<{question_id:string;answer_text?:string|null;is_correct?:boolean|null}>}>(`/tests/preparation/${encodeURIComponent(id)}`)}
export async function savePreparation(id:string,payload:{current_index?:number;question_id?:string;answer_text?:string|null}){return api<{session:PreparationSession;result?:unknown}>(`/tests/preparation/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(payload)})}
export async function finishPreparation(id:string){return api<{session:PreparationSession;stats:{total:number;answered:number;correct:number;wrong:number;unanswered:number;percent:number};topics:Array<Record<string,unknown>>;errors:Array<Record<string,unknown>>}>(`/tests/preparation/${encodeURIComponent(id)}/finish`,{method:"POST",body:"{}"})}
export async function reportQuestion(questionId:string,category:string,message?:string){return api<{item:Record<string,unknown>;duplicate?:boolean}>(`/questions/${encodeURIComponent(questionId)}/report`,{method:"POST",body:JSON.stringify({category,message})})}
export async function adminProblemCenter(){return api<{problems:Array<Record<string,unknown>>;reports:Array<Record<string,unknown>>;works:Array<Record<string,unknown>>}>("/admin/problem-center")}
export async function adminUpdateQuestionReport(id:string,status:"new"|"reviewing"|"fixed"|"rejected"){return api<{item:Record<string,unknown>}>(`/admin/question-reports/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({status})})}
export async function adminCreateWork(payload:{title:string;description?:string;priority?:string;question_id?:string;report_id?:string}){return api<{item:Record<string,unknown>}>("/admin/problem-center/work",{method:"POST",body:JSON.stringify(payload)})}
export async function adminUpdateWork(id:string,patch:Record<string,unknown>){return api<{item:Record<string,unknown>}>(`/admin/problem-center/work/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(patch)})}

export async function preparationAiReview(id:string){return api<{review:Record<string,unknown>;model?:string}>(`/tests/preparation/${encodeURIComponent(id)}/ai-review`,{method:"POST",body:"{}"})}


export type AcademicState = {
  profile: { id:string; full_name?:string; course_number?:number|null; semester?:number|null };
  session: Record<string,unknown>|null;
  plan: { available:boolean; items:number; concrete_items:number; message?:string|null };
  metrics: { closed:number; in_progress:number; not_started:number; debts:number; tracked:number };
  states: Array<Record<string,unknown>>;
  topic_progress: Array<Record<string,unknown>>;
  debts: Array<Record<string,unknown>>;
  upcoming: Array<Record<string,unknown>>;
  weak_topics: Array<Record<string,unknown>>;
  recommendations: Array<Record<string,unknown>>;
  generated_at: string;
};
export async function syncAcademicState(){return api<{synced:boolean}>("/academic/sync",{method:"POST",body:"{}"})}
export async function getAcademicState(){return api<AcademicState>("/academic/state")}
export async function saveAcademicState(payload:Record<string,unknown>){return api<{state:Record<string,unknown>}>("/academic/state",{method:"PUT",body:JSON.stringify(payload)})}
export async function generateAcademicAiPlan(){return api<{plan:Record<string,unknown>;items:Array<Record<string,unknown>>;source_state:AcademicState}>("/academic/ai-plan",{method:"POST",body:"{}"})}

export type SubjectGradebookEntry={id:string;subject_id:string;display_name:string;hours?:number|null;credits?:number|null;control_form?:string|null;hours_scope?:"semester"|"course";source_note?:string|null;source_file?:string};
export async function getSubjectGradebook(id:string){return api<{items:SubjectGradebookEntry[]}>(`/subjects/${encodeURIComponent(id)}/gradebook`)}