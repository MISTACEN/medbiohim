/** API client for SpaceWeb backend — restored exports for Vercel. */
const API_URL="/api/v1";
export type ApiSuccess<T>={ok:true;data:T;requestId:string;stale?:boolean};
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
function logTrainerImageResponse(res:Response,startedAt:number){
  if(typeof window==="undefined")return;
  const entry:any={at:Date.now(),method:"GET",path:"/trainers/feed/:id/image",status:res.status,durationMs:Date.now()-startedAt,source:res.headers.get("x-mbh-api-source")||"unknown",requestId:res.headers.get("x-request-id")||"",fallback:res.headers.get("x-mbh-transport-fallback")==="true",ok:res.ok,kind:"image_response"};
  const persist=()=>{
    try{const key="mbh:api-log-buffer";const prior=JSON.parse(sessionStorage.getItem(key)||"[]");sessionStorage.setItem(key,JSON.stringify([entry,...(Array.isArray(prior)?prior:[])].slice(0,1000)));}catch{}
    window.dispatchEvent(new CustomEvent("mbh:api-log",{detail:entry}));
  };
  if(!res.ok&&(res.headers.get("content-type")||"").includes("json")){
    void res.clone().json().then((payload:any)=>{if(payload?.error?.code)entry.errorCode=String(payload.error.code).slice(0,80);}).catch(()=>{}).finally(persist);
  }else persist();
}
export function setTokens(access:string,refresh?:string){
  const previousScope = cacheUserScope();
  localStorage.setItem("mb_access_token",access);
  const nextScope = cacheUserScope();
  if(refresh) localStorage.setItem("mb_refresh_token",refresh);
  else if(previousScope !== nextScope) localStorage.removeItem("mb_refresh_token");
  if(previousScope !== nextScope) clearUserScopedCaches();
}
export function clearTokens(){
  localStorage.removeItem("mb_access_token");
  localStorage.removeItem("mb_refresh_token");
  clearUserScopedCaches();
}
export function hasToken(){return !!getToken()}
async function request<T>(path:string,options:RequestInit={},tokenOverride?:string):Promise<{res:Response;text:string}>{
  const headers:Record<string,string>={Accept:"application/json",...(options.headers as Record<string,string>|undefined)};
  const isForm=typeof FormData!=="undefined"&&options.body instanceof FormData;
  if(options.body&&!isForm&&!headers["Content-Type"])headers["Content-Type"]="application/json";
  const token=tokenOverride??getToken();
  if(token)headers.Authorization=`Bearer ${token}`;
  // Ask for transport tracing only while in the admin area. The server independently
  // verifies the canonical database admin role before it returns any diagnostic header.
  if(typeof window!=="undefined"&&window.location.pathname.startsWith("/admin")){
    headers["X-MBH-Transport-Diagnostics"]="1";
  }

  // One controller combines the caller's cancellation with the client timeout.
  // Passing options.signal directly would disable the timeout whenever a caller
  // supplied its own AbortSignal.
  const controller=new AbortController();
  const externalSignal=options.signal;
  const abortFromCaller=()=>controller.abort();
  if(externalSignal){
    if(externalSignal.aborted)controller.abort();
    else externalSignal.addEventListener("abort",abortFromCaller,{once:true});
  }
  const timeout=setTimeout(()=>controller.abort(),(options.method||"GET").toUpperCase()==="GET"?12000:20000);
  const startedAt=Date.now();
  const method=(options.method||"GET").toUpperCase();
  try{
    const res=await fetch(`${API_URL}${path.startsWith("/")?path:`/${path}`}`,{...options,headers,cache:"no-store",signal:controller.signal});
    if(typeof window!=="undefined"){
      const source=res.headers.get("x-mbh-api-source");
      if(source){
        const fallback=source==="spaceweb-fallback"||source==="compatibility-fallback"||res.headers.get("x-mbh-transport-fallback")==="true";
        window.dispatchEvent(new CustomEvent("mbh:api-transport",{detail:{
          source,
          fallback,
          path:path.split("?")[0],
          at:Date.now(),
        }}));
      }
    }
    if(typeof window!=="undefined"){
      const safePath=path.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,":id");
      const source=res.headers.get("x-mbh-api-source")||"unknown";
      const entry={at:Date.now(),method,path:safePath,status:res.status,durationMs:Date.now()-startedAt,source,requestId:res.headers.get("x-request-id")||"",fallback:source.includes("fallback")||res.headers.get("x-mbh-transport-fallback")==="true",ok:res.ok,kind:"response"};
      try{
        const key="mbh:api-log-buffer";
        const prior=JSON.parse(sessionStorage.getItem(key)||"[]");
        sessionStorage.setItem(key,JSON.stringify([entry,...(Array.isArray(prior)?prior:[])].slice(0,1000)));
      }catch{}
      window.dispatchEvent(new CustomEvent("mbh:api-log",{detail:entry}));
    }
    return{res,text:await res.text()};
  }catch(error){
    if(typeof window!=="undefined"){
      const safePath=path.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,":id");
      const entry={at:Date.now(),method,path:safePath,status:0,durationMs:Date.now()-startedAt,source:"unavailable",requestId:"",fallback:false,ok:false,kind:controller.signal.aborted?"timeout":"network_error"};
      try{
        const key="mbh:api-log-buffer";
        const prior=JSON.parse(sessionStorage.getItem(key)||"[]");
        sessionStorage.setItem(key,JSON.stringify([entry,...(Array.isArray(prior)?prior:[])].slice(0,1000)));
      }catch{}
      window.dispatchEvent(new CustomEvent("mbh:api-log",{detail:entry}));
    }
    throw error;
  }finally{
    clearTimeout(timeout);
    if(externalSignal)externalSignal.removeEventListener("abort",abortFromCaller);
  }
}
type CacheEntry<T> = { value: ApiSuccess<T>; expires: number };
const apiCache = new Map<string, CacheEntry<any>>();
const API_CACHE_TTL = 60_000;

