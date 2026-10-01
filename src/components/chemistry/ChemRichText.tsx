"use client";

import { useMemo } from "react";
import { ChemicalFigure } from "@/components/chemistry/ChemicalFigure";
import { parseChemSpec } from "@/lib/chemistry/parseChemSpec";
import type { ChemicalFigureSpec } from "@/lib/chemistry/types";

type Segment =
  | { kind: "html"; html: string }
  | { kind: "chem"; spec: ChemicalFigureSpec };

/** Renders text with ```chem and [chem:…] for tests/tickets/practice. */
export function ChemRichText({
  text,
  className,
  asHtml,
}: {
  text: string;
  className?: string;
  asHtml?: boolean;
}) {
  const segments = useMemo(() => splitChemContent(text || ""), [text]);

  return (
    <div className={className || "space-y-2 text-sm"}>
      {segments.map((seg, i) => {
        if (seg.kind === "chem") {
          return <ChemicalFigure key={i} spec={{ ...seg.spec, size: seg.spec.size || "compact" }} />;
        }
        if (asHtml) {
          return (
            <div
              key={i}
              className="whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: seg.html }}
            />
          );
        }
        return (
          <div key={i} className="whitespace-pre-wrap">
            {seg.html}
          </div>
        );
      })}
    </div>
  );
}

function splitChemContent(text: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```chem\n([\s\S]*?)```/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  const fenceHits: Array<{ start: number; end: number; body: string }> = [];
  while ((m = fence.exec(text))) {
    fenceHits.push({ start: m.index, end: m.index + m[0].length, body: m[1] });
  }

  const pushText = (slice: string) => {
    if (!slice) return;
    const inline = /\[chem(?::([^\]]+)|\s+([^\]]+))\]/gi;
    let li = 0;
    let im: RegExpExecArray | null;
    while ((im = inline.exec(slice))) {
      if (im.index > li) segments.push({ kind: "html", html: slice.slice(li, im.index) });
      const body = (im[1] || im[2] || "").trim();
      const spec = parseInline(body);
      if (spec) segments.push({ kind: "chem", spec });
      else segments.push({ kind: "html", html: im[0] });
      li = im.index + im[0].length;
    }
    if (li < slice.length) segments.push({ kind: "html", html: slice.slice(li) });
  };

  if (!fenceHits.length) {
    pushText(text);
    return segments;
  }

  for (const hit of fenceHits) {
    if (hit.start > last) pushText(text.slice(last, hit.start));
    const spec = parseChemSpec(hit.body);
    if (spec) segments.push({ kind: "chem", spec });
    else segments.push({ kind: "html", html: hit.body });
    last = hit.end;
  }
  if (last < text.length) pushText(text.slice(last));
  return segments;
}

function parseInline(body: string): ChemicalFigureSpec | null {
  if (!body) return null;
  if (body.includes("=")) {
    return parseChemSpec(body.replace(/\s+/g, "\n").replace(/(\w+)=/g, "$1:"));
  }
  return parseChemSpec(body);
}
