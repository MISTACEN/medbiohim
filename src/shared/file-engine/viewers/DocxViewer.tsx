"use client";

/**
 * Просмотр DOCX внутри сайта.
 *
 * Заголовки, абзацы, списки, таблицы, картинки и базовое форматирование.
 * Макросы и внешние объекты не выполняются: их просто нет в разобранной модели.
 */
import { useEffect, useState } from "react";
import { DEFAULT_LIMITS } from "../limits";
import { parseDocx, type DocBlock, type DocRun, type DocxDocument } from "../office/docx";
import { ViewerError, ViewerLoading, ViewerNotice } from "./parts";
import { useFileBytes } from "./useFileBytes";

function Runs({ runs }: { runs: readonly DocRun[] }) {
  return (
    <>
      {runs.map((run, index) => {
        const classes = [
          run.bold ? "font-semibold" : "",
          run.italic ? "italic" : "",
          run.underline ? "underline" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <span key={index} className={classes || undefined}>
            {run.text}
          </span>
        );
      })}
    </>
  );
}

function Block({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "heading": {
      const sizes = ["text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-sm"];
      return (
        <h3 className={`mt-5 font-extrabold first:mt-0 ${sizes[block.level - 1] ?? "text-base"}`}>
          <Runs runs={block.runs} />
        </h3>
      );
    }
    case "paragraph": {
      const content = <Runs runs={block.runs} />;
      if (block.list) {
        return (
          <div
            className="flex gap-2 text-sm leading-relaxed"
            style={{ marginLeft: `${Math.min(block.list.level, 8) * 18}px` }}
          >
            <span className="mt-1 shrink-0 text-slate-400">{block.list.ordered ? "·" : "•"}</span>
            <p className="min-w-0 whitespace-pre-wrap">{content}</p>
          </div>
        );
      }
      return <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">{content}</p>;
    }
    case "table":
      return (
        <div className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex === 0 ? "bg-slate-100 dark:bg-slate-800" : ""}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="whitespace-pre-wrap border border-[var(--border)] px-2.5 py-1.5 align-top"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "image":
      return (
        <img
          src={block.src}
          alt={block.alt}
          className="my-3 max-h-[60vh] max-w-full rounded-xl border border-[var(--border)] object-contain"
          loading="lazy"
        />
      );
    case "note":
      return <p className="text-xs italic text-slate-500">{block.text}</p>;
    default:
      return null;
  }
}

export function DocxViewer({ url }: { url: string }) {
  const { status, bytes, error, reload } = useFileBytes(url, DEFAULT_LIMITS.maxOfficeBytes);
  const [document, setDocument] = useState<DocxDocument | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ready" || !bytes) return;
    let active = true;
    setParseError(null);
    parseDocx(bytes)
      .then((result) => {
        if (active) setDocument(result);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setDocument(null);
        setParseError(reason instanceof Error ? reason.message : "Не удалось разобрать DOCX.");
      });
    return () => {
      active = false;
    };
  }, [status, bytes]);

  if (status === "loading") return <ViewerLoading label="Разбираем документ…" />;
  if (status === "error") return <ViewerError message={error ?? ""} onRetry={reload} />;
  if (parseError) return <ViewerError message={parseError} onRetry={reload} />;
  if (!document) return <ViewerLoading label="Разбираем документ…" />;

  return (
    <article className="mx-auto max-w-3xl space-y-2 rounded-xl bg-white p-5 shadow-sm dark:bg-slate-900">
      {document.warnings.map((warning) => (
        <ViewerNotice key={warning}>{warning}</ViewerNotice>
      ))}
      {document.blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
      {document.truncated ? <ViewerNotice tone="info">Документ показан не полностью.</ViewerNotice> : null}
    </article>
  );
}
