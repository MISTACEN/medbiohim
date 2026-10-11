const APP_ORIGIN = "https://medbiohim.vercel.app";
const $ = (id) => document.getElementById(id);
const SUBJECT_RULES = [
 {value:"histology",label:"Гистология, цитология и эмбриология",words:["гистолог","цитолог","эмбриолог","эпител","соединительн ткан","кровь и лимфа","препарат"]},
 {value:"biochemistry",label:"Биохимия",words:["биохими","фермент","аминокислот","метабол","гликолиз","липид","белков"]},
 {value:"anatomy",label:"Анатомия",words:["анатом","мышц","нерв","артери","веноз","скелет","орган человека"]},
 {value:"physiology",label:"Физиология",words:["физиолог","рефлекс","сердечн выброс","мембранный потенциал","дыхательн объём"]},
 {value:"microbiology",label:"Микробиология",words:["микробиолог","бактери","вирус","гриб","культивирован","окраска грам"]},
 {value:"chemistry",label:"Химия",words:["хими","реакци","молярн","окислен","восстановлен","органическ соединен"]}
];
function inferSubject(text){const s=String(text||"").toLocaleLowerCase("ru");let best=null;for(const r of SUBJECT_RULES){const score=r.words.reduce((n,w)=>n+(s.includes(w)?1:0),0);if(!best||score>best.score)best={...r,score};}return best&&best.score>0?{value:best.value,label:best.label,score:best.score}:null;}
function setFeedback(message,error=false){$("feedback").textContent=message;$("feedback").style.color=error?"#b42318":"#69758b";}
async function extractFromActiveTab(){
 $("page-status").textContent="Чтение…";setFeedback("Читаю видимый текст открытой вкладки.");
 try{
  const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  if(!tab?.id||!tab.url||!/^https?:/.test(tab.url))throw new Error("Откройте обычную веб-страницу с тестом.");
  $("page-title").textContent=tab.title||"Страница без заголовка";$("page-url").textContent=new URL(tab.url).hostname;
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
   const visible=(el)=>{if(!(el instanceof HTMLElement))return false;const st=getComputedStyle(el),r=el.getBoundingClientRect();return st.display!=="none"&&st.visibility!=="hidden"&&r.width>0&&r.height>0;};
   const clean=(v)=>String(v||"").replace(/\s+/g," ").trim();
   const candidates=[...document.querySelectorAll('[role="radiogroup"],fieldset,[class*="question" i],[class*="quiz" i],[class*="test-item" i],article,main')].filter(visible);
   const scored=candidates.map(el=>{const text=clean(el.innerText).slice(0,7000),count=el.querySelectorAll('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"],label').length;return{el,text,score:Math.min(text.length,1500)/100+Math.min(count,8)*3};}).filter(x=>x.text.length>20).sort((a,b)=>b.score-a.score);
   const root=scored[0]?.el||document.querySelector("main")||document.body;
   let question="";for(const sel of ['[class*="question-text" i]','[class*="question-title" i]','[data-question-text]','[role="heading"]','h1','h2','h3','legend']){const el=[...root.querySelectorAll(sel)].find(visible);if(el&&clean(el.innerText).length>12){question=clean(el.innerText);break;}}
   const nodes=[...root.querySelectorAll('label,[role="radio"],[role="checkbox"],input[type="radio"],input[type="checkbox"],[class*="option" i],[class*="answer" i]')].filter(visible),options=[];
   for(const node of nodes){let t=clean(node.innerText||node.getAttribute("aria-label")||node.value||node.parentElement?.innerText);if(!t||t.length>500||options.includes(t))continue;if(node instanceof HTMLInputElement&&node.type!=="radio"&&node.type!=="checkbox")continue;if(t.length>1)options.push(t);if(options.length>=12)break;}
   const context=clean(root.innerText).slice(0,3500);if(!question){const lines=context.split(/\n+/).map(clean).filter(x=>x.length>15);question=lines.find(x=>x.endsWith("?"))||lines[0]||"";}
   return{title:document.title,url:location.href,question:question.slice(0,3000),options,context};
  }});
  const data=results?.[0]?.result||{},question=String(data.question||"").trim(),options=Array.isArray(data.options)?data.options.map(String):[];
  $("question").value=question;$("options").value=options.join("\n");
  const subject=inferSubject((tab.title||"")+" "+question+" "+(data.context||""));
  if(!$("subject").value&&subject){$("subject").value=subject.value;$("subject-confidence").textContent="Предположение";}
  else if(!subject)$("subject-confidence").textContent="Выберите вручную";
  $("page-status").textContent=question?"Считано":"Проверьте";
  setFeedback(question?"Вариантов распознано: "+options.length+". Проверьте вопрос и предмет.":"Вопрос не распознан автоматически. Вставьте его вручную.",!question);
 }catch(error){$("page-status").textContent="Нет доступа";setFeedback(error?.message||"Не удалось прочитать страницу.",true);}
}
$("extract").addEventListener("click",extractFromActiveTab);$("refresh").addEventListener("click",extractFromActiveTab);
$("subject").addEventListener("change",()=>$("subject-confidence").textContent=$("subject").value?"Выбрано вручную":"Не определён");
$("copy").addEventListener("click",async()=>{const question=$("question").value.trim();if(!question)return setFeedback("Сначала считайте или введите вопрос.",true);const subject=$("subject").selectedOptions[0]?.textContent||"Не определён",payload="Предмет: "+subject+"\nВопрос: "+question+"\nВарианты:\n"+$("options").value.trim();try{await navigator.clipboard.writeText(payload);setFeedback("Вопрос и варианты скопированы. В базу они пока не записываются.");}catch{setFeedback("Не удалось скопировать автоматически. Выделите текст и скопируйте вручную.",true);}});
$("open-search").addEventListener("click",()=>{const question=$("question").value.trim();if(!question)return setFeedback("Сначала считайте или введите вопрос.",true);const url=new URL("/search",APP_ORIGIN);url.searchParams.set("q",question);if($("subject").value&&$("subject").value!=="other")url.searchParams.set("subject_slug",$("subject").value);chrome.tabs.create({url:url.toString()});setFeedback("Открыта платформа с запросом. Подтверждение ответа пока не выполняется.");});
document.querySelectorAll("[data-path]").forEach(button=>button.addEventListener("click",()=>{const path=button.getAttribute("data-path")||"/";if(path.startsWith("/")&&!path.startsWith("//"))chrome.tabs.create({url:new URL(path,APP_ORIGIN).toString()});}));
extractFromActiveTab();