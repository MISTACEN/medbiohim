"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, BarChart3, Bold, Braces, FileText,
  ImagePlus, Italic, Link2, List, ListOrdered, Loader2, Quote, Redo2,
  Search, Strikethrough, Subscript, Superscript, Table2, Trash2,
  Underline, Undo2, Video, Wand2, X,
} from "lucide-react";
import { getTrainerFeed, uploadFile, fileDownloadUrl } from "@/lib/api";

type Subject = { slug: string; name: string };
type Attachment = {
  id?: string;
  file_id?: string;
  type: "image" | "video" | "pdf" | "file";
  name: string;
  url?: string;
  mime_type?: string;
  page?: number;
  caption?: string;
};
type SearchResult = { title: string; url: string; thumb?: string; mime?: string; isVideo?: boolean };
type BlockKind = "mermaid" | "quiz" | "chart" | "chem" | "video" | "formula" | "image" | "table" | "leukocyte";

type Props = {
  value: string;
  onChange: (value: { html: string; markdown: string }) => void;
  attachments: Attachment[];
  setAttachments: (value: Attachment[]) => void;
  subject: Subject | null;
  topic: string;
};

const BLOCK_LABELS: Record<BlockKind, string> = {
  mermaid: "Схема",
  quiz: "Мини-тест",
  chart: "Диаграмма",
  chem: "Химическая фигура",
  video: "Видео",
  formula: "Формула",
  image: "Препарат / изображение",
  table: "Таблица",
  leukocyte: "Практическая карточка лейкоцитов",
};

const FENCE = String.fromCharCode(96).repeat(3);

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encodeBlock(value: string): string {
  return encodeURIComponent(value);
}

function decodeBlock(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function makeBlockPlaceholder(kind: BlockKind, raw: string, title?: string): string {
  const label = title || BLOCK_LABELS[kind];
  const id = "mbh-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  return (
    '<div contenteditable="false" data-mbh-block="' + kind +
    '" data-mbh-content="' + encodeBlock(raw) +
    '" data-mbh-id="' + id +
    '" class="mbh-block">' +
      '<div class="mbh-block-head">' +
        '<span class="mbh-block-label" data-mbh-label="1">' + esc(label) + '</span>' +
        '<span class="mbh-block-actions">' +
          '<button type="button" data-mbh-edit="1">Изменить</button>' +
          '<button type="button" data-mbh-remove="1">Удалить</button>' +
        '</span>' +
      '</div>' +
      '<div class="mbh-block-note">Специальный блок MEDBIOHIM · сохраняется без потери структуры</div>' +
    '</div><p><br></p>'
  );
}

function extractSpecialBlocks(markdown: string): { body: string; blocks: string[] } {
  const blocks: string[] = [];
  let body = String(markdown || "");
  const re = new RegExp(
    FENCE + '(chart|video|image|mermaid|chem|quiz|leukocyte)\\s*\\r?\\n([\\s\\S]*?)\\r?\\n?' + FENCE,
    "gi",
  );
  body = body.replace(re, (_all: string, kind: string, raw: string) => {
    const index = blocks.length;
    blocks.push(JSON.stringify({ kind: kind.toLowerCase(), raw: raw.trim() }));
    return "\n@@MBH_BLOCK_" + index + "@@\n";
  });
  body = body.replace(/\\$\\$([\\s\\S]+?)\\$\\$/g, (_all: string, raw: string) => {
    const index = blocks.length;
    blocks.push(JSON.stringify({ kind: "formula", raw: "$$" + raw.trim() + "$$" }));
    return "\n@@MBH_BLOCK_" + index + "@@\n";
  });
  return { body, blocks };
}

function tableMarkdownToHtml(raw: string): string {
  const rows = raw.trim().split("\n").filter(Boolean);
  if (rows.length < 2) return raw;
  const parseRow = (line: string) =>
    line.split("|").slice(1, -1).map((cell) => cell.trim());
  const divider = rows[1];
  if (!/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(divider)) return raw;
  const head = parseRow(rows[0]);
  const body = rows.slice(2).map(parseRow);
  return (
    '<div class="lec-table-wrap"><table class="lec-table"><thead><tr>' +
    head.map((cell) => "<th>" + cell + "</th>").join("") +
    "</tr></thead><tbody>" +
    body.map((row) => "<tr>" + row.map((cell) => "<td>" + cell + "</td>").join("") + "</tr>").join("") +
    "</tbody></table></div>"
  );
}

function markdownToHtml(markdown: string): string {
  const protectedValue = extractSpecialBlocks(markdown);
  let body = protectedValue.body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  body = body
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^-\s+(.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (value) => "<ul>" + value + "</ul>")
    .replace(/(?:^\|.+\|\n?)+/gm, (table) => tableMarkdownToHtml(table));

  body = body.replace(/@@MBH_BLOCK_(\d+)@@/g, (_all, index: string) => {
    const spec = JSON.parse(protectedValue.blocks[Number(index)]) as { kind: BlockKind; raw: string };
    let title = BLOCK_LABELS[spec.kind];
    try {
      const data = JSON.parse(spec.raw);
      if (data?.trainerId) title = "Препарат · " + String(data.trainerId);
      else if (data?.title) title = String(data.title);
      else if (data?.caption) title = String(data.caption);
    } catch {
      // Keep generic label for non-JSON block sources such as Mermaid.
    }
    return makeBlockPlaceholder(spec.kind, spec.raw, title);
  });

  return body
    .split(/\n{2,}/)
    .map((part) => {
      const value = part.trim();
      if (!value) return "";
      if (/^(<h[1-4]>|<blockquote>|<ul>|<div class="lec-table-wrap">|<div contenteditable="false")/i.test(value)) {
        return value;
      }
      return "<p>" + value.replace(/\n/g, "<br>") + "</p>";
    })
    .join("");
}