function cacheUserScope(): string | null {
  if (typeof window === "undefined") return null;
  const token = getToken();
  if (!token) return "anon";
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.sub === "string" && json.sub ? json.sub : null;
  } catch {
    // Never share a cache bucket between opaque/malformed tokens. In this case,
    // bypass caching and let the API authenticate the request normally.
    return null;
  }
}

function isCacheableGet(path: string, options: RequestInit) {
  if ((options.method || "GET").toUpperCase() !== "GET") return false;
  if (typeof window === "undefined") return false;
  return [
    "/subjects", "/subjects?", "/subjects/",
    "/subjects-catalog", "/subject-plans/",
    "/tests", "/tests?", "/materials", "/materials?",
    "/lectures", "/lectures?", "/tickets", "/tickets?",
    "/subject-materials", "/subject-materials?",
    "/trainers/feed", "/trainers/feed?",
  ].some((prefix) => path === prefix || path.startsWith(prefix));
}

export async function apiCached<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  if (!isCacheableGet(path, options)) return api<T>(path, options);
  const userScope = cacheUserScope();
  if (userScope === null) return api<T>(path, options);
  const key = path + "|user:" + userScope;
  const now = Date.now();
  let stale: ApiSuccess<T> | null = null;

  const memory = apiCache.get(key);
  if (memory) {
    if (memory.expires > now) return memory.value as ApiResult<T>;
    stale = memory.value as ApiSuccess<T>;
  }

  const storageKey = "mb_api_cache:" + key;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      if (parsed.value?.ok) {
        if (parsed.expires > now) {
          apiCache.set(key, parsed);
          return parsed.value;
        }
        stale = parsed.value as ApiSuccess<T>;
      }
    }
  } catch {}

  const result = await api<T>(path, options);
  if (result.ok) {
    const entry = { value: result, expires: Date.now() + API_CACHE_TTL };
    apiCache.set(key, entry);
    try { sessionStorage.setItem(storageKey, JSON.stringify(entry)); } catch {}
    return result;
  }

  // If SpaceWeb/Supabase is temporarily slow or unavailable, keep the last
  // successful shared content visible instead of replacing the whole page
  // with "Database is not available".
  if (stale && ["NETWORK", "UPSTREAM", "DB_UNAVAILABLE", "BAD_RESPONSE"].includes(result.error.code)) {
    return { ...stale, stale: true };
  }
  return result;
}

export function invalidateApiCache(prefix = "") {
  for (const key of apiCache.keys()) {
    if (!prefix || key.startsWith(prefix)) apiCache.delete(key);
  }
  if (typeof window !== "undefined") {
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i) || "";
        if (key.startsWith("mb_api_cache:") && (!prefix || key.slice(13).startsWith(prefix))) sessionStorage.removeItem(key);
      }
    } catch {}
  }
}

let refreshPromise: Promise<string | null> | null = null;

