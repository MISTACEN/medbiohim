/**
 * Рендер Markdown → HTML для лекций и AI-тьютора. Общая функция:
 * раньше жила в LectureRenderer, TutorMarkdown импортировал её из компонента.
 * Выделено в lib (аудит 2026-11-22): чистая функция без DOM — escapeHtml +
 * chemicalFormulaInHtml; whitelist тегов и правила формул описаны в блоках ниже.
 */
import { chemicalFormulaInHtml } from "@/lib/chemistry/formula";
import { escapeHtml } from "@/lib/html-escape";

/** Рендер Markdown → HTML (общий с AI-тьютором: TutorMarkdown). */
export function mdToHtml(md: string): string {
  // Lecture bodies are stored as Markdown. Keep the renderer deterministic and
  // safe, while also tolerating older imports that contain literal HTML tags.
  let s = escapeHtml(String(md || "").replace(/\r\n?/g, "\n"));

  // Служебные HTML-комментарии (например, маркер идемпотентности
  // <!-- MBH:SELFWORK:hist-03-embriologiya --> из scripts/apply-embryology-selfwork.mjs)
  // не должны выводиться в текст лекции: после escapeHtml они выглядели бы
  // как обычный текст, ведь whitelist возвращает только известные теги.
  s = s.replace(/&lt;!--[\s\S]*?--&gt;/g, "");

  // Older lecture imports may contain already-materialized heading/block tags.
  // Only re-enable the small, known-safe block/inline tag set.
  s = s.replace(/&lt;\/?(h[1-4]|p|div|br|strong|b|em|i|u|s|blockquote|ul|ol|li|hr)(?:\s+[^&]*?)?&gt;/gi, (tag) =>
    tag.replace(/^&lt;/i, "<").replace(/&gt;$/i, ">")
  );

  s = s.replace(/\$\$([\\s\\S]+?)\$\$/g, (_a, body) => `<div class="lec-math">\\\\[${body.trim()}\\\\]</div>`);
  s = s.replace(/(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g, (_a, body) => `<span class="lec-math">\\\\(${body}\\\\)</span>`);
  s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  s = s.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_a, label, href) => {
    const target = String(href || "");
    const safe = target.startsWith("/") || /^https?:\/\//i.test(target);
    return safe
      ? "<a href=\"" + target + "\" target=\"" + (target.startsWith("/") ? "_self" : "_blank") + "\" rel=\"noreferrer\">" + label + "</a>"
      : label;
  });
  // Многострочная цитата: строки, начинающиеся с «>», — один блок, а не
  // отдельные blockquote на каждую строку.
  // После escapeHtml символ «>» уже превращён в «&gt;», поэтому ловим оба вида.
  s = s.replace(/(?:^(?:>|&gt;)[^\n]*(?:\n|$))+/gm, (block) => {
    const lines = block
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => line.replace(/^(?:>|&gt;)\s?/, "").trim())
      .filter(Boolean);
    return lines.length ? `<blockquote>${lines.join("<br>")}</blockquote>` : "";
  });
  s = s.replace(/^-\s+(.+)$/gm, "<li>$1</li>");
  s = s.replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);
  s = s.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  s = s.replace(/(?:^\|.+\|\n?)+/gm, (table) => {
    const rows = table.trim().split("\n").filter(Boolean);
    if (rows.length < 2) return table;
    const parseRow = (r: string) => r.split("|").slice(1, -1).map((c) => c.trim());
    if (!/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(rows[1])) return table;
    const head = parseRow(rows[0]);
    const bodyRows = rows.slice(2).map(parseRow);
    const thead = `<thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
    return `<div class="lec-table-wrap"><table class="lec-table">${thead}${tbody}</table></div>`;
  });
  // Горизонтальная линия-разделитель.
  s = s.replace(/^(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "<hr>");

  // Разбиваем на блоки и заворачиваем обычный текст в <p>: без этого
  // Tailwind-prose не применяет абзацный отступ и межстрочные интервалы.
  // Заголовки, списки, таблицы, цитаты и линии уже блочные — их не трогаем.
  const blocks = s.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const html = blocks
    .map((block) => {
      if (/^<(?:h[1-6]|p|div|ul|ol|li|blockquote|table|hr|figure|pre)\b/i.test(block)) return block;
      return `<p>${block.replace(/\n/g, " ")}</p>`;
    })
    .join("\n");
  // Формулы в тексте лекции: H2SO4 → H₂SO₄, Fe^3+ → Fe³⁺. Без этого
  // набранные «по-простому» формулы выглядели как черновик.
  return chemicalFormulaInHtml(`<div>${html}</div>`);
}


