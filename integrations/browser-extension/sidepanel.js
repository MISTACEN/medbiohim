const APP_ORIGIN = "https://medbiohim.vercel.app";
const $ = (id) => document.getElementById(id);
let subjectWasManuallySelected = false;
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
 $("page-status").textContent="Чтение…";setFeedback("Проверяю несколько распространённых структур теста на открытой странице.");
 try{
  const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  if(!tab?.id||!tab.url||!/^https?:/.test(tab.url))throw new Error("Откройте обычную веб-страницу с тестом.");
  $("page-title").textContent=tab.title||"Страница без заголовка";$("page-url").textContent=new URL(tab.url).hostname;
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
   const clean=v=>String(v||"").replace(/[\\t\\r ]+/g," ").replace(/\\n{2,}/g,"\\n").trim();
   const visible=el=>{if(!(el instanceof Element))return false;const st=getComputedStyle(el),r=el.getBoundingClientRect();return st.display!=="none"&&st.visibility!=="hidden"&&Number(st.opacity)!==0&&r.width>0&&r.height>0;};
   const text=el=>clean(el?.innerText||el?.textContent||el?.getAttribute?.("aria-label")||"");
   const unique=arr=>[...new Set(arr.map(clean).filter(Boolean))];
   const questionSelectors=['[data-question-text]','[data-testid*="question" i]','[class*="question-text" i]','[class*="question-title" i]','[class*="question-content" i]','[class*="question" i] legend','fieldset legend','[role="heading"]','h1','h2','h3','legend'];
   const questionNodes=questionSelectors.flatMap(sel=>[...document.querySelectorAll(sel)]).filter(visible);
   const questionCandidates=unique(questionNodes.map(text).filter(t=>t.length>=12&&t.length<=1800));
   const optionSelectors=['input[type="radio"]','input[type="checkbox"]','[role="radio"]','[role="checkbox"]','label','[class*="answer-option" i]','[class*="option" i]','[data-testid*="option" i]'];
   const optionNodes=[...new Set(optionSelectors.flatMap(sel=>[...document.querySelectorAll(sel)]))].filter(visible);
   const options=unique(optionNodes.map(el=>{
    const aria=el.getAttribute("aria-label")||el.getAttribute("title");
    const labelled=el.getAttribute("aria-labelledby")?.split(/\\s+/).map(id=>document.getElementById(id)).map(text).filter(Boolean).join(" ");
    const linked=el.labels?[...el.labels].map(text).join(" "):"";
    const parent=el.closest("label")||el.closest('[role="radio"],[role="checkbox"]')||el.parentElement;
    let candidate=clean(aria||labelled||linked||text(parent)||el.value);
    if(el instanceof HTMLInputElement&&["radio","checkbox"].includes(el.type)&&candidate===clean(el.value)&&parent)candidate=text(parent);
    return candidate;
   }).filter(t=>t.length>1&&t.length<=450)).slice(0,20);
   const roots=[...new Set([...document.querySelectorAll('[role="radiogroup"],fieldset,[data-question-id],[class*="question" i],[class*="quiz-question" i],[class*="test-item" i],article,main,[role="main"]')])].filter(visible);
   const scored=roots.map(el=>{
    const t=text(el).slice(0,7000),controls=el.querySelectorAll('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"],label').length;
    const q=el.querySelectorAll(questionSelectors.join(",")).length;
    const score=Math.min(t.length,1600)/100+Math.min(controls,10)*2.5+Math.min(q,3)*2;
    return{el,t,score};
   }).filter(x=>x.t.length>20).sort((a,b)=>b.score-a.score);
   const root=scored[0]?.el||document.querySelector("main,[role=main]")||document.body;
   const rootText=text(root).slice(0,6000);
   let question=questionCandidates.find(q=>root.contains(questionNodes.find(n=>text(n)===q)))||"";
   if(!question){
    const lines=rootText.split(/\\n+/).map(clean).filter(x=>x.length>=12&&x.length<=1800);
    question=lines.find(x=>/[?？]$/.test(x))||lines.find(x=>/^(вопрос|question)\\s*\\d*/i.test(x))||lines[0]||"";
   }
   let rootOptions=unique(optionNodes.filter(el=>root.contains(el)).map(el=>{
    const p=el.closest("label")||el.closest('[role="radio"],[role="checkbox"]')||el.parentElement;
    return text(el.getAttribute("aria-label")?el:p);
   }).filter(t=>t.length>1&&t.length<=450));
   if(rootOptions.length<2)rootOptions=options;
   const imageNodes=[...new Set([...root.querySelectorAll("img,svg[aria-label],canvas,[role=img],figure")])].filter(visible).slice(0,12);
   const imageNotes=unique(imageNodes.map(el=>{
    const caption=el.closest("figure")?.querySelector("figcaption");
    return [el.getAttribute("alt"),el.getAttribute("aria-label"),el.getAttribute("title"),el.getAttribute("aria-describedby")?.split(/\\s+/).map(id=>document.getElementById(id)).map(text).filter(Boolean).join(" "),caption?text(caption):""].filter(Boolean).join(" — ");
   }).filter(Boolean)).slice(0,12);
   const imageCount=imageNodes.length;
   const context=clean([document.title,rootText,questionCandidates.join(" "),imageNotes.join(" ")].join(" ")).slice(0,5000);
   return{title:document.title,url:location.href,question:question.slice(0,3000),options:rootOptions.slice(0,20),imageNotes,imageCount,context,strategies:{questionSelectors:questionCandidates.length,optionNodes:optionNodes.length,roots:roots.length}};
  }});
  const data=results?.[0]?.result||{},question=String(data.question||"").trim(),options=Array.isArray(data.options)?data.options.map(String):[];
  $("question").value=question;$("options").value=options.join("\\n");$("image-context").value=Array.isArray(data.imageNotes)?data.imageNotes.join("\\n"):"";$("image-status").textContent=(data.imageCount||0)+" визуальных элементов в области вопроса; пиксели изображений пока не анализируются.";
  const subject=inferSubject((tab.title||"")+" "+question+" "+(data.context||"")+" "+$("image-context").value);
  if(!subjectWasManuallySelected){
   if(subject){$("subject").value=subject.value;$("subject-confidence").textContent="Предположение";}
   else{$("subject").value="";$("subject-confidence").textContent="Выберите вручную";}
  }
  $("page-status").textContent=question?"Считано":"Нужна помощь";
  setFeedback(question?"Распознано вариантов: "+options.length+". Использовано несколько способов поиска элементов; проверьте полноту текста.":"Автоматически вопрос не найден. Страница может использовать нестандартный интерфейс, iframe или защищённый/недоступный контент. Попробуйте выделить текст и вставить его вручную.",!question);
 }catch(error){$("page-status").textContent="Нет доступа";setFeedback(error?.message||"Не удалось прочитать страницу. Если сайт блокирует доступ или страница браузера служебная, расширение не обходит это ограничение.",true);}
}
$("extract").addEventListener("click",extractFromActiveTab);$("refresh").addEventListener("click",extractFromActiveTab);
$("subject").addEventListener("change",()=>{subjectWasManuallySelected=Boolean($("subject").value);$("subject-confidence").textContent=subjectWasManuallySelected?"Выбрано вручную":"Не определён";});
$("copy").addEventListener("click",async()=>{const question=$("question").value.trim();if(!question)return setFeedback("Сначала считайте или введите вопрос.",true);const subject=$("subject").selectedOptions[0]?.textContent||"Не определён",payload="Предмет: "+subject+"\nВопрос: "+question+"\nВарианты:\n"+$("options").value.trim();try{await navigator.clipboard.writeText(payload);setFeedback("Вопрос и варианты скопированы. В базу они пока не записываются.");}catch{setFeedback("Не удалось скопировать автоматически. Выделите текст и скопируйте вручную.",true);}});
$("open-search").addEventListener("click",()=>{const question=$("question").value.trim();if(!question)return setFeedback("Сначала считайте или введите вопрос.",true);const url=new URL("/search",APP_ORIGIN);const imageContext=$("image-context").value.trim();url.searchParams.set("q",[question,$("options").value.trim(),imageContext].filter(Boolean).join(" "));if($("subject").value&&$("subject").value!=="other")url.searchParams.set("subject_slug",$("subject").value);chrome.tabs.create({url:url.toString()});setFeedback("Открыта платформа с запросом. Подтверждение ответа пока не выполняется.");});
document.querySelectorAll("[data-path]").forEach(button=>button.addEventListener("click",()=>{const path=button.getAttribute("data-path")||"/";if(path.startsWith("/")&&!path.startsWith("//"))chrome.tabs.create({url:new URL(path,APP_ORIGIN).toString()});}));
extractFromActiveTab();