function notifyApiLoading(type: "start" | "end") {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new CustomEvent(type === "start" ? "mbh:api-start" : "mbh:api-end")); } catch {}
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const rr = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: {"Accept":"application/json","Content-Type":"application/json"},
        body: JSON.stringify({refresh_token: refreshToken}),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      const rt = await rr.text();
      if (!rr.ok) return null;
      const parsed = JSON.parse(rt) as {data?:{access_token?:string;refresh_token?:string}};
      const access = parsed.data?.access_token;
      if (!access) return null;
      setTokens(access, parsed.data?.refresh_token);
      return access;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function api<T>(path:string,options:RequestInit={}):Promise<ApiResult<T>>{
  notifyApiLoading("start");
  try {
    let {res,text}=await request<T>(path,options);
    if(res.status===401 && path!=="/auth/refresh"){
      const access = await refreshAccessToken();
      if(access) ({res,text}=await request<T>(path,options,access));
      else if (getRefreshToken()) clearTokens();
    }
    try {
      return JSON.parse(text) as ApiResult<T>;
    } catch {
      return {ok:false,error:{code:"BAD_RESPONSE",message:res.ok?"Сервер вернул не JSON":`HTTP ${res.status}`},requestId:res.headers.get("x-request-id")||"client"};
    }
  } catch {
    return {ok:false,error:{code:"NETWORK",message:"Сеть недоступна"},requestId:"client"};
  } finally {
    notifyApiLoading("end");
  }
}
const trainerImageCache=new Map<string,string>();
const trainerImageInflight=new Map<string,Promise<string|null>>();
// Keep image bursts from overwhelming the authenticated Worker/Supabase path when
// a feed renders many cards at once. Failed 503s are surfaced to the UI for manual
// retry instead of multiplying an upstream outage into hundreds of retry requests.
const MAX_CONCURRENT_TRAINER_IMAGE_REQUESTS=6;
let activeTrainerImageRequests=0;
const trainerImageQueue:Array<()=>void>=[];
async function withTrainerImageConcurrency<T>(task:()=>Promise<T>):Promise<T>{
  if(activeTrainerImageRequests>=MAX_CONCURRENT_TRAINER_IMAGE_REQUESTS){
    await new Promise<void>(resolve=>trainerImageQueue.push(resolve));
  }else{
    activeTrainerImageRequests++;
  }
  try{return await task();}
  finally{
    // Transfer the occupied slot directly to the next waiter. Decrement only
    // when no waiter exists, otherwise a newly arriving task could race ahead.
    const next=trainerImageQueue.shift();
    if(next)next();
    else activeTrainerImageRequests--;
  }
}
export async function getTrainerImageUrl(id:string):Promise<string|null>{
  if(typeof window==="undefined")return null;
  const idKey=String(id);
  const userScope=cacheUserScope();
  const cacheKey=userScope===null?null:`${userScope}|${idKey}`;
  if(cacheKey){
    const cached=trainerImageCache.get(cacheKey);
    if(cached)return cached;
    const pending=trainerImageInflight.get(cacheKey);
    if(pending)return pending;
  }

  const run=async()=>{
    let token=getToken();
    for(let attempt=0;attempt<2;attempt++){
      try{
        const bust=attempt===0?"":`?retry=${attempt}-${Date.now()}`;
        let imageRequestStartedAt=Date.now();
        let res=await fetch(`${API_URL}/trainers/feed/${encodeURIComponent(idKey)}/image${bust}`,{
          headers:token?{Authorization:`Bearer ${token}`}:{},
          cache:"no-store",
          signal:AbortSignal.timeout(15000),
        });
        logTrainerImageResponse(res,imageRequestStartedAt);
        if(res.status===401){
          const refreshToken=getRefreshToken();
          if(refreshToken){
            const rr=await fetch(`${API_URL}/auth/refresh`,{
              method:"POST",
              headers:{"Accept":"application/json","Content-Type":"application/json"},
              body:JSON.stringify({refresh_token:refreshToken}),
              cache:"no-store",
              signal:AbortSignal.timeout(10000),
            });
            if(rr.ok){
              try{
                const parsed=JSON.parse(await rr.text()) as {data?:{access_token?:string;refresh_token?:string}};
                if(parsed.data?.access_token){
                  setTokens(parsed.data.access_token,parsed.data.refresh_token);
                  token=parsed.data.access_token;
                  imageRequestStartedAt=Date.now();
                  res=await fetch(`${API_URL}/trainers/feed/${encodeURIComponent(idKey)}/image?retry=auth-${Date.now()}`,{
                    headers:{Authorization:`Bearer ${token}`},
                    cache:"no-store",
                    signal:AbortSignal.timeout(15000),
                  });
                  logTrainerImageResponse(res,imageRequestStartedAt);
                }
              }catch{}
            }
          }
        }
        if(res.ok){
          const blob=await res.blob();
          if(blob.size>0){
            const url=URL.createObjectURL(blob);
            if(cacheKey && cacheUserScope()===userScope) trainerImageCache.set(cacheKey,url);
            return url;
          }
        }
        // Do not fan out retries for deterministic auth, access, missing-file or
        // validation errors when a feed renders many cards concurrently.
        if([401,403,404,410,422,503].includes(res.status)) return null;
        if(res.status<500 && res.status!==429) return null;
      }catch{}
      if(attempt<1)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
    }
    return null;
  };
  const promise=withTrainerImageConcurrency(run).finally(()=>{if(cacheKey)trainerImageInflight.delete(cacheKey);});
  if(cacheKey)trainerImageInflight.set(cacheKey,promise);
  return promise;
}
const materialFileCache=new Map<string,string>();

