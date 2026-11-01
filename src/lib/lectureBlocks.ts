/** Структура лекции в редакторе: блоки = подтемы по H2/H3.
 *  Операции меняют только нужный кусок markdown, остальной текст остаётся как был. */

const FENCE = String.fromCharCode(96).repeat(3);

export type MarkdownBlock = { title: string; start: number; end: number; markdown: string };

function headingMatches(markdown: string) {
  const out: Array<{ title: string; start: number }> = [];
  const re = /^#{2,3}\s+(.+)$/gm;
  for (const match of markdown.matchAll(re)) {
    out.push({ title: match[1].trim(), start: match.index ?? 0 });
  }
  return out;
}

/** Кусочки лекции: текст до первого заголовка входит в первый блок. */
export function blockRanges(markdown: string): MarkdownBlock[] {
  const source = String(markdown || "").replace(/\r\n?/g, "\n");
  const heads = headingMatches(source);
  if (!heads.length) return [];
  return heads.map((head, i) => {
    const start = i === 0 ? 0 : head.start;
    const end = i + 1 < heads.length ? heads[i + 1].start : source.length;
    return { title: head.title, start, end, markdown: source.slice(start, end) };
  });
}

function rebuild(blocks: MarkdownBlock[]): string {
  return blocks.map((block) => block.markdown).join("");
}

export function updateBlockTitle(markdown: string, index: number, title: string): string {
  const blocks = blockRanges(markdown);
  const target = blocks[index];
  const next = String(title || "").trim();
  if (!target || !next) return markdown;
  const headingOffset = target.markdown.search(/^#{2,3}\s+/m);
  if (headingOffset < 0) return markdown;
  const level = target.markdown.slice(headingOffset).match(/^#{2,3}/)?.[0] || "##";
  blocks[index] = {
    ...target,
    title: next,
    markdown: target.markdown.replace(/^#{2,3}\s+.+$/m, level + " " + next),
  };
  return rebuild(blocks);
}

export function moveBlock(markdown: string, index: number, direction: -1 | 1): string {
  const blocks = blockRanges(markdown);
  const target = index + direction;
  if (index < 0 || target < 0 || index >= blocks.length || target >= blocks.length) return markdown;
  const swapped = [...blocks];
  [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
  const prefix = blocks[0].start === 0 ? "" : markdown.slice(0, blocks[0].start);
  return prefix + rebuild(swapped);
}

export function removeBlockAt(markdown: string, index: number): string {
  const blocks = blockRanges(markdown);
  if (index < 0 || index >= blocks.length) return markdown;
  return rebuild(blocks.filter((_, i) => i !== index)).trimEnd() + "\n";
}

/** Новый блок в конец лекции. Нумерацию подставляет автор — префикс не навязываем. */
export function appendBlock(markdown: string, title: string, content = ""): string {
  const next = String(title || "").trim() || "Новый блок";
  const base = String(markdown || "").replace(/\s+$/, "");
  return (base ? base + "\n\n" : "") + "## " + next + "\n\n" + (content.trim() ? content.trim() + "\n" : "");
}

export type BlockQuizSpec = { subjectId: string; title?: string; questionIds: string[] };

/** Прикрепляет мини-тест к блоку, заменяя прежний тест этого блока. */
export function setBlockQuiz(markdown: string, index: number, spec: BlockQuizSpec): string {
  const blocks = blockRanges(markdown);
  const target = blocks[index];
  if (!target) return markdown;
  const withoutQuiz = target.markdown.replace(new RegExp(FENCE + "quiz\\b[\\s\\S]*?" + FENCE, "g"), "").replace(/\s+$/, "");
  const quizFence =
    "\n\n" + FENCE + "quiz\n" +
    JSON.stringify({ subjectId: spec.subjectId, title: spec.title || "Проверь себя", questionIds: spec.questionIds }, null, 2) +
    "\n" + FENCE + "\n";
  blocks[index] = { ...target, markdown: withoutQuiz + quizFence };
  return rebuild(blocks);
}

/** Список id вопросов, уже привязанных к блоку. */
export function blockQuizIds(block: MarkdownBlock): string[] {
  const ids: string[] = [];
  for (const match of block.markdown.matchAll(new RegExp(FENCE + "quiz\\b\\s*\\n([\\s\\S]*?)\\n?" + FENCE, "g"))) {
    try {
      const spec = JSON.parse(match[1].trim()) as { questionIds?: unknown };
      if (Array.isArray(spec.questionIds)) ids.push(...spec.questionIds.map(String).filter(Boolean));
    } catch {
      /* битый блок не считаем */
    }
  }
  return ids;
}
