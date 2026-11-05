"use client";

/**
 * Текстовые форматы: обычный текст, Markdown и CSV.
 *
 * Markdown не превращается в HTML: разобранные блоки рисуются React-узлами,
 * поэтому `<script>` во входном файле остаётся текстом.
 */
import { useEffect, useState } from "react";
import { DEFAULT_LIMITS } from "../limits";
import { inlineMarkdown, normalizePlainText, parseCsv, parseMarkdown, type CsvTable, type MarkdownBlock } from "../text";
import { ViewerError, ViewerLoading, ViewerNotice } from "./parts";
import { useFileBytes } from "./useFileBytes";

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineMarkdown(text).map((token, index) => {
        if (token.type === "bold") return <strong key={index}>{token.text}</strong>;
        if (token.type === "italic") return <em key={index}>{token.text}</em>;
        if (token.type === "code")
          return (
            <code key={index} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] dark:bg-slate-800">
              {token.text}
            </code>
          );
        if (token.type === "link" && token.href)
          return (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] underline"
            >
              {token.text}
            </a>
          );
        return <span key={index}>{token.text}</span>;
      })}
    </>
  );
}

function MarkdownView({ blocks }: { blocks: MarkdownBlock[] }) {
  return (
    <article className="mx-auto max-w-3xl space-y-2 rounded-xl bg-white p-5 shadow-sm dark:bg-slate-900">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            const sizes = ["text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-sm"];
            return (
              <h3 key={index} className={`mt-4 font-extrabold first:mt-0 ${sizes[block.level - 1] ?? "text-base"}`}>
                <Inline text={block.text} />
              </h3>
            );
          }
          case "list":
            return block.ordered ? (
              <ol key={index} className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline text={item} />
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={index} className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            );
          case "code":
            return (
              <pre
                key={index}
                className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs leading-relaxed text-slate-100"
              >
                <code>{block.text}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote key={index} className="border-l-4 border-indigo-300 pl-3 text-sm italic text-slate-600">
                <Inline text={block.text} />
              </blockquote>
            );
          case "rule":
            return <hr key={index} className="my-3 border-[var(--border)]" />;
          default:
            return (
              <p key={index} className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                <Inline text={block.text} />
              </p>
            );
        }
      })}
    </article>
  );
}

function CsvView({ table }: { table: CsvTable }) {
  return (
    <div className="space-y-2">
      {table.truncated ? <ViewerNotice tone="info">Показаны первые строки: файл больше предела просмотра.</ViewerNotice> : null}
      <div className="max-h-[65vh] overflow-auto rounded-xl border border-[var(--border)] bg-white dark:bg-slate-900">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex === 0 ? "bg-slate-100 dark:bg-slate-800" : ""}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="min-w-[80px] whitespace-pre-wrap border border-[var(--border)] px-2 py-1 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TextViewer({ url, mode }: { url: string; mode: "text" | "markdown" | "csv" }) {
  const { status, bytes, error, reload } = useFileBytes(url, DEFAULT_LIMITS.maxTextBytes);
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ready" || !bytes) return;
    let active = true;
    try {
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
      if (active) setContent(decoded);
    } catch {
      if (active) setContent(null);
    }
    return () => {
      active = false;
    };
  }, [status, bytes]);

  if (status === "loading") return <ViewerLoading label="Читаем текст…" />;
  if (status === "error") return <ViewerError message={error ?? ""} onRetry={reload} />;
  if (content === null) return <ViewerError message="Не удалось декодировать текст." onRetry={reload} />;

  if (mode === "csv") return <CsvView table={parseCsv(content)} />;
  if (mode === "markdown") return <MarkdownView blocks={parseMarkdown(content)} />;

  return (
    <pre className="mx-auto max-w-4xl overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-white p-5 font-mono text-xs leading-relaxed shadow-sm dark:bg-slate-900">
      {normalizePlainText(content)}
    </pre>
  );
}
