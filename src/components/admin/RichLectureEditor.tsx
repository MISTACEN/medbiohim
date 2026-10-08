"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, BarChart3, Bold, Braces, FileText,
  ImagePlus, Italic, Link2, List, ListOrdered, Loader2, Quote, Redo2,
  Search, Strikethrough, Subscript, Superscript, Table2, Trash2,
  Underline, Undo2, Video, Wand2, X,
} from "lucide-react";
import { getTrainerFeed, uploadFile, getFileDownload, fileDownloadUrl } from "@/lib/api";

type Subject = { slug: string; name: string };
type Attachment = {
  id?: string; file_id?: string; type: "image"|"video"|"pdf"|"file";
  name: string; url?: string; mime_type?: string; page?: number; caption?: string;
};
type SearchResult = { title: string; url: string; thumb?: string; mime?: string; isVideo?: boolean };
type BlockKind = "mermaid"|"quiz"|"chart"|"chem"|"video"|"formula"|"image"|"table";

type Props = {
  value: string;
  onChange: (value: { html: string; markdown: string }) => void;
  attachments: Attachment[];
  setAttachments: (value: Attachment[]) => void;
  subject: Subject | null;
  topic: string;
};

const BLOCK_LABELS: Record<BlockKind,string> = {
  mermaid:"Схема", quiz:"Мини-тест", chart:"Диаграмма", chem:"Химическая фигура",
  video:"Видео", formula:"Формула", image:"Изображение", table:"Таблица",
};
const FENCE = String.fromCharCode(96).repeat(3);

function esc(v:string){
  return v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function enc(v:string){ return encodeURIComponent(v); }
function dec(v:string){ try{return decodeURIComponent(v);}catch{return v;} }

function blockHtml(kind:BlockKind,raw:string,title?:string){
  const id = "mbh-" + Date.now() + "-" + Math.random().toString(36).slice(2,7);
  const label = title || BLOCK_LABELS[kind];
  return '<div contenteditable="false" data-mbh-block="'+kind+'" data-mbh-content="'+enc(raw)+'" data-mbh-id="'+id+'" class="mbh-block my-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3">' +
    '<div class="flex items-center justify-between gap-3"><div class="flex items-center gap-2 text-sm font-semibold text-indigo-800"><span>▦</span><span data-mbh-label="1">'+esc(label)+'</span></div>' +
    '<div class="flex items-center gap-1"><button type="button" data-mbh-edit="1" class="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-700">Изменить</button><button type="button" data-mbh-remove="1" class="rounded-lg border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700">Удалить</button></div></div>' +
    '<div class="mt-1 text-[11px] text-indigo-700/70">Блок MEDBIOHIM · хранится в лекции без потери исходной структуры</div></div><p><br></p>';
}

function findBlocks(md:string){
  const blocks:string[] = [];
  const re = new RegExp(FENCE + '(chart|video|image|mermaid|chem|quiz)\\s*\\r?\\n([\\\\s\\\\S]*?)\\r?\\n?' + FENCE,'gi');
  let text = String(md||"");
  text = text.replace(re,(_all:string,kind:string,raw:string)=>{
    const index=blocks.length;
    blocks.push(JSON.stringify({kind:kind.toLowerCase(),raw:raw.trim()}));
    return "\\n@@MBH_BLOCK_"+index+"@@\\n";
  });
  text = text.replace(/\\$\\$([\\\\s\\\\S]+?)\\$\\$/g,(_all:string,raw:string)=>{
    const index=blocks.length;
    blocks.push(JSON.stringify({kind:"formula",raw:"$$"+raw.trim()+"$$"}));
    return "\\n@@MBH_BLOCK_"+index+"@@\\n";
  });
  return {text,blocks};
}

function markdownTableToHtml(raw:string){
  const rows=raw.trim().split("\\n").filter(Boolean);
  if(rows.length<2)return raw;
  const row=(line:string)=>line.split("|").slice(1,-1).map((c)=>c.trim());
  if(!/^\\|?\\s*:?-{3,}:?\\s*(?:\\|\\s*:?-{3,}:?\\s*)+\\|?$/.test(rows[1]))return raw;
  const head=row(rows[0]), body=rows.slice(2).map(row);
  return '<div class="lec-table-wrap"><table class="lec-table"><thead><tr>'+
    head.map((c)=>"<th>"+c+"</th>").join("")+"</tr></thead><tbody>"+
    body.map((cells)=>"<tr>"+cells.map((c)=>"<td>"+c+"</td>").join("")+"</tr>").join("")+
    "</tbody></table></div>";
}

function markdownToHtml(md:string){
  const protectedBlocks=findBlocks(md);
  let s=protectedBlocks.text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  s=s.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>");
  s=s.replace(/\\*\\*(.+?)\\*\\*/g,"<strong>$1</strong>").replace(/(?<!\\*)\\*([^*\\n]+)\\*(?!\\*)/g,"<em>$1</em>");
  s=s.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+|\\/[^)\\s]*)\\)/g,'<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  s=s.replace(/^>\\s+(.+)$/gm,"<blockquote>$1</blockquote>");
  s=s.replace(/^-\\s+(.+)$/gm,"<li>$1</li>").replace(/^\\d+\\.\\s+(.+)$/gm,"<li>$1</li>");
  s=s.replace(/(<li>.*<\\/li>\\n?)+/g,(v)=>"<ul>"+v+"</ul>");
  s=s.replace(/(?:^\\|.+\\|\\n?)+/gm,(table)=>markdownTableToHtml(table));
  s=s.replace(/@@MBH_BLOCK_(\\d+)@@/g,(_m:string,index:string)=>{
    const spec=JSON.parse(protectedBlocks.blocks[Number(index)]) as {kind:BlockKind;raw:string};
    let title=BLOCK_LABELS[spec.kind];
    try{
      const data=JSON.parse(spec.raw);
      if(data?.caption)title=String(data.caption);
      if(data?.title)title=String(data.title);
      if(data?.trainerId)title="Препарат · "+String(data.trainerId);
    }catch{}
    return blockHtml(spec.kind,spec.raw,title);
  });
  return s.split(/\\n{2,}/).map((part)=>{
    const t=part.trim(); if(!t)return "";
    if(/^(<h[1-3]>|<blockquote>|<ul>|<div class="lec-table-wrap">|<div contenteditable="false")/i.test(t))return t;
    return "<p>"+t.replace(/\\n/g,"<br>")+"</p>";
  }).join("");
}