function sanitizeEditorHtml(raw: string): string {
  if (typeof window === "undefined") return raw;
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const allowed = new Set([
    "P", "DIV", "BR", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "SUP", "SUB",
    "H1", "H2", "H3", "H4", "UL", "OL", "LI", "BLOCKQUOTE", "A", "IMG", "VIDEO",
    "IFRAME", "HR", "SPAN", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "FONT", "BUTTON",
  ]);
  const walk = (root: Node) => {
    [...root.childNodes].forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        if (node.parentNode) walk(node);
        return;
      }
      const el = node as HTMLElement;
      if (!allowed.has(el.tagName)) {
        const parent = el.parentNode;
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
        }
        return;
      }
      [...el.attributes].forEach((attribute) => {
        const keep = [
          "href", "src", "alt", "title", "target", "rel", "width", "height", "style", "class",
          "contenteditable", "data-mbh-block", "data-mbh-content", "data-mbh-id",
          "data-mbh-label", "data-mbh-edit", "data-mbh-remove",
        ].includes(attribute.name);
        if (!keep) el.removeAttribute(attribute.name);
        if (attribute.name === "style") {
          const safe = attribute.value
            .split(";")
            .map((item) => item.trim())
            .filter((item) =>
              /^(font-size|font-weight|font-style|text-decoration|text-align|color|background-color)\s*:/i.test(item) &&
              !/url\s*\(|expression\s*\(|javascript:/i.test(item)
            )
            .join(";");
          if (safe) el.setAttribute("style", safe);
          else el.removeAttribute("style");
        }
      });
      if (el.dataset.mbhBlock && !el.dataset.mbhContent) {
        el.remove();
        return;
      }
      if (el.hasAttribute("href") || el.hasAttribute("src")) {
        const attr = el.hasAttribute("href") ? "href" : "src";
        try {
          const url = new URL(el.getAttribute(attr) || "", window.location.origin);
          if (!["http:", "https:", "blob:"].includes(url.protocol)) el.removeAttribute(attr);
        } catch {
          el.removeAttribute(attr);
        }
      }
      if (el.tagName === "IFRAME") {
        const src = el.getAttribute("src") || "";
        if (!/^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|rutube\.ru|vk\.com)\//i.test(src)) {
          el.remove();
        } else {
          el.setAttribute("allowfullscreen", "true");
          el.setAttribute("loading", "lazy");
        }
      }
      if (el.tagName === "A") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noreferrer");
      }
      if (el.parentNode) walk(el);
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

function tableHtmlToMarkdown(table: HTMLTableElement): string {
  const rows = [...table.rows].map((row) =>
    [...row.cells].map((cell) =>
      (cell.textContent || "").trim().split("|").join("\\|")
    )
  );
  if (!rows.length) return "";
  const divider = rows[0].map(() => "---");
  return (
    "|" + rows[0].join("|") + "|\n" +
    "|" + divider.join("|") + "|\n" +
    rows.slice(1).map((row) => "|" + row.join("|") + "|").join("\n") + "\n"
  );
}

function htmlToMarkdown(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const render = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").replace(/\u00a0/g, " ");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    if (el.dataset.mbhBlock && el.dataset.mbhContent) {
      return "\n" + decodeBlock(el.dataset.mbhContent) + "\n";
    }
    if (el.tagName === "TABLE") return "\n" + tableHtmlToMarkdown(el as HTMLTableElement) + "\n";
    const inner = [...el.childNodes].map(render).join("");
    switch (el.tagName) {
      case "H1": return "# " + inner.trim() + "\n\n";
      case "H2": return "## " + inner.trim() + "\n\n";
      case "H3": return "### " + inner.trim() + "\n\n";
      case "STRONG":
      case "B": return "**" + inner + "**";
      case "EM":
      case "I": return "*" + inner + "*";
      case "U": return "_" + inner + "_";
      case "S":
      case "STRIKE": return "~~" + inner + "~~";
      case "SUP": return "^" + inner + "^";
      case "SUB": return "_" + inner + "_";
      case "BLOCKQUOTE": return "> " + inner.trim() + "\n\n";
      case "LI": return "- " + inner.trim() + "\n";
      case "A": return "[" + inner + "](" + (el.getAttribute("href") || "") + ")";
      case "IMG":
        return "\n" + FENCE + "image\n" + JSON.stringify({
          url: el.getAttribute("src") || "",
          caption: el.getAttribute("alt") || "",
        }) + "\n" + FENCE + "\n";
      case "VIDEO":
        return "\n" + FENCE + "video\n" + JSON.stringify({
          url: el.getAttribute("src") || "",
          caption: el.getAttribute("title") || "Видео",
        }) + "\n" + FENCE + "\n";
      case "IFRAME":
        return "\n" + FENCE + "video\n" + JSON.stringify({
          url: el.getAttribute("src") || "",
          caption: el.getAttribute("title") || "Видео",
        }) + "\n" + FENCE + "\n";
      case "BUTTON": return "";
      case "P":
      case "DIV": return inner.trim() + "\n\n";
      case "BR": return "\n";
      default: return inner;
    }
  };
  return [...doc.body.childNodes].map(render).join("").replace(/\n{3,}/g, "\n\n").trim();
}

function insertHtml(ref: RefObject<HTMLDivElement | null>, html: string) {
  ref.current?.focus();
  document.execCommand("insertHTML", false, html);
}

