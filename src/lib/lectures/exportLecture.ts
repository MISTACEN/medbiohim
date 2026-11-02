"use client";

/**
 * Скачивание лекции локально: Word (.doc) и PDF (печать в файл).
 *
 * Оба варианта собираются из того же markdown, что видит студент, поэтому
 * формулы, таблицы, списки и картинки остаются на месте. Word открывается в
 * Word/LibreOffice без конвертации, PDF сохраняется через системный диалог
 * печати — так кириллица и шрифты не ломаются.
 */

type LectureLike = {
  title?: string;
  subject?: string;
  subject_slug?: string;
  body_markdown?: string;
  body_md?: string;
  published_at?: string;
};

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function tableHtml(rows: string[]): string {
  const cells = rows.map((row) => row.split("|").slice(1, -1).map((cell) => cell.trim()));
  if (cells.length < 2) return rows.map((row) => "<p>" + inline(row) + "</p>").join("");
  const head = cells[0];
  const body = cells.slice(2);
  return (
    "<table><thead><tr>" +
    head.map((cell) => "<th>" + inline(cell) + "</th>").join("") +
    "</tr></thead><tbody>" +
    body.map((row) => "<tr>" + row.map((cell) => "<td>" + inline(cell) + "</td>").join("") + "</tr>").join("") +
    "</tbody></table>"
  );
}

function plainBlock(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    out.push("<p>" + paragraph.map(inline).join("<br>") + "</p>");
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flush();
      const level = Math.min(4, heading[1].length);
      out.push("<h" + level + ">" + inline(heading[2]) + "</h" + level + ">");
      continue;
    }
    if (/^(\|.*\|)$/.test(trimmed)) {
      flush();
      const rows: string[] = [];
      while (index < lines.length && /^\|.*\|$/.test(lines[index].trim())) {
        rows.push(lines[index].trim());
        index += 1;
      }
      index -= 1;
      out.push(tableHtml(rows));
      continue;
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      flush();
      const items: string[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push("<li>" + inline(lines[index].trim().replace(/^[-*+]\s+/, "")) + "</li>");
        index += 1;
      }
      index -= 1;
      out.push("<ul>" + items.join("") + "</ul>");
      continue;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flush();
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push("<li>" + inline(lines[index].trim().replace(/^\d+[.)]\s+/, "")) + "</li>");
        index += 1;
      }
      index -= 1;
      out.push("<ol>" + items.join("") + "</ol>");
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      flush();
      out.push("<blockquote>" + inline(trimmed.replace(/^>\s?/, "")) + "</blockquote>");
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      out.push("<hr>");
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  return out.join("\n");
}

export function lectureMarkdownToHtml(markdown: string): string {
  const source = String(markdown || "").replace(/\r\n?/g, "\n");
  const parts: string[] = [];
  const fenceRe = /```(\w*)\r?\n([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(source))) {
    parts.push(plainBlock(source.slice(last, match.index)));
    const kind = match[1];
    const body = match[2].trim();
    if (kind === "image") {
      try {
        const spec = JSON.parse(body);
        const src = String(spec?.url || "");
        if (src) parts.push('<p><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(String(spec?.caption || "")) + '"></p>');
      } catch {
        parts.push("<pre>" + escapeHtml(body) + "</pre>");
      }
    } else if (kind === "mermaid" || kind === "chart" || kind === "chem" || kind === "quiz" || kind === "leukocyte") {
      parts.push("<pre>" + escapeHtml(body) + "</pre>");
    } else {
      parts.push("<pre>" + escapeHtml(body) + "</pre>");
    }
    last = match.index + match[0].length;
  }
  parts.push(plainBlock(source.slice(last)));
  return parts.filter(Boolean).join("\n");
}

function lectureTitle(lecture: LectureLike): string {
  return String(lecture?.title || "Лекция");
}

function safeFileName(value: string): string {
  return (
    String(value || "lekciya")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90) || "lekciya"
  );
}

export function buildLectureHtml(lecture: LectureLike): string {
  const body = lectureMarkdownToHtml(String(lecture?.body_markdown || lecture?.body_md || ""));
  const subject = String(lecture?.subject || lecture?.subject_slug || "");
  const date = lecture?.published_at ? new Date(lecture.published_at).toLocaleDateString("ru-RU") : "";
  return (
    "<!DOCTYPE html><html lang=\"ru\"><head><meta charset=\"utf-8\">" +
    "<title>" + escapeHtml(lectureTitle(lecture)) + "</title>" +
    "<style>" +
    "body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#111;margin:24pt}" +
    "h1{font-size:20pt;line-height:1.25;margin:0 0 6pt}h2{font-size:15pt;margin:16pt 0 6pt}h3{font-size:13pt;margin:12pt 0 4pt}" +
    ".meta{color:#555;font-size:10pt;margin-bottom:16pt}" +
    "table{border-collapse:collapse;width:100%;margin:10pt 0}th,td{border:1px solid #999;padding:4pt 6pt;text-align:left;font-size:10.5pt}" +
    "th{background:#f0f0f0}img{max-width:100%;height:auto}blockquote{border-left:3px solid #666;margin:8pt 0;padding:4pt 10pt;color:#333}" +
    "pre{background:#f5f5f5;padding:6pt;white-space:pre-wrap;font-family:Consolas,monospace;font-size:10pt}" +
    "code{font-family:Consolas,monospace;background:#f5f5f5;padding:0 2pt}" +
    "hr{border:0;border-top:1px solid #bbb;margin:12pt 0}" +
    "</style></head><body>" +
    "<h1>" + escapeHtml(lectureTitle(lecture)) + "</h1>" +
    (subject || date ? '<div class="meta">' + escapeHtml(subject) + (date ? " · " + escapeHtml(date) : "") + "</div>" : "") +
    body +
    "</body></html>"
  );
}

export function downloadLectureWord(lecture: LectureLike): void {
  if (typeof window === "undefined") return;
  const html = buildLectureHtml(lecture);
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFileName(lectureTitle(lecture)) + ".doc";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** PDF — через системную печать: «Сохранить как PDF» без потери кириллицы. */
export function printLecturePdf(lecture: LectureLike): void {
  if (typeof window === "undefined") return;
  const html = buildLectureHtml(lecture);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      setTimeout(() => frame.remove(), 1500);
    }
  }, 400);
}