export async function getMaterialFileUrl(id:string):Promise<string|null>{
  if(typeof window==="undefined")return null;
  const idKey=String(id);
  const userScope=cacheUserScope();
  const cacheKey=userScope===null?null:`${userScope}|${idKey}`;
  if(cacheKey){
    const cached=materialFileCache.get(cacheKey);
    if(cached)return cached;
  }
  const cacheForCurrentUser=(url:string)=>{
    if(cacheKey && cacheUserScope()===userScope) materialFileCache.set(cacheKey,url);
    return url;
  };
  try{
    const negotiate=async(token:string|null)=>{
      const res=await fetch(`${API_URL}/materials/${encodeURIComponent(idKey)}/file-url`,{
        headers:token?{Authorization:`Bearer ${token}`}: {},
        cache:"no-store",
        signal:AbortSignal.timeout(15000),
      });
      if(!res.ok)return null;
      const parsed=await res.json() as {ok?:boolean;data?:{url?:string|null;mode?:string}};
      if(!parsed?.ok)return null;
      return parsed.data ?? null;
    };

    let token=getToken();
    let meta=await negotiate(token);
    if(meta?.url){
      // B2 presigned URLs expire; never keep them in the in-memory cache.
      if(meta.mode!=="presigned") return cacheForCurrentUser(meta.url);
      return meta.url;
    }

    if(!meta){
      const access=await refreshAccessToken();
      if(access){
        token=access;
        meta=await negotiate(access);
        if(meta?.url){
          if(meta.mode!=="presigned") return cacheForCurrentUser(meta.url);
          return meta.url;
        }
      }
    }

    // Legacy Histology files are private/authenticated binary responses.
    // Fetch them with Bearer and expose only a local blob URL to the viewer.
    const res=await fetch(`${API_URL}/materials/${encodeURIComponent(idKey)}/file`,{
      headers:token?{Authorization:`Bearer ${token}`}: {},
      cache:"no-store",
      signal:AbortSignal.timeout(30000),
    });
    if(res.status===401){
      const access=await refreshAccessToken();
      if(access){
        const retry=await fetch(`${API_URL}/materials/${encodeURIComponent(idKey)}/file`,{
          headers:{Authorization:`Bearer ${access}`},
          cache:"no-store",
          signal:AbortSignal.timeout(30000),
        });
        if(!retry.ok)return null;
        const blob=await retry.blob();
        if(blob.size===0)return null;
        return cacheForCurrentUser(URL.createObjectURL(blob));
      }
    }
    if(!res.ok)return null;
    const blob=await res.blob();
    if(blob.size===0)return null;
    return cacheForCurrentUser(URL.createObjectURL(blob));
  }catch{return null;}
}

export async function fetchHistologySourceFile(path:string):Promise<Blob|null>{
  if(typeof window==="undefined")return null;
  const key=String(path);

  const requestFile=async(token:string|null)=>{
    return fetch(
      API_URL + "/histology/source-file?path=" + encodeURIComponent(key),
      {headers:token?{Authorization:"Bearer "+token}:{},cache:"no-store",signal:AbortSignal.timeout(30000)}
    );
  };

  let token=getToken();
  try{
    let res=await requestFile(token);
    if(res.status===401){
      const access=await refreshAccessToken();
      if(access){
        token=access;
        res=await requestFile(access);
      }
    }
    if(!res.ok)return null;
    const blob=await res.blob();
    return blob.size?blob:null;
  }catch{return null;}
}