function sanitizeHtml(raw:string){
  if(typeof window==="undefined")return raw;
  const doc=new DOMParser().parseFromString(raw,"text/html");
  const allowed=new Set(["P","DIV","BR","STRONG","B","EM","I","U","S","STRIKE","SUP","SUB","H1","H2","H3","H4","UL","OL","LI","BLOCKQUOTE","A","IMG","VIDEO","IFRAME","HR","SPAN","TABLE","THEAD","TBODY","TR","TH","TD","FONT","BUTTON"]);
  const walk=(root:Node)=>{
    [...root.childNodes].forEach((node)=>{
      if(node.nodeType!==Node.ELEMENT_NODE){if(node.parentNode)walk(node);return;}
      const el=node as HTMLElement;
      if(!allowed.has(el.tagName)){
        const p=el.parentNode;
        if(p){while(el.firstChild)p.insertBefore(el.firstChild,el);p.removeChild(el);}
        return;
      }
      [...el.attributes].forEach((a)=>{
        const keep=["href","src","alt","title","target","rel","width","height","style","class","contenteditable","data-mbh-block","data-mbh-content","data-mbh-id","data-mbh-label","data-mbh-remove","data-mbh-edit"].includes(a.name);
        if(!keep)el.removeAttribute(a.name);
        if(a.name==="style"){
          const safe=a.value.split(";").map((v)=>v.trim()).filter((v)=>
            /^(font-size|font-weight|font-style|text-decoration|text-align|color|background-color)\\s*:/i.test(v) &&
            !/url\\s*\\(|expression\\s*\\(|javascript:/i.test(v)
          ).join(";");
          if(safe)el.setAttribute("style",safe);else el.removeAttribute("style");
        }
      });
      if(el.dataset.mbhBlock&&!el.dataset.mbhContent){
        el.remove();return;
      }
      if(el.hasAttribute("href")||el.hasAttribute("src")){
        const attr=el.hasAttribute("href")?"href":"src";
        try{const u=new URL(el.getAttribute(attr)||"",window.location.origin);if(!["http:","https:","blob:"].includes(u.protocol))el.removeAttribute(attr);}
        catch{el.removeAttribute(attr);}
      }
      if(el.tagName==="IFRAME"){
        const src=el.getAttribute("src")||"";
        if(!/^https:\\/\\/(www\\.)?(youtube\\.com|youtube-nocookie\\.com|rutube\\.ru|vk\\.com)\\//i.test(src))el.remove();
        else{el.setAttribute("allowfullscreen","true");el.setAttribute("loading","lazy");}
      }
      if(el.tagName==="A"){el.setAttribute("target","_blank");el.setAttribute("rel","noreferrer");}
      if(el.parentNode)walk(el);
    });
  };
  walk(doc.body);return doc.body.innerHTML;
}

function tableToMarkdown(table:HTMLTableElement){
  const rows=[...table.rows].map((row)=>[...row.cells].map((cell)=>(cell.textContent||"").trim().replace(/\\|/g,"\\\\|")));
  if(!rows.length)return "";
  const divider=rows[0].map(()=>"---");
  return "|"+rows[0].join("|")+"|\\n|"+divider.join("|")+"|\\n"+rows.slice(1).map((r)=>"|"+r.join("|")+"|").join("\\n")+"\\n";
}

function htmlToMarkdown(html:string){
  if(typeof window==="undefined")return html;
  const doc=new DOMParser().parseFromString(html,"text/html");
  const render=(node:Node):string=>{
    if(node.nodeType===Node.TEXT_NODE)return(node.textContent||"").replace(/\\u00a0/g," ");
    if(node.nodeType!==Node.ELEMENT_NODE)return "";
    const el=node as HTMLElement;
    if(el.dataset.mbhBlock&&el.dataset.mbhContent)return "\\n"+dec(el.dataset.mbhContent)+"\\n";
    if(el.tagName==="TABLE")return "\\n"+tableToMarkdown(el as HTMLTableElement)+"\\n";
    const inner=[...el.childNodes].map(render).join("");
    switch(el.tagName){
      case "H1":return "# "+inner.trim()+"\\n\\n";
      case "H2":return "## "+inner.trim()+"\\n\\n";
      case "H3":return "### "+inner.trim()+"\\n\\n";
      case "STRONG":case "B":return "**"+inner+"**";
      case "EM":case "I":return "*"+inner+"*";
      case "SUP":return "^"+inner+"^";
      case "SUB":return "_"+inner+"_";
      case "U":return "_"+inner+"_";
      case "S":case "STRIKE":return "~~"+inner+"~~";
      case "BLOCKQUOTE":return "> "+inner.trim()+"\\n\\n";
      case "LI":return "- "+inner.trim()+"\\n";
      case "A":return "["+inner+"]("+(el.getAttribute("href")||"")+")";
      case "IMG":return "\\n"+FENCE+"image\\n"+JSON.stringify({url:el.getAttribute("src")||"",caption:el.getAttribute("alt")||""})+"\\n"+FENCE+"\\n";
      case "VIDEO":return "\\n"+FENCE+"video\\n"+JSON.stringify({url:el.getAttribute("src")||"",caption:el.getAttribute("title")||"Видео"})+"\\n"+FENCE+"\\n";
      case "IFRAME":return "\\n"+FENCE+"video\\n"+JSON.stringify({url:el.getAttribute("src")||"",caption:el.getAttribute("title")||"Видео"})+"\\n"+FENCE+"\\n";
      case "BUTTON":return "";
      case "P":case "DIV":return inner.trim()+"\\n\\n";
      case "BR":return "\\n";
      default:return inner;
    }
  };
  return [...doc.body.childNodes].map(render).join("").replace(/\\n{3,}/g,"\\n\\n").trim();
}

function insertAtSelection(ref:RefObject<HTMLDivElement|null>,html:string){
  ref.current?.focus();document.execCommand("insertHTML",false,html);
}

function videoEmbedUrl(raw:string){
  const yt=raw.match(/(?:youtube\\.com\\/(?:watch\\?v=|embed\\/)|youtu\\.be\\/)([A-Za-z0-9_-]{6,})/i);
  if(yt)return "https://www.youtube-nocookie.com/embed/"+yt[1];
  const rt=raw.match(/rutube\\.ru\\/(?:video\\/|play\\/)([A-Za-z0-9_-]+)/i);
  if(rt)return "https://rutube.ru/play/embed/"+rt[1];
  return raw.trim();
}

export function RichLectureEditor({value,onChange,attachments,setAttachments,subject,topic}:Props){
  const ref=useRef<HTMLDivElement>(null);
  const loadedValue=useRef("");
  const [block,setBlock]=useState<BlockKind|null>(null);
  const [blockTab,setBlockTab]=useState<"builder"|"raw">("builder");
  const [rawEditId,setRawEditId]=useState("");
  const [rawEditKind,setRawEditKind]=useState<BlockKind>("mermaid");
  const [rawEdit,setRawEdit]=useState("");
  const [searching,setSearching]=useState(false);
  const [results,setResults]=useState<SearchResult[]>([]);
  const [query,setQuery]=useState("");
  const [mediaTab,setMediaTab]=useState<"image"|"video">("image");
  const [page,setPage]=useState("1");
  const [link,setLink]=useState("");
  const [busyUpload,setBusyUpload]=useState(false);
  const [trainerLoading,setTrainerLoading]=useState(false);
  const [trainerQuery,setTrainerQuery]=useState("");
  const [trainerCards,setTrainerCards]=useState<any[]>([]);
  const [schemeDirection,setSchemeDirection]=useState("TD");
  const [schemeNodes,setSchemeNodes]=useState("A|КРОВЬ\\nB|Плазма\\nC|Форменные элементы");
  const [schemeEdges,setSchemeEdges]=useState("A -> B\\nA -> C");
  const [schemeRaw,setSchemeRaw]=useState("flowchart TD\\nA[КРОВЬ] --> B[Плазма]\\nA --> C[Форменные элементы]");
  const [quizTitle,setQuizTitle]=useState("Проверь себя");
  const [quizSubjectId,setQuizSubjectId]=useState("");
  const [quizIds,setQuizIds]=useState("");
  const [chartTitle,setChartTitle]=useState("");
  const [chartLabels,setChartLabels]=useState("");
  const [chartValues,setChartValues]=useState("");
  const [chartUnit,setChartUnit]=useState("");
  const [chemQuery,setChemQuery]=useState("");
  const [chemRepresentation,setChemRepresentation]=useState("2d");
  const [chemCaption,setChemCaption]=useState("");
  const [videoUrl,setVideoUrl]=useState("");
  const [videoCaption,setVideoCaption]=useState("");
  const [formula,setFormula]=useState("\\\\frac{a}{b}");
  const [tableText,setTableText]=useState("Показатель\\tЗначение\\nЭритроциты\\t4,0–5,5 × 10¹²/л\\nHb\\t130–160 г/л");
  const [tableHeader,setTableHeader]=useState(true);

  useEffect(()=>{
    if(ref.current&&value!==loadedValue.current){
      ref.current.innerHTML=markdownToHtml(value||"");
      loadedValue.current=value;
    }
  },[value]);

  function emit(){
    if(!ref.current)return;
    const html=sanitizeHtml(ref.current.innerHTML);
    if(ref.current.innerHTML!==html)ref.current.innerHTML=html;
    const markdown=htmlToMarkdown(html);
    loadedValue.current=markdown;
    onChange({html,markdown});
  }
  function command(cmd:string,val?:string){
    ref.current?.focus();document.execCommand(cmd,false,val);emit();
  }
  function insertBlock(kind:BlockKind,raw:string,title?:string){
    insertAtSelection(ref,blockHtml(kind,raw,title));emit();setBlock(null);
  }
  function makeScheme(){
    const nodes=schemeNodes.split(/\\n+/).map((line)=>line.split("|").map((v)=>v.trim())).filter((v)=>v[0]);
    const ids=new Set(nodes.map((v)=>v[0]));
    const lines=["flowchart "+schemeDirection];
    nodes.forEach((parts)=>{
      const id=parts[0].replace(/[^A-Za-z0-9_]/g,"_");
      const label=(parts.slice(1).join("|")||parts[0]).replace(/"/g,"'");
      lines.push(id+'["'+label+'"]');
    });
    schemeEdges.split(/\\n+/).map((v)=>v.trim()).filter(Boolean).forEach((edge)=>{
      const parts=edge.split(/\\s*(?:->|-->)\\s*/);
      if(parts.length>=2&&ids.has(parts[0])&&ids.has(parts[1]))lines.push(parts[0].replace(/[^A-Za-z0-9_]/g,"_")+" --> "+parts[1].replace(/[^A-Za-z0-9_]/g,"_"));
    });
    setSchemeRaw(lines.join("\\n"));setBlockTab("raw");
  }
  function insertTable(){
    const rows=tableText.split(/\\n+/).map((line)=>line.split("\\t"));
    const width=Math.max(...rows.map((r)=>r.length),1);
    const normal=rows.map((r)=>Array.from({length:width},(_,i)=>r[i]||""));
    const lines=normal.map((r)=>"|"+r.map((v)=>v.replace(/\\|/g,"\\\\|").trim()).join("|")+"|");
    const raw=tableHeader
      ? lines[0]+"\\n|"+Array.from({length:width},()=> "---").join("|")+"|\\n"+lines.slice(1).join("\\n")
      : "|"+Array.from({length:width},()=> "").join("|")+"|\\n|"+Array.from({length:width},()=> "---").join("|")+"|\\n"+lines.join("\\n");
    insertAtSelection(ref,markdownToHtml(raw));emit();setBlock(null);
  }
  function insertFormula(){insertBlock("formula","$$\\n"+formula.trim()+"\\n$$","Формула");}
  function insertQuiz(){
    const ids=quizIds.split(/[\\s,]+/).map((v)=>v.trim()).filter(Boolean);
    insertBlock("quiz",JSON.stringify({subjectId:quizSubjectId.trim(),title:quizTitle.trim()||"Проверь себя",questionIds:ids},null,2),quizTitle.trim()||"Мини-тест");
  }
  function insertChart(){
    const labels=chartLabels.split(/[,;\\n]+/).map((v)=>v.trim()).filter(Boolean);
    const values=chartValues.split(/[,;\\n]+/).map((v)=>Number(v.trim())).filter((v)=>Number.isFinite(v));
    insertBlock("chart",JSON.stringify({type:"bar",title:chartTitle.trim()||undefined,labels,values,unit:chartUnit.trim()||undefined},null,2),chartTitle.trim()||"Диаграмма");
  }
  function insertChem(){
    insertBlock("chem",JSON.stringify({query:chemQuery.trim(),representation:chemRepresentation,caption:chemCaption.trim()||undefined},null,2),chemCaption.trim()||chemQuery.trim()||"Химическая фигура");
  }
  function insertVideo(){
    if(!videoUrl.trim())return;
    insertBlock("video",JSON.stringify({url:videoEmbedUrl(videoUrl),caption:videoCaption.trim()||"Видео"},null,2),videoCaption.trim()||"Видео");
    setVideoUrl("");setVideoCaption("");
  }
  async function uploadAndInsert(file:File){
    setBusyUpload(true);
    try{
      const r:any=await uploadFile(file,undefined,"mbh");
      if(!r.ok)throw new Error(r.error?.message||"Не удалось загрузить файл");
      const id=String(r.data?.file?.id||"");if(!id)throw new Error("Сервер не вернул ID файла");
      await getFileDownload(id);
      const url=fileDownloadUrl(id);
      const mime=String(r.data?.file?.mime_type||file.type||"");
      const type:Attachment["type"]=mime==="application/pdf"?"pdf":mime.startsWith("image/")?"image":mime.startsWith("video/")?"video":"file";
      setAttachments([...attachments,{file_id:id,type,name:file.name,url,mime_type:mime,page:type==="pdf"?Number(page)||1:undefined}]);
      if(type==="image"&&url)insertAtSelection(ref,'<p><img src="'+url+'" alt="'+esc(file.name)+'" title="'+esc(file.name)+'" /></p>');
      else if(type==="video"&&url)insertAtSelection(ref,'<p><video controls src="'+url+'" title="'+esc(file.name)+'"></video></p>');
      else if(type==="pdf"&&url)insertAtSelection(ref,'<p><a href="'+url+'#page='+(Number(page)||1)+'">'+esc(file.name)+" — открыть PDF, стр. "+(Number(page)||1)+"</a></p>");
      else if(url)insertAtSelection(ref,'<p><a href="'+url+'">'+esc(file.name)+"</a></p>");
      emit();
    }catch(e){alert(e instanceof Error?e.message:"Ошибка загрузки");}
    finally{setBusyUpload(false);}
  }
  async function searchWeb(){
    const q=(query.trim()||[subject?.name,topic,mediaTab==="video"?"lecture video":"histology medical diagram"].filter(Boolean).join(" ")).trim();
    if(!q)return;
    setSearching(true);setResults([]);
    try{
      const url="https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch="+encodeURIComponent(q)+"&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=640&format=json&origin=*";
      const data=await fetch(url).then((r)=>r.json());
      const rows=Object.values(data?.query?.pages||{}) as any[];
      setResults(rows.map((item:any)=>({
        title:String(item.title||"").replace(/^File:/,""),
        url:String(item.imageinfo?.[0]?.url||""),
        thumb:String(item.imageinfo?.[0]?.thumburl||""),
        mime:String(item.imageinfo?.[0]?.mime||""),
        isVideo:String(item.imageinfo?.[0]?.mime||"").startsWith("video/")
      })).filter((item:SearchResult)=>item.url&&(mediaTab==="image"?!item.isVideo:item.isVideo)));
    }catch{setResults([]);}
    finally{setSearching(false);}
  }
  function useSearchResult(item:SearchResult){
    if(mediaTab==="image"){
      insertAtSelection(ref,'<p><img src="'+item.url+'" alt="'+esc(item.title)+'" title="'+esc(item.title)+'" /></p>');
      setAttachments([...attachments,{type:"image",name:item.title,url:item.url,caption:item.title}]);emit();
    }else{
      insertBlock("video",JSON.stringify({url:item.url,caption:item.title},null,2),item.title);
    }
  }
  async function loadTrainer(){
    setTrainerLoading(true);
    try{const r:any=await getTrainerFeed(subject?.slug||"histology","mbh",100,0);setTrainerCards(Array.isArray(r?.data?.items)?r.data.items:[]);}
    finally{setTrainerLoading(false);}
  }
  function openTrainerPicker(){setBlock("image");void loadTrainer();}
  const filteredTrainer=useMemo(()=>{
    const q=trainerQuery.trim().toLowerCase();
    if(!q)return trainerCards.slice(0,60);
    return trainerCards.filter((item:any)=>[
      item.id,item.preparation?.name,item.preparation?.organ,item.question?.prompt,...(Array.isArray(item.tags)?item.tags:[])
    ].join(" ").toLowerCase().includes(q)).slice(0,60);
  },[trainerCards,trainerQuery]);

  function openRawEdit(el:HTMLElement){
    const kind=el.dataset.mbhBlock as BlockKind;
    const raw=dec(el.dataset.mbhContent||"");
    setRawEditId(String(el.dataset.mbhId||""));
    setRawEditKind(kind);setRawEdit(raw);setBlock(null);
  }
  function saveRawEdit(){
    if(!ref.current||!rawEditId)return;
    const el=ref.current.querySelector('[data-mbh-id="'+CSS.escape(rawEditId)+'"]') as HTMLElement|null;
    if(!el)return;
    el.dataset.mbhContent=enc(rawEdit);
    const label=el.querySelector("[data-mbh-label]") as HTMLElement|null;
    if(label){
      let title=BLOCK_LABELS[rawEditKind];
      try{const data=JSON.parse(rawEdit);if(data.title)title=String(data.title);else if(data.caption)title=String(data.caption);else if(data.trainerId)title="Препарат · "+String(data.trainerId);}catch{}
      label.textContent=title;
    }
    setRawEditId("");setRawEdit("");emit();
  }

  function btn(label:string,title:string,action:()=>void,icon:React.ReactNode){
    return <button type="button" title={title} aria-label={title} onClick={action} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-white px-2 text-xs font-semibold hover:bg-slate-50">{icon}<span className="hidden lg:inline">{label}</span></button>;
  }

  return <div className="lecture-editor-shell">
    <div className="lecture-editor-toolbar flex flex-wrap items-center gap-1">
      {btn("Ж","Жирный",()=>command("bold"),<Bold className="h-4 w-4"/>)}
      {btn("К","Курсив",()=>command("italic"),<Italic className="h-4 w-4"/>)}
      {btn("П","Подчёркивание",()=>command("underline"),<Underline className="h-4 w-4"/>)}
      {btn("З","Зачёркивание",()=>command("strikeThrough"),<Strikethrough className="h-4 w-4"/>)}
      {btn("x²","Верхний индекс",()=>command("superscript"),<Superscript className="h-4 w-4"/>)}
      {btn("x₂","Нижний индекс",()=>command("subscript"),<Subscript className="h-4 w-4"/>)}
      <select title="Заголовок" defaultValue="p" onChange={(e)=>command("formatBlock",e.target.value)} className="h-9 rounded-lg border border-[var(--border)] bg-white px-2 text-xs"><option value="p">Обычный</option><option value="h1">H1</option><option value="h2">H2</option><option value="h3">H3</option><option value="h4">H4</option></select>
      <select title="Размер текста" defaultValue="3" onChange={(e)=>command("fontSize",e.target.value)} className="h-9 rounded-lg border border-[var(--border)] bg-white px-2 text-xs"><option value="2">Маленький</option><option value="3">Обычный</option><option value="4">Крупный</option><option value="5">Крупный+</option><option value="6">Огромный</option></select>
      {btn("•","Маркированный список",()=>command("insertUnorderedList"),<List className="h-4 w-4"/>)}
      {btn("1.","Нумерованный список",()=>command("insertOrderedList"),<ListOrdered className="h-4 w-4"/>)}
      {btn("Цитата","Цитата",()=>command("formatBlock","blockquote"),<Quote className="h-4 w-4"/>}
      {btn("←","Слева",()=>command("justifyLeft"),<AlignLeft className="h-4 w-4"/>)}{btn("↔","Центр",()=>command("justifyCenter"),<AlignCenter className="h-4 w-4"/>)}{btn("→","Справа",()=>command("justifyRight"),<AlignRight className="h-4 w-4"/>}
      <input value={link} onChange={(e)=>setLink(e.target.value)} className="h-9 min-w-[180px] flex-1 rounded-lg border border-[var(--border)] px-2 text-xs" placeholder="https://..."/>
      {btn("Ссылка","Вставить ссылку",()=>{if(link.trim()){command("createLink",link.trim());setLink("")}},<Link2 className="h-4 w-4"/>)}
      {btn("Таблица","Создать таблицу",()=>setBlock("table"),<Table2 className="h-4 w-4"/>)}{btn("Схема","Создать схему",()=>{setBlock("mermaid");setBlockTab("builder")},<Wand2 className="h-4 w-4"/>)}
      {btn("Мини-тест","Создать мини-тест",()=>setBlock("quiz"),<Braces className="h-4 w-4"/>)}{btn("Диаграмма","Создать диаграмму",()=>setBlock("chart"),<BarChart3 className="h-4 w-4"/>)}{btn("Формула","Создать формулу",()=>setBlock("formula"),<span className="font-bold">∑</span>)}
      {btn("Химия","Создать химическую фигуру",()=>setBlock("chem"),<span className="font-bold">⚗</span>)}{btn("Видео","Вставить видео",()=>setBlock("video"),<Video className="h-4 w-4"/>)}{btn("Препарат","Вставить препарат из атласа",openTrainerPicker,<ImagePlus className="h-4 w-4"/>)}
      <label title="Загрузить изображение" className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-white px-2 cursor-pointer"><ImagePlus className="h-4 w-4"/><input type="file" accept="image/*" className="hidden" onChange={(e)=>{const f=e.target.files?.[0];if(f)void uploadAndInsert(f);e.currentTarget.value=""}}/></label>
      <label title="Загрузить видео" className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-white px-2 cursor-pointer"><Video className="h-4 w-4"/><input type="file" accept="video/*" className="hidden" onChange={(e)=>{const f=e.target.files?.[0];if(f)void uploadAndInsert(f);e.currentTarget.value=""}}/></label>
      <label title="Загрузить PDF/Word" className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-white px-2 cursor-pointer"><FileText className="h-4 w-4"/><input type="file" accept="application/pdf,.doc,.docx" className="hidden" onChange={(e)=>{const f=e.target.files?.[0];if(f)void uploadAndInsert(f);e.currentTarget.value=""}}/></label>
      {btn("↶","Отменить",()=>command("undo"),<Undo2 className="h-4 w-4"/>)}{btn("↷","Повторить",()=>command("redo"),<Redo2 className="h-4 w-4"/>)}
    </div>

    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[11px] text-indigo-800">
      <b>Эталон Лекции 5:</b> схемы Mermaid, таблицы, мини-тесты, формулы, препараты/ЭМ, диаграммы, химические фигуры, видео, PDF и Word-файлы можно создавать и редактировать. При сохранении специальные блоки не преобразуются в обычный текст.
    </div>

    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className="lecture-editor-content min-h-[520px]"
      onInput={emit}
      onClick={(e)=>{
        const target=e.target as HTMLElement;
        const edit=target.closest("[data-mbh-edit]") as HTMLElement|null;
        const remove=target.closest("[data-mbh-remove]") as HTMLElement|null;
        const box=target.closest("[data-mbh-block]") as HTMLElement|null;
        if(edit&&box){e.preventDefault();openRawEdit(box);return;}
        if(remove&&box){e.preventDefault();box.remove();emit();return;}
      }}
      onPaste={(e)=>{
        e.preventDefault();
        const html=e.clipboardData.getData("text/html");
        const text=e.clipboardData.getData("text/plain");
        insertAtSelection(ref,html||"<p>"+esc(text).replace(/\\n/g,"<br>")+"</p>");emit();
      }}
    />

    <div className="lecture-editor-media space-y-3">
      <div className="lecture-media-head"><div><b>Медиа и поиск</b><span>поиск учитывает предмет и тему лекции</span></div><Search className="h-4 w-4"/></div>
      <div className="lecture-media-tabs"><button type="button" className={mediaTab==="image"?"active":""} onClick={()=>setMediaTab("image")}>Картинки</button><button type="button" className={mediaTab==="video"?"active":""} onClick={()=>setMediaTab("video")}>Видео</button></div>
      <div className="lecture-media-search"><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={subject?.name?subject.name+" · "+(topic||"тема"):"Тема, препарат, процесс…"} onKeyDown={(e)=>{if(e.key==="Enter")void searchWeb()}}/><button type="button" onClick={()=>void searchWeb()} disabled={searching}><Search className="h-4 w-4"/>{searching?"Ищу…":"Найти в интернете"}</button></div>
      {results.length>0&&<div className="lecture-search-results">{results.map((item,i)=><button key={i} type="button" className="lecture-search-result" onClick={()=>useSearchResult(item)}>{item.thumb&&<img src={item.thumb} alt="" />}{item.isVideo&&<Video className="h-5 w-5"/>}<span>{item.title}</span></button>)}</div>}
      <div className="lecture-editor-urlrow"><input value={page} onChange={(e)=>setPage(e.target.value.replace(/\\D/g,""))} inputMode="numeric" placeholder="Стр. PDF"/><span>страница PDF</span><button type="button" onClick={()=>{if(link.trim()){insertAtSelection(ref,'<p><a href="'+link.trim()+'#page='+(Number(page)||1)+'">'+esc(link.trim())+" · PDF, стр. "+(Number(page)||1)+"</a></p>");emit();setLink("")}}}>Вставить PDF-ссылку</button></div>
      <div className="lecture-attachments"><b>Прикреплено к лекции</b>{attachments.length===0?<span>пока нет</span>:attachments.map((a,i)=><span key={i} className="lecture-attachment">{String(a.type).toUpperCase()} · {a.name}{a.page?" · стр. "+a.page:""}<button type="button" onClick={()=>setAttachments(attachments.filter((_,j)=>j!==i))}><Trash2 className="h-3 w-3"/></button></span>)}</div>
      {busyUpload&&<div className="lecture-uploading"><Loader2 className="h-4 w-4 animate-spin"/> Загружаю файл…</div>}
    </div>

    {block&&<div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/20 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-indigo-600">{BLOCK_LABELS[block]}</div><h3 className="mt-1 text-lg font-extrabold text-slate-900">Создать блок</h3></div><button type="button" onClick={()=>setBlock(null)} className="rounded-xl p-2 hover:bg-slate-100"><X className="h-5 w-5"/></button></div>

        {block==="mermaid"&&<div className="mt-5 space-y-4">
          <div className="flex gap-2"><button type="button" className={"rounded-xl px-3 py-1.5 text-xs font-semibold "+(blockTab==="builder"?"bg-indigo-600 text-white":"border")} onClick={()=>setBlockTab("builder")}>Конструктор</button><button type="button" className={"rounded-xl px-3 py-1.5 text-xs font-semibold "+(blockTab==="raw"?"bg-indigo-600 text-white":"border")} onClick={()=>setBlockTab("raw")}>Код Mermaid</button></div>
          {blockTab==="builder"&&<><label className="block text-sm font-semibold">Направление<select value={schemeDirection} onChange={(e)=>setSchemeDirection(e.target.value)} className="mt-1 w-full rounded-xl border p-2"><option value="TD">Сверху вниз</option><option value="LR">Слева направо</option><option value="RL">Справа налево</option><option value="BT">Снизу вверх</option></select></label><label className="block text-sm font-semibold">Узлы <span className="font-normal text-slate-500">ID|Название</span><textarea value={schemeNodes} onChange={(e)=>setSchemeNodes(e.target.value)} rows={6} className="mt-1 w-full rounded-xl border p-3 font-mono text-xs"/></label><label className="block text-sm font-semibold">Связи <span className="font-normal text-slate-500">например A -&gt; B</span><textarea value={schemeEdges} onChange={(e)=>setSchemeEdges(e.target.value)} rows={5} className="mt-1 w-full rounded-xl border p-3 font-mono text-xs"/></label><button type="button" onClick={makeScheme} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"><Wand2 className="h-4 w-4"/> Собрать схему</button></>}
          {blockTab==="raw"&&<textarea value={schemeRaw} onChange={(e)=>setSchemeRaw(e.target.value)} rows={14} className="mt-4 w-full rounded-xl border p-3 font-mono text-xs"/>}
          <div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" onClick={()=>insertBlock("mermaid",schemeRaw,"Схема")} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Вставить схему</button></div>
        </div>}

        {block==="table"&&<div className="mt-5 space-y-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tableHeader} onChange={(e)=>setTableHeader(e.target.checked)}/> Первая строка — заголовок</label><label className="block text-sm font-semibold">Данные<textarea value={tableText} onChange={(e)=>setTableText(e.target.value)} rows={10} className="mt-1 w-full rounded-xl border p-3 font-mono text-xs" placeholder={"Колонка 1\\tКолонка 2\\nЗначение\\tЗначение"}/></label><div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" onClick={insertTable} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Вставить таблицу</button></div></div>}

        {block==="quiz"&&<div className="mt-5 space-y-3"><input value={quizTitle} onChange={(e)=>setQuizTitle(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Название мини-теста"/><input value={quizSubjectId} onChange={(e)=>setQuizSubjectId(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="UUID предмета"/><textarea value={quizIds} onChange={(e)=>setQuizIds(e.target.value)} rows={7} className="w-full rounded-xl border p-3 font-mono text-xs" placeholder="ID вопроса 1\\nID вопроса 2\\nID вопроса 3"/><p className="text-xs text-slate-500">Можно вставлять ID существующих опубликованных вопросов из раздела «Тесты и билеты».</p><div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" disabled={!quizSubjectId.trim()||!quizIds.trim()} onClick={insertQuiz} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Вставить мини-тест</button></div></div>}

        {block==="chart"&&<div className="mt-5 space-y-3"><input value={chartTitle} onChange={(e)=>setChartTitle(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Заголовок"/><input value={chartLabels} onChange={(e)=>setChartLabels(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Подписи: Норма, Ребёнок, Взрослый"/><input value={chartValues} onChange={(e)=>setChartValues(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Значения: 45, 60, 25"/><input value={chartUnit} onChange={(e)=>setChartUnit(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Единицы"/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" onClick={insertChart} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Вставить диаграмму</button></div></div>}

        {block==="formula"&&<div className="mt-5 space-y-3"><textarea value={formula} onChange={(e)=>setFormula(e.target.value)} rows={6} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder={"\\frac{a}{b}"}/><div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">LaTeX/KaTeX: дроби, индексы, степени, Greek-символы и т.д.</div><div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" onClick={insertFormula} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Вставить формулу</button></div></div>}

        {block==="chem"&&<div className="mt-5 space-y-3"><input value={chemQuery} onChange={(e)=>setChemQuery(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Название / SMILES / InChI / CID"/><select value={chemRepresentation} onChange={(e)=>setChemRepresentation(e.target.value)} className="w-full rounded-xl border p-3 text-sm"><option value="2d">2D</option><option value="3d">3D</option><option value="structural">Structural</option><option value="skeletal">Skeletal</option><option value="lewis">Lewis</option><option value="fischer">Fischer</option><option value="haworth">Haworth</option><option value="newman">Newman</option><option value="sawhorse">Sawhorse</option><option value="chair">Chair</option><option value="resonance">Resonance</option></select><input value={chemCaption} onChange={(e)=>setChemCaption(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Подпись"/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" disabled={!chemQuery.trim()} onClick={insertChem} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Вставить</button></div></div>}

        {block==="video"&&<div className="mt-5 space-y-3"><input value={videoUrl} onChange={(e)=>setVideoUrl(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="YouTube / Rutube / VK URL"/><input value={videoCaption} onChange={(e)=>setVideoCaption(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Подпись"/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" disabled={!videoUrl.trim()} onClick={insertVideo} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Вставить видео</button></div></div>}

        {block==="image"&&<div className="mt-5 space-y-4"><input value={trainerQuery} onChange={(e)=>setTrainerQuery(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Поиск препарата, органа, признака…"/>{trainerLoading?<div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/> Загружаю атлас…</div>:<div className="grid gap-2 sm:grid-cols-2">{filteredTrainer.map((item:any)=><button key={String(item.id)} type="button" onClick={()=>insertBlock("image",JSON.stringify({trainerId:String(item.id),caption:String(item.preparation?.name||item.id)},null,2),String(item.preparation?.name||item.id))} className="rounded-2xl border border-[var(--border)] bg-slate-50 p-3 text-left hover:bg-indigo-50"><div className="text-sm font-semibold">{String(item.preparation?.name||"Препарат")}</div><div className="mt-1 text-[11px] text-slate-500">{String(item.preparation?.organ||"")}{item.mode_set==="electronogram"?" · ЭМ":" · микропрепарат"}</div></button>)}</div>}<div className="flex justify-end"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Закрыть</button></div></div>}
      </div>
    </div>}

    {rawEditId&&<div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-wider text-indigo-600">{BLOCK_LABELS[rawEditKind]}</div><h3 className="text-lg font-extrabold">Редактировать блок</h3></div><button type="button" onClick={()=>setRawEditId("")} className="rounded-xl p-2 hover:bg-slate-100"><X className="h-5 w-5"/></button></div><textarea value={rawEdit} onChange={(e)=>setRawEdit(e.target.value)} rows={20} className="mt-4 w-full rounded-xl border p-3 font-mono text-xs"/><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={()=>setRawEditId("")} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" onClick={saveRawEdit} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Сохранить блок</button></div></div></div>}
  </div>;
}

export default RichLectureEditor;
