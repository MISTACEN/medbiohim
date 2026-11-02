/**
 * Авторазметка лекционного текста.
 *
 * Импортированные лекции часто лежат «сплошняком»: один абзац на несколько
 * тысяч символов, разделы без заголовков. В редакторе и у студента такой текст
 * выглядит стеной, поэтому автор правит вслепую.
 *
 * Функция осторожная: она не переписывает и не переставляет слова — только
 * добавляет пустые строки между абзацами, режет слишком длинные полотна по
 * границам предложений и поднимает очевидные названия разделов в заголовки.
 * Кодовые блоки (mermaid, image, quiz, selfwork, exam) не затрагиваются.
 */

export type StructureResult = {
  markdown: string;
  changed: boolean;
  headings: number;
  paragraphs: number;
};

const FENCE = "```";
const TARGET_PARAGRAPH = 320;
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[А-ЯЁA-Z«"(])/;

type Heading = { level: number; text: string };

/** «2.Основы общей эмбриологии», «3.1 Периоды», «ОНТОГЕНЕЗ» — раздел, а не фраза. */
function detectHeading(line: string): Heading | null {
  const text = line.trim();
  if (!text || text.length > 90) return null;
  if (/^#{1,6}\s/.test(text)) return null;
  if (/[.!?;,:]$/.test(text)) return null;
  if (/^[-*+]\s/.test(text) || /^\|/.test(text) || /^>/.test(text)) return null;

  const numbered = text.match(/^(\d+(?:\.\d+)*)[.)]?\s*([А-ЯЁA-Z].*)$/);
  if (numbered) {
    const depth = numbered[1].split(".").length;
    const title = numbered[2].trim();
    if (title.length >= 3) return { level: Math.min(4, 1 + depth), text: title };
  }

  const letters = text.replace(/[^A-Za-zА-Яа-яЁё]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase() && text.length <= 70) {
    return { level: 2, text };
  }
  return null;
}

function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_BREAK)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Длинный абзац режется на читаемые куски по 2–3 предложения. */
function packParagraph(text: string): string[] {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return [];
  if (value.length <= TARGET_PARAGRAPH) return [value];
  const sentences = splitSentences(value);
  if (sentences.length <= 1) return [value];
  const perParagraph = value.length > 700 ? 2 : 3;
  const out: string[] = [];
  for (let index = 0; index < sentences.length; index += perParagraph) {
    out.push(sentences.slice(index, index + perParagraph).join(" "));
  }
  return out;
}

/** Разметка одного текстового куска (вне ```фенсов```). */
function structurePlainText(chunk: string): { blocks: string[]; headings: number } {
  const blocks: string[] = [];
  let headings = 0;
  let buffer: string[] = [];

  const flush = () => {
    if (!buffer.length) return;
    const joined = buffer.join(" ").trim();
    buffer = [];
    if (!joined) return;
    for (const paragraph of packParagraph(joined)) blocks.push(paragraph);
  };

  // Разделы бывают зашиты в середину строки: «…вопросами. 2.Основы общей
  // эмбриологии Эмбриогенез…». Режем перед таким номером, не меняя слов.
  const spaced = chunk
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+(?=\d+(?:\.\d+)*[.)]?\s?[А-ЯЁA-Z])/g, "\n");

  for (const rawLine of spaced.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      flush();
      blocks.push(line);
      headings += 1;
      continue;
    }
    if (/^[-*+]\s/.test(line) || /^\d+[.)]\s/.test(line) || /^\|/.test(line) || /^>/.test(line)) {
      flush();
      blocks.push(line);
      continue;
    }
    const heading = detectHeading(line);
    if (heading) {
      flush();
      blocks.push("#".repeat(heading.level) + " " + heading.text);
      headings += 1;
      continue;
    }
    buffer.push(line);
    if (buffer.join(" ").length >= TARGET_PARAGRAPH * 2) flush();
  }
  flush();
  return { blocks, headings };
}

export function structureLectureMarkdown(markdown: string): StructureResult {
  const source = String(markdown || "").replace(/\r\n?/g, "\n");
  if (!source.trim()) return { markdown: source, changed: false, headings: 0, paragraphs: 0 };

  const pieces: string[] = [];
  let headings = 0;
  let last = 0;
  const fenceRe = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRe.exec(source))) {
    const result = structurePlainText(source.slice(last, match.index));
    headings += result.headings;
    pieces.push(...result.blocks);
    pieces.push(match[0].trim());
    last = match.index + match[0].length;
  }
  const tail = structurePlainText(source.slice(last));
  headings += tail.headings;
  pieces.push(...tail.blocks);

  const markdownOut = pieces.filter(Boolean).join("\n\n") + "\n";
  const paragraphs = pieces.filter((piece) => piece && !piece.startsWith(FENCE)).length;
  return {
    markdown: markdownOut,
    // Слова не меняются никогда: правка — только пустые строки и «#».
    changed: markdownOut.trim() !== source.trim(),
    headings,
    paragraphs,
  };
}