export async function retryTrainerImage(id:string):Promise<string|null>{
  if(typeof window==="undefined")return null;
  const idKey=String(id);
  const userScope=cacheUserScope();
  const cacheKey=userScope===null?null:`${userScope}|${idKey}`;
  const old=cacheKey?trainerImageCache.get(cacheKey):undefined;
  if(old){try{URL.revokeObjectURL(old);}catch{} trainerImageCache.delete(cacheKey!);}
  if(cacheKey)trainerImageInflight.delete(cacheKey);
  return getTrainerImageUrl(idKey);
}
export function prefetchTrainerImages(ids:(string|null|undefined)[]):void{
  if(typeof window==="undefined")return;
  const userScope=cacheUserScope();
  for(const id of ids){
    if(!id)continue;
    const idKey=String(id);
    const cacheKey=userScope===null?null:`${userScope}|${idKey}`;
    if(cacheKey&&(trainerImageCache.has(cacheKey)||trainerImageInflight.has(cacheKey)))continue;
    void getTrainerImageUrl(idKey);
  }
}
export function peekTrainerImageUrl(id: string): string | null {
  if(typeof window==="undefined")return null;
  const userScope=cacheUserScope();
  return userScope===null?null:trainerImageCache.get(`${userScope}|${String(id)}`)??null;
}
export function logoutSession():void{const t=getToken();if(!t||typeof window==="undefined")return;try{void fetch(`${API_URL}/auth/logout`,{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json","Authorization":`Bearer ${t}`},body:"{}",cache:"no-store",keepalive:true}).catch(()=>{})}catch{}}
export async function login(email:string,password:string){return api<any>("/auth/login",{method:"POST",body:JSON.stringify({email,password})})}
export async function recoverPassword(email:string){return api<any>("/auth/recover",{method:"POST",body:JSON.stringify({email})})}
export async function me(){return api<any>("/auth/me")}
export async function refreshSession(){const r=typeof window!=="undefined"?localStorage.getItem("mb_refresh_token"):null;if(!r)return{ok:false as const,error:{code:"NO_REFRESH_TOKEN",message:"Сессия требует повторного входа."},requestId:"client"};const res=await api<{access_token:string;refresh_token?:string}>("/auth/refresh",{method:"POST",body:JSON.stringify({refresh_token:r})});if(res.ok&&res.data.access_token)setTokens(res.data.access_token,res.data.refresh_token);return res}
export async function health(){return api<any>("/health")}
export async function presenceHeartbeat(){return api<any>("/presence/heartbeat",{method:"POST",body:"{}"})}
export async function adminPresence(within=180){return api<any>("/admin/presence?within="+encodeURIComponent(String(within)))} 
export async function listSubjects(course?:number,semester?:number){const q=new URLSearchParams();if(course!=null)q.set("course",String(course));if(semester!=null)q.set("semester",String(semester));return apiCached<any>(`/subjects${q.toString()?`?${q}`:""}`)}
export async function listGroups(){return api<any>("/groups")}
export type ApiTest=any;
export async function listTests(subjectId?:string,groupId?:string){const q=new URLSearchParams();if(subjectId)q.set("subject_id",subjectId);if(groupId)q.set("group_id",groupId);return apiCached<any>(`/tests${q.toString()?`?${q}`:""}`)}
export async function getChemistryMaster(params:Record<string,unknown>={}){const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!=null&&v!=="")q.set(k,String(v))});return apiCached<any>(`/tests/chemistry-master${q.toString()?`?${q}`:""}`)}
export async function getTestCurriculumMap(subjectId?:string,groupId?:string){const q=new URLSearchParams();if(subjectId)q.set("subject_id",subjectId);if(groupId)q.set("group_id",groupId);return apiCached<any>(`/tests/curriculum-map${q.toString()?`?${q}`:""}`)}
export async function getTest(id:string,groupId?:string){const q=groupId?`?group_id=${encodeURIComponent(groupId)}`:"";return api<any>(`/tests/${id}${q}`)}
export async function getTestBank(id:string,groupId?:string){const q=new URLSearchParams({view:"bank"});if(groupId)q.set("group_id",groupId);return api<any>(`/tests/${encodeURIComponent(id)}?${q.toString()}`)}
export async function listMyAttempts(subjectId?:string,groupId?:string){const q=new URLSearchParams();if(subjectId)q.set("subject_id",subjectId);if(groupId)q.set("group_id",groupId);return api<any>(`/my/attempts${q.toString()?`?${q}`:""}`)}
export async function startTestAttempt(id:string,groupId?:string){const q=groupId?`?group_id=${encodeURIComponent(groupId)}`:"";return api<any>(`/tests/${id}/start${q}`,{method:"POST",body:"{}"})}
export async function saveTestAnswer(attemptId:string,questionId:string,answerText:string|null){return api<any>(`/tests/attempts/${encodeURIComponent(attemptId)}/answers`,{method:"POST",body:JSON.stringify({question_id:questionId,answer_text:answerText})})}
export async function finishAttempt(id:string){return api<any>(`/tests/attempts/${id}/finish`,{method:"POST",body:"{}"})}
export async function retryTestAnswerGrading(attemptId:string,questionId:string){return api<any>(`/tests/attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(questionId)}/regrade`,{method:"POST",body:"{}"})}
export async function listHomeworks(groupId?:string){const q=groupId?"?group_id="+encodeURIComponent(groupId):"";return api<any>("/homeworks"+q)}
export async function createHomework(payload:{title:string;description?:string;subject_id?:string;due_date?:string;due_at?:string;group_id?:string;scope?:"group"|"personal";schedule_entry_id?:string;attachment_file_ids?:string[]}){return api<any>("/homeworks",{method:"POST",body:JSON.stringify(payload)})}
export async function setHomeworkDone(id:string,done:boolean){return api<any>(`/homeworks/${encodeURIComponent(id)}/progress`,{method:"POST",body:JSON.stringify({done})})}
export async function getStudentPlanner(from?:string,to?:string,groupId?:string){const q=new URLSearchParams();if(from)q.set("from",from);if(to)q.set("to",to);if(groupId)q.set("group_id",groupId);return api<any>(`/planner${q.toString()?`?${q}`:""}`)}
export async function markAttendance(entryId:string,status:"present"|"excused"|"sick"|"unexcused",note?:string,groupId?:string){const q=groupId?"?group_id="+encodeURIComponent(groupId):"";return api<any>(`/attendance/${encodeURIComponent(entryId)}${q}`,{method:"POST",body:JSON.stringify({status,note})})}
export async function submitHomework(id:string,textAnswer?:string,fileId?:string){return api<any>(`/homeworks/${id}/submit`,{method:"POST",body:JSON.stringify({text_answer:textAnswer,file_id:fileId})})}
export async function uploadFile(file:File,groupId?:string,specialtySlug?:string){const fd=new FormData();fd.append("file",file);if(groupId)fd.append("group_id",groupId);if(specialtySlug)fd.append("specialty_slug",specialtySlug);return api<any>("/files/upload",{method:"POST",body:fd})}
export async function getFileDownload(id:string):Promise<any>{return api<any>("/files/"+encodeURIComponent(id))}
export function fileDownloadUrl(id:string):string{return `${API_URL}/files/${encodeURIComponent(id)}/download`}
export async function fetchMaterialFile(id:string):Promise<Blob|null>{
  if(typeof window==="undefined") return null;
  const token=getToken();
  try{
    let res=await fetch(`${API_URL}/materials/${encodeURIComponent(id)}/file`,{headers:token?{Authorization:`Bearer ${token}`}:{},cache:"no-store",signal:AbortSignal.timeout(30000)});
    if(res.status===401){
      const refreshToken=getRefreshToken();
      if(refreshToken){
        const rr=await fetch(`${API_URL}/auth/refresh`,{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({refresh_token:refreshToken}),cache:"no-store",signal:AbortSignal.timeout(10000)});
        if(rr.ok){
          const parsed=JSON.parse(await rr.text()) as {data?:{access_token?:string;refresh_token?:string}};
          if(parsed.data?.access_token){
            setTokens(parsed.data.access_token,parsed.data.refresh_token);
            res=await fetch(`${API_URL}/materials/${encodeURIComponent(id)}/file`,{headers:{Authorization:`Bearer ${parsed.data.access_token}`},cache:"no-store",signal:AbortSignal.timeout(30000)});
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
const trainerCardCache=new Map<string, any>();
const trainerCardInflight=new Map<string, Promise<ApiResult<any>>>();

function clearUserScopedCaches(){
  invalidateApiCache();
  for(const url of trainerImageCache.values()){if(url.startsWith("blob:")){try{URL.revokeObjectURL(url);}catch{}}}
  for(const url of materialFileCache.values()){if(url.startsWith("blob:")){try{URL.revokeObjectURL(url);}catch{}}}
  trainerImageCache.clear();
  trainerImageInflight.clear();
  materialFileCache.clear();
  trainerCardCache.clear();
  trainerCardInflight.clear();
}

export async function getTrainerFeedCard(id:string){
  const idKey=String(id);
  const userScope=cacheUserScope();
  const cacheKey=userScope===null?null:`${userScope}|${idKey}`;
  if(cacheKey){
    const cached=trainerCardCache.get(cacheKey);
    if(cached) return {ok:true as const,data:{item:cached},requestId:"cache"};
    const pending=trainerCardInflight.get(cacheKey);
    if(pending) return pending;
  }
  const promise=api<any>("/trainers/feed/" + encodeURIComponent(idKey)).then((result)=>{
    if(cacheKey && cacheUserScope()===userScope && result.ok && result.data?.item) trainerCardCache.set(cacheKey,result.data.item);
    return result;
  }).finally(()=>{if(cacheKey)trainerCardInflight.delete(cacheKey);});
  if(cacheKey)trainerCardInflight.set(cacheKey,promise);
  return promise;
}
export async function getLectureMiniQuizQuestions(questionIds:string[],subjectId:string){
  const ids=questionIds.filter(Boolean).join(",");
  if(!ids) return {ok:true as const,data:{items:[]},requestId:"client"};
  return api<any>("/questions/mini-quiz?subject_id="+encodeURIComponent(subjectId)+"&ids="+encodeURIComponent(ids));
}
export async function checkLectureMiniQuizAnswer(questionId:string,selectedIndexes:number[],subjectId:string){
  return api<any>("/questions/mini-quiz/check",{
    method:"POST",
    body:JSON.stringify({question_id:questionId,selected_indexes:selectedIndexes,subject_id:subjectId})
  });
}
export async function answerTrainerCard(payload:any){return api<any>("/trainers/feed/answer",{method:"POST",body:JSON.stringify(payload)})}
export async function listSchedule(from?:string,to?:string,groupId?:string){const q=new URLSearchParams();if(from)q.set("from",from);if(to)q.set("to",to);if(groupId)q.set("group_id",groupId);return api<any>(`/schedule${q.toString()?`?${q}`:""}`)}
export async function getDashboard(){return api<any>("/dashboard")}
export async function getProgress(subjectId?:string,groupId?:string){const q=new URLSearchParams();if(subjectId)q.set("subject_id",subjectId);if(groupId)q.set("group_id",groupId);return api<any>(`/progress${q.toString()?`?${q}`:""}`)}
export async function getCurriculum(){return api<any>("/curriculum")}
export async function getSubject(id:string){return apiCached<any>(`/subjects/${id}`)}
export async function listMaterials(params:any={}){const q=new URLSearchParams();Object.entries(params||{}).forEach(([k,v])=>{if(v!=null&&v!=="")q.set(String(k),String(v))});return apiCached<any>(`/materials${q.toString()?`?${q}`:""}`)}
export async function syncAcademicState(){return api<any>("/academic/sync",{method:"POST",body:"{}"})}
export async function getAcademicState(){return api<AcademicState>("/academic/state")}
export async function generateAcademicAiPlan(){return api<{plan:any;items:any[];source_state:AcademicState}>("/academic/ai-plan",{method:"POST",body:"{}"})}

export type AdminDatabaseConnection = {
  id: string;
  slug: string;
  label: string;
  driver: "pgsql" | "mysql";
  host: string;
  port: number | null;
  database_name: string;
  username: string;
  password_configured?: boolean;
  sslmode?: string | null;
  charset?: string | null;
  enabled?: boolean;
  builtin?: boolean;
  status?: "unknown" | "connected" | "failed" | "untested";
  last_test_ok?: boolean | null;
  last_tested_at?: string | null;
  last_error?: string | null;
  updated_at?: string | null;
};

export async function adminDatabaseConnections(): Promise<any> {
  return api("/admin/database/connections") as any;
}
export async function adminDatabaseSaveConnection(id:string,payload:Record<string,unknown>): Promise<any> {
  return api("/admin/database/connections/" + encodeURIComponent(id), {
    method:"PUT",
    body:JSON.stringify(payload),
  }) as any;
}
export async function adminDatabaseTestConnection(id:string): Promise<any> {
  return api("/admin/database/connections/" + encodeURIComponent(id) + "/test", {method:"POST",body:"{}"}) as any;
}
export async function adminDatabaseTables(id:string): Promise<any> {
  return api("/admin/database/" + encodeURIComponent(id) + "/tables") as any;
}
export async function adminDatabaseSchema(id:string,table:string): Promise<any> {
  return api("/admin/database/" + encodeURIComponent(id) + "/schema/" + encodeURIComponent(table)) as any;
}
export async function adminDatabaseRows(id:string,table:string,limit=100,offset=0,q=""): Promise<any> {
  const params=new URLSearchParams({limit:String(limit),offset:String(offset)});
  if(q.trim()) params.set("q",q.trim());
  return api("/admin/database/" + encodeURIComponent(id) + "/rows/" + encodeURIComponent(table) + "?" + params.toString()) as any;
}
export async function adminDatabaseInsert(id:string,table:string,row:Record<string,unknown>): Promise<any> {
  return api("/admin/database/" + encodeURIComponent(id) + "/rows/" + encodeURIComponent(table),{
    method:"POST",body:JSON.stringify(row),
  }) as any;
}
export async function adminDatabaseUpdate(id:string,table:string,key:Record<string,unknown>,row:Record<string,unknown>): Promise<any> {
  return api("/admin/database/" + encodeURIComponent(id) + "/rows/" + encodeURIComponent(table),{
    method:"PATCH",body:JSON.stringify({key,row}),
  }) as any;
}
export async function adminDatabaseDelete(id:string,table:string,key:Record<string,unknown>): Promise<any> {
  return api("/admin/database/" + encodeURIComponent(id) + "/rows/" + encodeURIComponent(table),{
    method:"DELETE",body:JSON.stringify({key}),
  }) as any;
}
export async function adminDatabaseSql(id:string,sql:string,confirmed=false): Promise<any> {
  return api("/admin/database/" + encodeURIComponent(id) + "/sql",{
    method:"POST",body:JSON.stringify({sql,confirmed}),
  }) as any;
}

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
export async function adminRollbackAudit(id:string): Promise<any> { return api(`/admin/db/audit/${encodeURIComponent(id)}/rollback`, {method:"POST",body:"{}"}) as any; }
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
export async function adminValidateContent(): Promise<any> { return api(`/admin/content/validate`) as any; }
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
export async function createCommunityPost(title:string,body:string,groupId?:string): Promise<any> { return api("/community/posts", { method:"POST", body:JSON.stringify({title,body,group_id:groupId}) }) as any; }
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
export async function listCommunityPosts(groupId?:string): Promise<any> { const q=groupId?"?group_id="+encodeURIComponent(groupId):""; return api("/community/posts"+q) as any; }
export async function listLectures(subject?:string): Promise<any> { const q=subject?"?subject="+encodeURIComponent(subject):""; return apiCached("/lectures"+q) as any; }
export async function listQuestionSubjects(..._args: any[]): Promise<any> { return api("/questions/subjects") as any; }
export async function listQuestions(params:Record<string,unknown>={}): Promise<any> { const q=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{if(v!=null&&v!=="")q.set(k,String(v))}); if(!q.has("include_answer")) q.set("include_answer","1"); return api("/questions"+(q.toString()?"?"+q:"")) as any; }
export async function listSubjectsCatalog(..._args: any[]): Promise<any> { return apiCached("/subjects-catalog") as any; }
export async function listTicketBanks(..._args: any[]): Promise<any> { return apiCached("/tickets") as any; }
export async function getSubjectPlan(slug:string, course?:number|null, semester?:number|null): Promise<any> { const clean=String(slug??"").trim(); if(!clean) return { ok:false, error:{code:"VALIDATION_ERROR",message:"subject slug required"}, requestId:"client" }; const q=new URLSearchParams(); if(course!=null)q.set("course",String(course)); if(semester!=null)q.set("semester",String(semester)); return apiCached("/subject-plans/" + encodeURIComponent(clean) + (q.toString()?"?"+q:"")) as any; }
export async function preparationAiReview(sessionId:string): Promise<any> { return api("/tests/preparation/" + encodeURIComponent(sessionId) + "/ai-review", {method:"POST",body:"{}"}) as any; }
export async function register(email:string,password:string,fullName:string): Promise<any> { return api("/auth/register", { method:"POST", body:JSON.stringify({email,password,full_name:fullName}) }) as any; }
export async function reportQuestion(questionId:string,category:string,message=""): Promise<any> { return api("/questions/" + encodeURIComponent(questionId) + "/report", { method:"POST", body:JSON.stringify({category,message}) }) as any; }
export async function savePreparation(sessionId:string,payload:Record<string,unknown>): Promise<any> { return api("/tests/preparation/" + encodeURIComponent(sessionId), {method:"PATCH",body:JSON.stringify(payload)}) as any; }
export async function startPreparation(testId:string,mode:"full"|"count"|"sequential"="full",questionLimit?:number,groupId?:string): Promise<any> { return api("/tests/" + encodeURIComponent(testId) + "/preparation/start", {method:"POST",body:JSON.stringify({mode,question_limit:questionLimit,group_id:groupId})}) as any; }
export async function retryPreparationGrading(sessionId:string,questionId?:string): Promise<any> { return api("/tests/preparation/" + encodeURIComponent(sessionId) + "/retry-grading", {method:"POST",body:JSON.stringify(questionId?{question_id:questionId}:{})}) as any; }
export async function getBankProgress(testId:string,groupId?:string): Promise<any> { const q=groupId?"?group_id="+encodeURIComponent(groupId):""; return api("/tests/" + encodeURIComponent(testId) + "/bank-progress"+q) as any; }
export async function updateGroup(id:string,payload:Record<string,unknown>): Promise<any> { return api("/groups/" + encodeURIComponent(id), { method:"PATCH", body:JSON.stringify(payload) }) as any; }
export async function updateSubject(id:string,payload:Record<string,unknown>): Promise<any> { return api("/subjects/" + encodeURIComponent(id), { method:"PATCH", body:JSON.stringify(payload) }) as any; }

export async function listNotes(){return api<any>("/notes")}
export async function upsertNote(targetType:string,targetId:string,body:string){return api<any>("/notes",{method:"POST",body:JSON.stringify({target_type:targetType,target_id:targetId,body})})}
export async function listFavorites(){return api<any>("/favorites")}
export async function toggleFavorite(targetType:string,targetId:string){return api<any>("/favorites/toggle",{method:"POST",body:JSON.stringify({target_type:targetType,target_id:targetId})})}

export async function adminImportScheduleXlsx(file:File,groupId:string,semester?:number){const fd=new FormData();fd.append("file",file);fd.append("group_id",groupId);if(semester!=null)fd.append("semester",String(semester));return api<any>("/admin/schedule/import",{method:"POST",body:fd})}
export async function adminImportCurriculumXlsx(file:File){const fd=new FormData();fd.append("file",file);return api<any>("/admin/import/curriculum",{method:"POST",body:fd})}

export async function adminFileAudit(limit = 200): Promise<any> { return api("/admin/files/audit?limit=" + encodeURIComponent(String(limit))) as any; }
export async function adminMediaCapabilities(): Promise<any> { return api("/admin/files/capabilities") as any; }
