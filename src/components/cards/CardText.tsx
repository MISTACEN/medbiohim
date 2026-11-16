"use client";

/**
 * Текст карточки с поддержкой фото: картинка хранится прямо в тексте
 * markdown-разметкой `![подпись](/api/v1/files/<id>/download)`. Так фото
 * работает и в личных паках, и в опубликованных, и в SRS-повторении без
 * отдельной схемы БД.
 */
const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

export function CardText({ text, className = "" }: { text: string; className?: string }) {
  const value = String(text || "");
  if (!value) return <span className={className}>—</span>;

  const nodes: Array<{ kind: "text"; value: string } | { kind: "image"; alt: string; src: string }> = [];
  let last = 0;
  for (const match of value.matchAll(IMAGE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push({ kind: "text", value: value.slice(last, index) });
    nodes.push({ kind: "image", alt: match[1] || "Фото", src: match[2] });
    last = index + match[0].length;
  }
  if (last < value.length) nodes.push({ kind: "text", value: value.slice(last) });
  if (!nodes.length) return <span className={className}>{value}</span>;

  return (
    <div className={className}>
      {nodes.map((node, index) =>
        node.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`img-${index}`}
            src={node.src}
            alt={node.alt}
            loading="lazy"
            className="mt-1 max-h-64 w-full rounded-lg border border-[var(--border)] bg-white object-contain"
          />
        ) : (
          <span key={`txt-${index}`} className="whitespace-pre-wrap">
            {node.value}
          </span>
        ),
      )}
    </div>
  );
}