export function RichLectureEditor({
  value, onChange, attachments, setAttachments, subject, topic,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const loadedValue = useRef("");
  const savedRange = useRef<Range | null>(null);

  const [block, setBlock] = useState<BlockKind | null>(null);
  const [blockTab, setBlockTab] = useState<"builder" | "raw">("builder");
  const [rawEditId, setRawEditId] = useState("");
  const [rawEditKind, setRawEditKind] = useState<BlockKind>("mermaid");
  const [rawEdit, setRawEdit] = useState("");

  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [mediaTab, setMediaTab] = useState<"image" | "video">("image");
  const [page, setPage] = useState("1");
  const [link, setLink] = useState("");
  const [busyUpload, setBusyUpload] = useState(false);

  const [trainerLoading, setTrainerLoading] = useState(false);
  const [trainerQuery, setTrainerQuery] = useState("");
  const [trainerCards, setTrainerCards] = useState<any[]>([]);

  const [schemeDirection, setSchemeDirection] = useState("TD");
  const [schemeNodes, setSchemeNodes] = useState("A|КРОВЬ\nB|Плазма\nC|Форменные элементы");
  const [schemeEdges, setSchemeEdges] = useState("A -> B\nA -> C");
  const [schemeRaw, setSchemeRaw] = useState("flowchart TD\nA[КРОВЬ] --> B[Плазма]\nA --> C[Форменные элементы]");

  const [quizTitle, setQuizTitle] = useState("Проверь себя");
  const [quizSubjectId, setQuizSubjectId] = useState("");
  const [quizIds, setQuizIds] = useState("");

  const [chartTitle, setChartTitle] = useState("");
  const [chartLabels, setChartLabels] = useState("");
  const [chartValues, setChartValues] = useState("");
  const [chartUnit, setChartUnit] = useState("");

  const [chemQuery, setChemQuery] = useState("");
  const [chemRepresentation, setChemRepresentation] = useState("2d");
  const [chemCaption, setChemCaption] = useState("");

  const [videoUrl, setVideoUrl] = useState("");
  const [videoCaption, setVideoCaption] = useState("");

  const [formula, setFormula] = useState("\\frac{a}{b}");
  const [tableText, setTableText] = useState("Показатель\tЗначение\nЭритроциты\t4,0–5,5 × 10¹²/л\nHb\t130–160 г/л");
  const [tableHeader, setTableHeader] = useState(true);
  const [leukocyteMode, setLeukocyteMode] = useState("case");
  const [leukocyteSourceMode, setLeukocyteSourceMode] = useState("mixed");
  const [leukocyteVisualMode, setLeukocyteVisualMode] = useState("mixed");
  const [leukocyteCoverageMode, setLeukocyteCoverageMode] = useState("all");
  const [leukocyteRounds, setLeukocyteRounds] = useState("12");

  const filteredTrainer = useMemo(() => {
    const needle = trainerQuery.trim().toLowerCase();
    if (!needle) return trainerCards.slice(0, 80);
    return trainerCards.filter((item: any) => [
      item.id,
      item.preparation?.name,
      item.preparation?.organ,
      item.preparation?.stain,
      item.plan_topic_title,
      item.question?.prompt,
      ...(Array.isArray(item.tags) ? item.tags : []),
    ].join(" ").toLowerCase().includes(needle)).slice(0, 80);
  }, [trainerCards, trainerQuery]);

  useEffect(() => {
    if (ref.current && value !== loadedValue.current) {
      ref.current.innerHTML = markdownToHtml(value || "");
      loadedValue.current = value;
    }
  }, [value]);

  function emit() {
    if (!ref.current) return;
    const html = sanitizeEditorHtml(ref.current.innerHTML);
    if (ref.current.innerHTML !== html) ref.current.innerHTML = html;
    const markdown = htmlToMarkdown(html);
    loadedValue.current = markdown;
    onChange({ html, markdown });
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !ref.current?.contains(selection.anchorNode)) return;
    savedRange.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    if (!ref.current || !savedRange.current) return;
    ref.current.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(savedRange.current);
  }

  function command(commandName: string, commandValue?: string) {
    restoreSelection();
    document.execCommand(commandName, false, commandValue);
    emit();
  }

  function insertAtCursor(html: string) {
    restoreSelection();
    insertHtml(ref, html);
    emit();
    savedRange.current = null;
  }

  function openBlock(kind: BlockKind) {
    rememberSelection();
    setBlock(kind);
  }

  function insertBlock(kind: BlockKind, raw: string, title?: string) {
    insertAtCursor(makeBlockPlaceholder(kind, raw, title));
    setBlock(null);
  }

  function makeScheme() {
    const nodes = schemeNodes
      .split(/\n+/)
      .map((line) => line.split("|").map((part) => part.trim()))
      .filter((parts) => parts[0]);
    const ids = new Set(nodes.map((parts) => parts[0]));
    const lines = ["flowchart " + schemeDirection];

    nodes.forEach((parts) => {
      const id = parts[0].replace(/[^A-Za-z0-9_]/g, "_");
      const label = (parts.slice(1).join("|") || parts[0]).replace(/"/g, "'");
      lines.push(id + '["' + label + '"]');
    });

    schemeEdges
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((edge) => {
        const parts = edge.split(/\s*(?:->|-->)\s*/);
        if (parts.length < 2 || !ids.has(parts[0]) || !ids.has(parts[1])) return;
        const from = parts[0].replace(/[^A-Za-z0-9_]/g, "_");
        const to = parts[1].replace(/[^A-Za-z0-9_]/g, "_");
        lines.push(from + " --> " + to);
      });

    setSchemeRaw(lines.join("\n"));
    setBlockTab("raw");
  }

  function insertTable() {
    const rows = tableText.split(/\n+/).map((line) => line.split("\t"));
    const width = Math.max(...rows.map((row) => row.length), 1);
    const normalized = rows.map((row) => Array.from({ length: width }, (_, i) => row[i] || ""));
    const markdown = normalized.map((row) => "|" + row.map((cell) => cell.split("|").join("\\|")).join("|") + "|");
    const table = tableHeader
      ? markdown[0] + "\n|" + Array.from({ length: width }, () => "---").join("|") + "|\n" + markdown.slice(1).join("\n")
      : "|" + Array.from({ length: width }, () => "").join("|") + "|\n|" +
        Array.from({ length: width }, () => "---").join("|") + "|\n" + markdown.join("\n");
    insertAtCursor(markdownToHtml(table));
    setBlock(null);
  }

  function insertQuiz() {
    const ids = quizIds.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean);
    insertBlock("quiz", JSON.stringify({
      subjectId: quizSubjectId.trim(),
      title: quizTitle.trim() || "Проверь себя",
      questionIds: ids,
    }, null, 2), quizTitle.trim() || "Мини-тест");
  }

  function insertChart() {
    const labels = chartLabels.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
    const values = chartValues.split(/[,;\n]+/).map((item) => Number(item.trim())).filter((item) => Number.isFinite(item));
    insertBlock("chart", JSON.stringify({
      type: "bar", title: chartTitle.trim() || undefined, labels, values,
      unit: chartUnit.trim() || undefined,
    }, null, 2), chartTitle.trim() || "Диаграмма");
  }

  function insertLeukocyteTrainer() {
    const rounds = Math.min(30, Math.max(5, Number(leukocyteRounds) || 12));
    insertBlock("leukocyte", JSON.stringify({
      title: "Лейкоцитарная формула — тренажёр",
      mode: leukocyteMode,
      sourceMode: leukocyteSourceMode,
      visualMode: leukocyteVisualMode,
      coverageMode: leukocyteCoverageMode,
      rounds,
    }, null, 2), "Лейкоцитарный тренажёр");
  }

  function insertFormula() {
    insertBlock("formula", "$$\n" + formula.trim() + "\n$$", "Формула");
  }

  function insertChem() {
    insertBlock("chem", JSON.stringify({
      query: chemQuery.trim(),
      representation: chemRepresentation,
      caption: chemCaption.trim() || undefined,
    }, null, 2), chemCaption.trim() || chemQuery.trim() || "Химическая фигура");
  }

  function insertVideo() {
    if (!videoUrl.trim()) return;
    const raw = videoUrl.trim();
    const youtube = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
    const rutube = raw.match(/rutube\.ru\/(?:video\/|play\/)([A-Za-z0-9_-]+)/i);
    const url = youtube
      ? "https://www.youtube-nocookie.com/embed/" + youtube[1]
      : rutube
        ? "https://rutube.ru/play/embed/" + rutube[1]
        : raw;
    insertBlock("video", JSON.stringify({
      url, caption: videoCaption.trim() || "Видео",
    }, null, 2), videoCaption.trim() || "Видео");
    setVideoUrl("");
    setVideoCaption("");
  }

  async function loadTrainer() {
    setTrainerLoading(true);
    try {
      const result: any = await getTrainerFeed(subject?.slug || "histology", "mbh", 500, 0);
      setTrainerCards(Array.isArray(result?.data?.items) ? result.data.items : []);
    } finally {
      setTrainerLoading(false);
    }
  }

  function openTrainerPicker() {
    rememberSelection();
    setBlock("image");
    void loadTrainer();
  }

  async function uploadAndInsert(file: File) {
    setBusyUpload(true);
    try {
      const result: any = await uploadFile(file, undefined, "mbh");
      if (!result.ok) throw new Error(result.error?.message || "Не удалось загрузить файл");
      const id = String(result.data?.file?.id || "");
      if (!id) throw new Error("Сервер не вернул ID файла");

      const url = fileDownloadUrl(id);
      const mime = String(result.data?.file?.mime_type || file.type || "");
      const type: Attachment["type"] =
        mime === "application/pdf" ? "pdf" :
        mime.startsWith("image/") ? "image" :
        mime.startsWith("video/") ? "video" : "file";

      setAttachments([...attachments, {
        file_id: id, type, name: file.name, url, mime_type: mime,
        page: type === "pdf" ? Number(page) || 1 : undefined,
      }]);

      if (type === "image") {
        insertAtCursor('<p><img src="' + url + '" alt="' + esc(file.name) + '" title="' + esc(file.name) + '" /></p>');
      } else if (type === "video") {
        insertAtCursor('<p><video controls src="' + url + '" title="' + esc(file.name) + '"></video></p>');
      } else if (type === "pdf") {
        insertAtCursor('<p><a href="' + url + '#page=' + (Number(page) || 1) + '">' + esc(file.name) + " — PDF, стр. " + (Number(page) || 1) + "</a></p>");
      } else {
        insertAtCursor('<p><a href="' + url + '">' + esc(file.name) + "</a></p>");
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setBusyUpload(false);
    }
  }

  async function searchWeb() {
    const search = (
      query.trim() ||
      [subject?.name, topic, mediaTab === "video" ? "lecture video" : "histology medical diagram"]
        .filter(Boolean)
        .join(" ")
    ).trim();
    if (!search) return;
    setSearching(true);
    setResults([]);
    try {
      const url =
        "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=" +
        encodeURIComponent(search) +
        "&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=640&format=json&origin=*";
      const data: any = await fetch(url).then((response) => response.json());
      const rows = Object.values(data?.query?.pages || {}) as any[];
      setResults(rows.map((item: any) => ({
        title: String(item.title || "").replace(/^File:/, ""),
        url: String(item.imageinfo?.[0]?.url || ""),
        thumb: String(item.imageinfo?.[0]?.thumburl || ""),
        mime: String(item.imageinfo?.[0]?.mime || ""),
        isVideo: String(item.imageinfo?.[0]?.mime || "").startsWith("video/"),
      })).filter((item: SearchResult) => item.url && (mediaTab === "image" ? !item.isVideo : item.isVideo)));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function useSearchResult(item: SearchResult) {
    rememberSelection();
    if (mediaTab === "image") {
      insertAtCursor('<p><img src="' + item.url + '" alt="' + esc(item.title) + '" title="' + esc(item.title) + '" /></p>');
      setAttachments([...attachments, { type: "image", name: item.title, url: item.url, caption: item.title }]);
    } else {
      insertBlock("video", JSON.stringify({ url: item.url, caption: item.title }, null, 2), item.title);
    }
  }

  function openRawEdit(element: HTMLElement) {
    const kind = element.dataset.mbhBlock as BlockKind;
    setRawEditId(String(element.dataset.mbhId || ""));
    setRawEditKind(kind);
    setRawEdit(decodeBlock(element.dataset.mbhContent || ""));
    setBlock(null);
  }

  function saveRawEdit() {
    if (!ref.current || !rawEditId) return;
    const element = ref.current.querySelector('[data-mbh-id="' + CSS.escape(rawEditId) + '"]') as HTMLElement | null;
    if (!element) return;
    element.dataset.mbhContent = encodeBlock(rawEdit);
    const label = element.querySelector("[data-mbh-label]") as HTMLElement | null;
    if (label) {
      let title = BLOCK_LABELS[rawEditKind];
      try {
        const data = JSON.parse(rawEdit);
        if (data?.trainerId) title = "Препарат · " + String(data.trainerId);
        else if (data?.title) title = String(data.title);
        else if (data?.caption) title = String(data.caption);
      } catch {}
      label.textContent = title;
    }
    setRawEditId("");
    setRawEdit("");
    emit();
  }

  function toolbarButton(label: string, title: string, action: () => void, icon: ReactNode) {
    return (
      <button type="button" title={title} aria-label={title} onClick={action}
        className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-white px-2 text-xs font-semibold hover:bg-slate-50">
        {icon}<span className="hidden lg:inline">{label}</span>
      </button>
    );
  }

  return (
    <div className="lecture-editor-shell">
      <div className="lecture-editor-toolbar flex flex-wrap items-center gap-1">
        {toolbarButton("Ж","Жирный",()=>command("bold"),<Bold className="h-4 w-4"/>)}
        {toolbarButton("К","Курсив",()=>command("italic"),<Italic className="h-4 w-4"/>)}
        {toolbarButton("П","Подчёркивание",()=>command("underline"),<Underline className="h-4 w-4"/>)}
        {toolbarButton("З","Зачёркивание",()=>command("strikeThrough"),<Strikethrough className="h-4 w-4"/>)}
        {toolbarButton("x²","Верхний индекс",()=>command("superscript"),<Superscript className="h-4 w-4"/>)}
        {toolbarButton("x₂","Нижний индекс",()=>command("subscript"),<Subscript className="h-4 w-4"/>)}

        <select title="Заголовок" defaultValue="p" onChange={(event)=>command("formatBlock",event.target.value)} className="h-9 rounded-lg border border-[var(--border)] bg-white px-2 text-xs">
          <option value="p">Обычный</option><option value="h1">H1</option><option value="h2">H2</option><option value="h3">H3</option><option value="h4">H4</option>
        </select>
        <select title="Размер текста" defaultValue="3" onChange={(event)=>command("fontSize",event.target.value)} className="h-9 rounded-lg border border-[var(--border)] bg-white px-2 text-xs">
          <option value="2">Маленький</option><option value="3">Обычный</option><option value="4">Крупный</option><option value="5">Очень крупный</option><option value="6">Огромный</option>
        </select>

        {toolbarButton("•","Маркированный список",()=>command("insertUnorderedList"),<List className="h-4 w-4"/>)}
        {toolbarButton("1.","Нумерованный список",()=>command("insertOrderedList"),<ListOrdered className="h-4 w-4"/>)}
        {toolbarButton("Цитата","Цитата",()=>command("formatBlock","blockquote"),<Quote className="h-4 w-4"/>)}
        {toolbarButton("←","Слева",()=>command("justifyLeft"),<AlignLeft className="h-4 w-4"/>)}
        {toolbarButton("↔","Центр",()=>command("justifyCenter"),<AlignCenter className="h-4 w-4"/>)}
        {toolbarButton("→","Справа",()=>command("justifyRight"),<AlignRight className="h-4 w-4"/>)}

        <input value={link} onChange={(event)=>setLink(event.target.value)} className="h-9 min-w-[180px] flex-1 rounded-lg border border-[var(--border)] px-2 text-xs" placeholder="https://..."/>
        {toolbarButton("Ссылка","Вставить ссылку",()=>{if(link.trim()){command("createLink",link.trim());setLink("")}},<Link2 className="h-4 w-4"/>)}

        {toolbarButton("Таблица","Создать таблицу",()=>openBlock("table"),<Table2 className="h-4 w-4"/>)}
        {toolbarButton("Схема","Создать Mermaid-схему",()=>{rememberSelection();setBlock("mermaid");setBlockTab("builder")},<Wand2 className="h-4 w-4"/>)}
        {toolbarButton("Мини-тест","Создать мини-тест",()=>openBlock("quiz"),<Braces className="h-4 w-4"/>)}
        {toolbarButton("Лейкоциты","Практическая карточка по лейкоцитарной формуле",()=>openBlock("leukocyte"),<span className="font-bold">WBC</span>)}
        {toolbarButton("Диаграмма","Создать диаграмму",()=>openBlock("chart"),<BarChart3 className="h-4 w-4"/>)}
        {toolbarButton("Формула","Создать формулу",()=>openBlock("formula"),<span className="font-bold">∑</span>)}
        {toolbarButton("Химия","Создать химическую фигуру",()=>openBlock("chem"),<span className="font-bold">⚗</span>)}
        {toolbarButton("Видео","Вставить видео",()=>openBlock("video"),<Video className="h-4 w-4"/>)}
        {toolbarButton("Препарат","Вставить препарат из атласа",openTrainerPicker,<ImagePlus className="h-4 w-4"/>)}

        <label title="Загрузить изображение" className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-white px-2 cursor-pointer hover:bg-slate-50">
          <ImagePlus className="h-4 w-4"/><input type="file" accept="image/*" className="hidden" onChange={(event)=>{const file=event.target.files?.[0];if(file)void uploadAndInsert(file);event.currentTarget.value=""}}/>
        </label>
        <label title="Загрузить видео" className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-white px-2 cursor-pointer hover:bg-slate-50">
          <Video className="h-4 w-4"/><input type="file" accept="video/*" className="hidden" onChange={(event)=>{const file=event.target.files?.[0];if(file)void uploadAndInsert(file);event.currentTarget.value=""}}/>
        </label>
        <label title="Загрузить PDF / Word" className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-white px-2 cursor-pointer hover:bg-slate-50">
          <FileText className="h-4 w-4"/><input type="file" accept="application/pdf,.pdf,.doc,.docx" className="hidden" onChange={(event)=>{const file=event.target.files?.[0];if(file)void uploadAndInsert(file);event.currentTarget.value=""}}/>
        </label>

        {toolbarButton("↶","Отменить",()=>command("undo"),<Undo2 className="h-4 w-4"/>)}
        {toolbarButton("↷","Повторить",()=>command("redo"),<Redo2 className="h-4 w-4"/>)}
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[11px] text-indigo-800">
        <b>Эталон Лекции 5:</b> обычное форматирование + таблицы + Mermaid-схемы + мини-тесты + лейкоцитарный тренажёр + формулы + препараты/ЭМ + диаграммы + химические фигуры + видео + PDF/Word. Спецблоки можно повторно открыть кнопкой «Изменить».
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="lecture-editor-content min-h-[520px]"
        onInput={emit}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onClick={(event)=>{
          const target=event.target as HTMLElement;
          const edit=target.closest("[data-mbh-edit]") as HTMLElement|null;
          const remove=target.closest("[data-mbh-remove]") as HTMLElement|null;
          const box=target.closest("[data-mbh-block]") as HTMLElement|null;
          if(edit&&box){event.preventDefault();openRawEdit(box);return;}
          if(remove&&box){event.preventDefault();box.remove();emit();return;}
        }}
        onPaste={(event)=>{
          event.preventDefault();
          const html=event.clipboardData.getData("text/html");
          const text=event.clipboardData.getData("text/plain");
          insertAtCursor(html || "<p>" + esc(text).replace(/\n/g,"<br>") + "</p>");
        }}
      />

      <div className="lecture-editor-media space-y-3">
        <div className="lecture-media-head">
          <div><b>Медиа и поиск</b><span>поиск учитывает предмет и тему лекции</span></div>
          <Search className="h-4 w-4"/>
        </div>
        <div className="lecture-media-tabs">
          <button type="button" className={mediaTab==="image"?"active":""} onClick={()=>setMediaTab("image")}>Картинки</button>
          <button type="button" className={mediaTab==="video"?"active":""} onClick={()=>setMediaTab("video")}>Видео</button>
        </div>
        <div className="lecture-media-search">
          <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={subject?.name ? subject.name+" · "+(topic||"тема"):"Тема, препарат, процесс…"} onKeyDown={(event)=>{if(event.key==="Enter")void searchWeb()}}/>
          <button type="button" onClick={()=>void searchWeb()} disabled={searching}><Search className="h-4 w-4"/>{searching?"Ищу…":"Найти в интернете"}</button>
        </div>
        {results.length>0&&<div className="lecture-search-results">{results.map((item,i)=><button key={i} type="button" className="lecture-search-result" onClick={()=>useSearchResult(item)}>{item.thumb&&<img src={item.thumb} alt="" />}{item.isVideo&&<Video className="h-4 w-4"/>}<span>{item.title}</span></button>)}</div>}
        <div className="lecture-editor-urlrow">
          <input value={page} onChange={(event)=>setPage(event.target.value.replace(/\D/g,""))} inputMode="numeric" placeholder="Стр. PDF"/>
          <span>страница PDF</span>
          <button type="button" onClick={()=>{if(link.trim()){rememberSelection();insertAtCursor('<p><a href="'+link.trim()+'#page='+(Number(page)||1)+'">PDF · стр. '+(Number(page)||1)+'</a></p>');setLink("")}}}>Вставить PDF-ссылку</button>
        </div>
        <div className="lecture-attachments">
          <b>Прикреплено к лекции</b>
          {attachments.length===0?<span>пока нет</span>:attachments.map((item,index)=>
            <span key={index} className="lecture-attachment">{String(item.type).toUpperCase()} · {item.name}{item.page?" · стр. "+item.page:""}
              <button type="button" onClick={()=>setAttachments(attachments.filter((_,i)=>i!==index))}><Trash2 className="h-3 w-3"/></button>
            </span>
          )}
        </div>
        {busyUpload&&<div className="lecture-uploading"><Loader2 className="h-4 w-4 animate-spin"/> Загружаю файл…</div>}
      </div>

      {block&&<div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true">
        <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/20 bg-white p-5 shadow-2xl">
          <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-indigo-600">{BLOCK_LABELS[block]}</div><h3 className="mt-1 text-lg font-extrabold text-slate-900">Создать блок</h3></div><button type="button" onClick={()=>setBlock(null)} className="rounded-xl p-2 hover:bg-slate-100"><X className="h-5 w-5"/></button></div>

          {block==="mermaid"&&<div className="mt-5 space-y-4">
            <div className="flex gap-2"><button type="button" className={"rounded-xl px-3 py-1.5 text-xs font-semibold "+(blockTab==="builder"?"bg-indigo-600 text-white":"border")} onClick={()=>setBlockTab("builder")}>Конструктор</button><button type="button" className={"rounded-xl px-3 py-1.5 text-xs font-semibold "+(blockTab==="raw"?"bg-indigo-600 text-white":"border")} onClick={()=>setBlockTab("raw")}>Код Mermaid</button></div>
            {blockTab==="builder"&&<><label className="block text-sm font-semibold">Направление<select value={schemeDirection} onChange={(event)=>setSchemeDirection(event.target.value)} className="mt-1 w-full rounded-xl border p-2"><option value="TD">Сверху вниз</option><option value="LR">Слева направо</option><option value="RL">Справа налево</option><option value="BT">Снизу вверх</option></select></label><label className="block text-sm font-semibold">Узлы <span className="font-normal text-slate-500">ID|Название</span><textarea value={schemeNodes} onChange={(event)=>setSchemeNodes(event.target.value)} rows={6} className="mt-1 w-full rounded-xl border p-3 font-mono text-xs"/></label><label className="block text-sm font-semibold">Связи <span className="font-normal text-slate-500">A -&gt; B</span><textarea value={schemeEdges} onChange={(event)=>setSchemeEdges(event.target.value)} rows={5} className="mt-1 w-full rounded-xl border p-3 font-mono text-xs"/></label><button type="button" onClick={makeScheme} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"><Wand2 className="h-4 w-4"/> Собрать схему</button></>}
            {blockTab==="raw"&&<textarea value={schemeRaw} onChange={(event)=>setSchemeRaw(event.target.value)} rows={14} className="mt-4 w-full rounded-xl border p-3 font-mono text-xs"/>}
            <div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" onClick={()=>insertBlock("mermaid",schemeRaw,"Схема")} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Вставить</button></div>
          </div>}

          {block==="table"&&<div className="mt-5 space-y-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tableHeader} onChange={(event)=>setTableHeader(event.target.checked)}/> Первая строка — заголовок</label><label className="block text-sm font-semibold">Данные<textarea value={tableText} onChange={(event)=>setTableText(event.target.value)} rows={10} className="mt-1 w-full rounded-xl border p-3 font-mono text-xs" placeholder={"Колонка 1\tКолонка 2\nЗначение\tЗначение"}/></label><div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" onClick={insertTable} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Вставить таблицу</button></div></div>}

          {block==="leukocyte"&&<div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
              <div className="text-sm font-extrabold text-indigo-900">Практическая карточка по лейкоцитарной формуле</div>
              <p className="mt-1 text-xs leading-5 text-indigo-800">Карта занятия: 1) опознать клетку на мазке; 2) назвать норму по возрасту; 3) переписать результат; 4) поставить термин отклонения; 5) связать функцию клетки с предварительной гипотезой для «5».</p>
            </div>
            <label className="block text-sm font-semibold">Режим
              <select value={leukocyteMode} onChange={(event)=>setLeukocyteMode(event.target.value)} className="mt-1 w-full rounded-xl border p-3">
                <option value="case">Практическая карточка: клетка → возрастная норма → результат → вывод → гипотеза на «5»</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">Источник изображений
              <select value={leukocyteSourceMode} onChange={(event)=>setLeukocyteSourceMode(event.target.value)} className="mt-1 w-full rounded-xl border p-3">
                <option value="mixed">Локальные + проверенный внешний источник</option>
                <option value="local">Только локальные препараты MEDBIOHIM</option>
                <option value="external">Только проверенный внешний источник</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">Визуальный вариант
              <select value={leukocyteVisualMode} onChange={(event)=>setLeukocyteVisualMode(event.target.value)} className="mt-1 w-full rounded-xl border p-3">
                <option value="mixed">Фото + правильный учебный рисунок</option>
                <option value="photo">Только фото</option>
                <option value="drawing">Только учебные рисунки</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">Покрытие видов
              <select value={leukocyteCoverageMode} onChange={(event)=>setLeukocyteCoverageMode(event.target.value)} className="mt-1 w-full rounded-xl border p-3">
                <option value="all">Гарантировать все 5 видов по циклу</option>
                <option value="random">Случайный вид</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">Количество раундов
              <input type="number" min={5} max={30} value={leukocyteRounds} onChange={(event)=>setLeukocyteRounds(event.target.value)} className="mt-1 w-full rounded-xl border p-3" />
            </label>
            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Фото для распознавания берутся только из подтверждённого банка: локальные одиночные препараты с точным именем файла или проверенные WebPath-источники с точным названием страницы. Общие кадры с несколькими лейкоцитами исключены из локального банка распознавания. В режиме «все 5 видов» за цикл из пяти карточек обязательно встречаются нейтрофил, лимфоцит, моноцит, эозинофил и базофил.
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button>
              <button type="button" onClick={insertLeukocyteTrainer} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Вставить практическую карточку</button>
            </div>
          </div>}

          {block==="quiz"&&<div className="mt-5 space-y-3"><input value={quizTitle} onChange={(event)=>setQuizTitle(event.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Название мини-теста"/><input value={quizSubjectId} onChange={(event)=>setQuizSubjectId(event.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="UUID предмета"/><textarea value={quizIds} onChange={(event)=>setQuizIds(event.target.value)} rows={7} className="w-full rounded-xl border p-3 font-mono text-xs" placeholder={"ID вопроса 1\nID вопроса 2\nID вопроса 3"}/><p className="text-xs text-slate-500">Используй ID существующих опубликованных вопросов. Ответы в браузер не передаются.</p><div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" disabled={!quizSubjectId.trim()||!quizIds.trim()} onClick={insertQuiz} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Вставить мини-тест</button></div></div>}

          {block==="chart"&&<div className="mt-5 space-y-3"><input value={chartTitle} onChange={(event)=>setChartTitle(event.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Заголовок диаграммы"/><input value={chartLabels} onChange={(event)=>setChartLabels(event.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Подписи через запятую"/><input value={chartValues} onChange={(event)=>setChartValues(event.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Значения через запятую"/><input value={chartUnit} onChange={(event)=>setChartUnit(event.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Единицы"/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" onClick={insertChart} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Вставить диаграмму</button></div></div>}

          {block==="formula"&&<div className="mt-5 space-y-3"><textarea value={formula} onChange={(event)=>setFormula(event.target.value)} rows={6} className="w-full rounded-xl border p-3 font-mono text-sm"/><div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">LaTeX / KaTeX: дроби, индексы, степени, Greek-символы.</div><div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" onClick={insertFormula} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Вставить формулу</button></div></div>}

          {block==="chem"&&<div className="mt-5 space-y-3"><input value={chemQuery} onChange={(event)=>setChemQuery(event.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Название / SMILES / InChI / CID"/><select value={chemRepresentation} onChange={(event)=>setChemRepresentation(event.target.value)} className="w-full rounded-xl border p-3 text-sm"><option value="2d">2D</option><option value="3d">3D</option><option value="structural">Structural</option><option value="skeletal">Skeletal</option><option value="lewis">Lewis</option><option value="fischer">Fischer</option><option value="haworth">Haworth</option><option value="newman">Newman</option><option value="sawhorse">Sawhorse</option><option value="chair">Chair</option><option value="resonance">Resonance</option></select><input value={chemCaption} onChange={(event)=>setChemCaption(event.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Подпись"/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" disabled={!chemQuery.trim()} onClick={insertChem} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Вставить</button></div></div>}

          {block==="video"&&<div className="mt-5 space-y-3"><input value={videoUrl} onChange={(event)=>setVideoUrl(event.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="YouTube / Rutube / VK URL"/><input value={videoCaption} onChange={(event)=>setVideoCaption(event.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Подпись видео"/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" disabled={!videoUrl.trim()} onClick={insertVideo} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Вставить видео</button></div></div>}

          {block==="image"&&<div className="mt-5 space-y-4"><input value={trainerQuery} onChange={(event)=>setTrainerQuery(event.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Поиск препарата, органа, окраски, признака…"/>{trainerLoading?<div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/> Загружаю атлас…</div>:<div className="grid gap-2 sm:grid-cols-2">{filteredTrainer.map((item:any)=><button key={String(item.id)} type="button" onClick={()=>insertBlock("image",JSON.stringify({trainerId:String(item.id),caption:String(item.preparation?.name||item.id)},null,2),String(item.preparation?.name||item.id))} className="rounded-2xl border border-[var(--border)] bg-slate-50 p-3 text-left hover:bg-indigo-50"><div className="text-sm font-semibold">{String(item.preparation?.name||"Препарат")}</div><div className="mt-1 text-[11px] text-slate-500">{String(item.preparation?.organ||"")}{item.preparation?.stain?" · "+String(item.preparation.stain):""}{item.mode_set==="electronogram"?" · ЭМ":" · микропрепарат"}</div></button>)}</div>}<div className="flex justify-end"><button type="button" onClick={()=>setBlock(null)} className="rounded-xl border px-4 py-2">Закрыть</button></div></div>}
        </div>
      </div>}

      {rawEditId&&<div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true">
        <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
          <div className="flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-wider text-indigo-600">{BLOCK_LABELS[rawEditKind]}</div><h3 className="text-lg font-extrabold">Редактировать блок</h3></div><button type="button" onClick={()=>setRawEditId("")} className="rounded-xl p-2 hover:bg-slate-100"><X className="h-5 w-5"/></button></div>
          <textarea value={rawEdit} onChange={(event)=>setRawEdit(event.target.value)} rows={20} className="mt-4 w-full rounded-xl border p-3 font-mono text-xs"/>
          <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={()=>setRawEditId("")} className="rounded-xl border px-4 py-2">Отмена</button><button type="button" onClick={saveRawEdit} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Сохранить блок</button></div>
        </div>
      </div>}
    </div>
  );
}

export default RichLectureEditor;
