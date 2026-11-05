"use client";

/**
 * Конструктор учебных материалов (§15 задания агента №2) — самостоятельное
 * создание материалов без AI: заголовки, текст, таблицы, формулы, карточки
 * терминов, пошаговые разборы, упражнения.
 *
 * Принципы:
 *  - черновики хранятся локально (localStorage, отдельный ключ на пользователя);
 *  - карточки терминов выгружаются в существующий SRS (`srsAddCard`);
 *  - материал публикуется в существующую Workshop через
 *    `uploadFile` + `createWorkshopItem` (kind: notes) — без новых API;
 *  - блоки помечаются уровнем пирамиды знаний (База / Основной / Углубление);
 *  - предпросмотр и экспорт (Markdown/JSON) работают всегда, без сети.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen, ChevronDown, Download, FileDown, Layers, Loader2, Plus, Send, Trash2,
} from "lucide-react";
import { listSubjectsCatalog } from "@/lib/api/subjects";
import { uploadFile } from "@/lib/api/files";
import { createWorkshopItem } from "@/lib/api/workshop";
import { srsAddCard } from "@/lib/features-api";
import { currentUserScope } from "@/lib/auth/session";
import { describeApiError } from "@/lib/errors";

// ————————————————————— Модель черновика —————————————————————

type PyramidLevel = "base" | "core" | "advanced";

type Block =
  | { id: string; kind: "heading"; level: PyramidLevel | null; text: string }
  | { id: string; kind: "text"; level: PyramidLevel | null; text: string }
  | { id: string; kind: "formula"; level: PyramidLevel | null; latex: string; comment: string }
  | { id: string; kind: "table"; level: PyramidLevel | null; header: string[]; rows: string[][] }
  | { id: string; kind: "card"; level: PyramidLevel | null; term: string; definition: string; exported?: boolean }
  | { id: string; kind: "step"; level: PyramidLevel | null; title: string; body: string }
  | { id: string; kind: "exercise"; level: PyramidLevel | null; question: string; answer: string };

type Draft = {
  id: string;
  title: string;
  subjectId: string | null;
  subjectName: string | null;
  topic: string;
  blocks: Block[];
  updatedAt: number;
};

const STORAGE_PREFIX = "mbh:constructor:v1";

function storageKey(): string {
  const scope = currentUserScope();
  return scope ? `${STORAGE_PREFIX}:${scope}` : `${STORAGE_PREFIX}:anon`;
}

function newBlock(kind: Block["kind"]): Block {
  const id = Math.random().toString(36).slice(2, 10);
  switch (kind) {
    case "heading": return { id, kind, level: null, text: "" };
    case "text": return { id, kind, level: null, text: "" };
    case "formula": return { id, kind, level: null, latex: "", comment: "" };
    case "table": return { id, kind, level: null, header: ["", ""], rows: [["", ""]] };
    case "card": return { id, kind, level: "base", term: "", definition: "" };
    case "step": return { id, kind, level: "core", title: "", body: "" };
    case "exercise": return { id, kind, level: "advanced", question: "", answer: "" };
  }
}

function emptyDraft(): Draft {
  return {
    id: Math.random().toString(36).slice(2, 10),
    title: "Новый материал",
    subjectId: null,
    subjectName: null,
    topic: "",
    blocks: [],
    updatedAt: Date.now(),
  };
}

function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(storageKey());
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveDrafts(drafts: Draft[]): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(drafts));
  } catch {
    // Переполнение localStorage — черновик останется только на экране.
  }
}

const PYRAMID_LABELS: Record<PyramidLevel, string> = {
  base: "База — Must Know",
  core: "Основной материал",
  advanced: "Углубление — Применение",
};

// ————————————————————— Экспорт —————————————————————

function toMarkdown(draft: Draft): string {
  const lines: string[] = [`# ${draft.title}`, ""];
  if (draft.subjectName) lines.push(`_Предмет: ${draft.subjectName}${draft.topic ? ` · тема: ${draft.topic}` : ""}_`, "");
  let currentLevel: PyramidLevel | null = null;
  for (const block of draft.blocks) {
    if (block.level !== currentLevel) {
      currentLevel = block.level;
      if (block.level) lines.push(`## ${PYRAMID_LABELS[block.level]}`, "");
    }
    switch (block.kind) {
      case "heading": lines.push(`### ${block.text}`, ""); break;
      case "text": lines.push(block.text, ""); break;
      case "formula":
        lines.push(block.comment ? `${block.comment}` : "Формула:");
        lines.push("", "```latex", block.latex, "```", "");
        break;
      case "table":
        lines.push(`| ${block.header.join(" | ")} |`);
        lines.push(`| ${block.header.map(() => "---").join(" | ")} |`);
        for (const row of block.rows) lines.push(`| ${row.join(" | ")} |`);
        lines.push("");
        break;
      case "card": lines.push(`**${block.term}** — ${block.definition}`, ""); break;
      case "step": lines.push(`**Шаг: ${block.title}**`, "", block.body, ""); break;
      case "exercise": lines.push(`> **Упражнение.** ${block.question}`, "", `> Ответ: ${block.answer}`, ""); break;
    }
  }
  return lines.join("\n");
}

// ————————————————————— Редактор блока —————————————————————

function BlockEditor({ block, onChange, onRemove }: {
  block: Block;
  onChange: (next: Block) => void;
  onRemove: () => void;
}) {
  const inputClass = "w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm";
  const kindLabel: Record<Block["kind"], string> = {
    heading: "Заголовок", text: "Текст", formula: "Формула (LaTeX)", table: "Таблица",
    card: "Карточка терминов", step: "Шаг разбора", exercise: "Упражнение",
  };

  const update = (patch: Partial<Block>) => onChange({ ...block, ...patch } as Block);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary)]">{kindLabel[block.kind]}</span>
        <select
          value={block.level ?? ""}
          onChange={(e) => update({ level: (e.target.value || null) as PyramidLevel | null })}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
          aria-label="Уровень пирамиды знаний"
        >
          <option value="">Без уровня</option>
          <option value="base">База — Must Know</option>
          <option value="core">Основной материал</option>
          <option value="advanced">Углубление — Применение</option>
        </select>
        <button type="button" onClick={onRemove} className="ml-auto rounded-lg border border-[var(--border)] p-1 text-[var(--status-critical-fg)] hover:bg-[var(--status-critical-bg)]" aria-label="Удалить блок">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {(block.kind === "heading" || block.kind === "text") ? (
          <textarea value={block.text} onChange={(e) => update({ text: e.target.value })} rows={block.kind === "heading" ? 1 : 3} placeholder={block.kind === "heading" ? "Заголовок раздела" : "Текст материала"} className={inputClass} />
        ) : null}
        {block.kind === "formula" ? (
          <>
            <input value={block.latex} onChange={(e) => update({ latex: e.target.value })} placeholder="LaTeX: E = mc^2" className={inputClass} />
            <input value={block.comment} onChange={(e) => update({ comment: e.target.value })} placeholder="Пояснение к формуле" className={inputClass} />
          </>
        ) : null}
        {block.kind === "card" ? (
          <>
            <input value={block.term} onChange={(e) => update({ term: e.target.value })} placeholder="Термин" className={inputClass} />
            <textarea value={block.definition} onChange={(e) => update({ definition: e.target.value })} rows={2} placeholder="Определение — уйдёт в SRS-карточку" className={inputClass} />
          </>
        ) : null}
        {block.kind === "step" ? (
          <>
            <input value={block.title} onChange={(e) => update({ title: e.target.value })} placeholder="Шаг 1: ..." className={inputClass} />
            <textarea value={block.body} onChange={(e) => update({ body: e.target.value })} rows={2} placeholder="Что происходит на этом шаге" className={inputClass} />
          </>
        ) : null}
        {block.kind === "exercise" ? (
          <>
            <textarea value={block.question} onChange={(e) => update({ question: e.target.value })} rows={2} placeholder="Вопрос упражнения" className={inputClass} />
            <textarea value={block.answer} onChange={(e) => update({ answer: e.target.value })} rows={2} placeholder="Ответ" className={inputClass} />
          </>
        ) : null}
        {block.kind === "table" ? (
          <div className="space-y-1">
            <div className="flex gap-1">
              {block.header.map((cell, i) => (
                <input key={i} value={cell} onChange={(e) => update({ header: block.header.map((c, j) => (j === i ? e.target.value : c)) })} placeholder={`Колонка ${i + 1}`} className={inputClass} />
              ))}
            </div>
            {block.rows.map((row, r) => (
              <div key={r} className="flex gap-1">
                {row.map((cell, c) => (
                  <input key={c} value={cell} onChange={(e) => update({ rows: block.rows.map((rw, ri) => (ri === r ? rw.map((cl, ci) => (ci === c ? e.target.value : cl)) : rw)) })} className={inputClass} />
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ————————————————————— Главный компонент —————————————————————

export function MaterialConstructor() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(loadDrafts());
    listSubjectsCatalog()
      .then((res: any) => {
        const items = Array.isArray(res?.data?.items) ? res.data.items : Array.isArray(res?.data) ? res.data : [];
        setSubjects(items.map((s: any) => ({ id: String(s.id ?? ""), name: String(s.name ?? "") })).filter((s: any) => s.id && s.name));
      })
      .catch(() => setSubjects([]));
    return undefined;
  }, []);

  const active = useMemo(() => drafts.find((d) => d.id === activeId) ?? null, [drafts, activeId]);

  const mutateActive = useCallback((mutator: (draft: Draft) => Draft) => {
    setDrafts((prev) => {
      const next = prev.map((d) => (d.id === activeId ? mutator({ ...d, updatedAt: Date.now() }) : d));
      saveDrafts(next);
      return next;
    });
  }, [activeId]);

  function createDraft() {
    const draft = emptyDraft();
    setDrafts((prev) => {
      const next = [draft, ...prev];
      saveDrafts(next);
      return next;
    });
    setActiveId(draft.id);
    setPreview(false);
    setNote(null);
  }

  function removeDraft(id: string) {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.id !== id);
      saveDrafts(next);
      return next;
    });
    if (activeId === id) setActiveId(null);
  }

  function addBlock(kind: Block["kind"]) {
    if (!active) return;
    mutateActive((d) => ({ ...d, blocks: [...d.blocks, newBlock(kind)] }));
  }

  function exportMarkdown() {
    if (!active) return;
    const blob = new Blob([toMarkdown(active)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.title.replace(/[^\p{L}\p{N}\s-]/gu, "").trim() || "material"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    if (!active) return;
    const blob = new Blob([JSON.stringify(active, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportCardsToSrs() {
    if (!active) return;
    const cards = active.blocks.filter((b): b is Extract<Block, { kind: "card" }> => b.kind === "card" && b.term.trim() !== "" && b.definition.trim() !== "");
    if (!cards.length) {
      setNote("Карточек терминов в материале нет — добавьте блок «Карточка терминов».");
      return;
    }
    setBusy("srs");
    setNote(null);
    let added = 0;
    for (const card of cards) {
      const res = await srsAddCard({
        front: card.term,
        back: card.definition,
        subject_id: active.subjectId ?? undefined,
        topic: active.topic || undefined,
      });
      if (res.ok) added += 1;
    }
    mutateActive((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.kind === "card" ? { ...b, exported: true } : b)),
    }));
    setBusy(null);
    setNote(`В SRS выгружено карточек: ${added} из ${cards.length}. Повторять их — на странице «Карточки».`);
  }

  async function publishToWorkshop() {
    if (!active) return;
    setBusy("workshop");
    setNote(null);
    try {
      const markdown = toMarkdown(active);
      const file = new File([markdown], `${active.title.replace(/[^\p{L}\p{N}\s-]/gu, "").trim() || "material"}.md`, { type: "text/markdown" });
      const uploaded = await uploadFile(file);
      if (!uploaded.ok) {
        setNote(describeApiError(uploaded.error));
        setBusy(null);
        return;
      }
      const fileId = String((uploaded.data as any)?.file?.id || "");
      if (!fileId) {
        setNote("Сервер не вернул ID файла — публикация прервана.");
        setBusy(null);
        return;
      }
      const res = await createWorkshopItem({
        title: active.title,
        summary: `Конспект, созданный в конструкторе${active.topic ? ` (тема: ${active.topic})` : ""}.`,
        kind: "notes",
        subject_id: active.subjectId || null,
        topic: active.topic || null,
        files: [{ file_id: fileId, name: file.name, mime: file.type, size: file.size }],
      });
      if (!res.ok) {
        setNote(describeApiError(res.error));
        setBusy(null);
        return;
      }
      const status = String(res.data?.item?.status ?? "unknown");
      setNote(`Отправлено в Workshop. Статус материала: ${status === "pending" ? "на модерации" : status === "published" ? "опубликован" : status}.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Не удалось опубликовать материал.");
    }
    setBusy(null);
  }

  // ————————————————————— Рендер —————————————————————

  if (!active) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--muted)]">
            Черновики хранятся локально в этом браузере и никуда не отправляются до публикации.
          </p>
          <button type="button" onClick={createDraft} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Новый материал
          </button>
        </div>
        {drafts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
            Черновиков пока нет. Создайте первый: заголовки, текст, таблицы, формулы, карточки терминов,
            пошаговые разборы и упражнения — всё вручную, без AI.
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {drafts.map((draft) => (
              <li key={draft.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                <button type="button" onClick={() => { setActiveId(draft.id); setPreview(false); }} className="min-w-0 flex-1 text-left">
                  <b className="block break-words">{draft.title}</b>
                  <span className="text-xs text-[var(--muted)]">
                    {draft.subjectName || "без предмета"} · {draft.blocks.length} блоков · {new Date(draft.updatedAt).toLocaleString("ru-RU")}
                  </span>
                </button>
                <button type="button" onClick={() => removeDraft(draft.id)} className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--status-critical-fg)] hover:bg-[var(--status-critical-bg)]" aria-label={`Удалить черновик ${draft.title}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {note ? <p className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">{note}</p> : null}
      </div>
    );
  }

  const cardBlocks = active.blocks.filter((b) => b.kind === "card" && b.term.trim() && b.definition.trim()).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setActiveId(null)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs font-semibold hover:bg-[var(--primary-soft)]">
          <ChevronDown className="h-4 w-4 rotate-90" /> К списку черновиков
        </button>
        <button type="button" onClick={() => setPreview((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs font-semibold hover:bg-[var(--primary-soft)]" aria-pressed={preview}>
          <BookOpen className="h-4 w-4" /> {preview ? "Редактировать" : "Предпросмотр"}
        </button>
        <button type="button" onClick={exportMarkdown} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs font-semibold hover:bg-[var(--primary-soft)]">
          <Download className="h-4 w-4" /> Markdown
        </button>
        <button type="button" onClick={exportJson} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs font-semibold hover:bg-[var(--primary-soft)]">
          <FileDown className="h-4 w-4" /> JSON
        </button>
        <button type="button" onClick={() => void exportCardsToSrs()} disabled={busy !== null || cardBlocks === 0} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs font-semibold hover:bg-[var(--primary-soft)] disabled:opacity-50">
          {busy === "srs" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />} Карточки → SRS ({cardBlocks})
        </button>
        <button type="button" onClick={() => void publishToWorkshop()} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {busy === "workshop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} В Workshop
        </button>
      </div>

      {note ? <p className="rounded-xl border border-[var(--border)] bg-[var(--primary-soft)] px-3 py-2 text-sm" role="status">{note}</p> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <input
          value={active.title}
          onChange={(e) => mutateActive((d) => ({ ...d, title: e.target.value }))}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold md:col-span-1"
          aria-label="Название материала"
        />
        <select
          value={active.subjectId ?? ""}
          onChange={(e) => {
            const subject = subjects.find((s) => s.id === e.target.value) || null;
            mutateActive((d) => ({ ...d, subjectId: subject?.id ?? null, subjectName: subject?.name ?? null }));
          }}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
          aria-label="Предмет"
        >
          <option value="">Без предмета</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input
          value={active.topic}
          onChange={(e) => mutateActive((d) => ({ ...d, topic: e.target.value }))}
          placeholder="Тема (например: Мембранный потенциал)"
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
          aria-label="Тема"
        />
      </div>

      {preview ? (
        <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-xl font-extrabold">{active.title}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {active.subjectName || "Без предмета"}{active.topic ? ` · ${active.topic}` : ""}
          </p>
          {(() => {
            let shownLevel: string | null = null;
            return active.blocks.map((block) => {
              const heading = block.level && block.level !== shownLevel ? (
                <p key={`lvl-${block.level}-${block.id}`} className="mt-4 rounded-lg bg-[var(--primary-soft)] px-2 py-1 text-xs font-bold uppercase tracking-wide text-[var(--primary)]">
                  {PYRAMID_LABELS[block.level]}
                </p>
              ) : null;
              shownLevel = block.level;
              return (
                <div key={block.id}>
                  {heading}
                  {block.kind === "heading" ? <h3 className="mt-3 text-base font-bold">{block.text}</h3> : null}
                  {block.kind === "text" ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{block.text}</p> : null}
                  {block.kind === "formula" ? (
                    <div className="mt-2 rounded-xl border border-[var(--border)] p-3">
                      <code className="block whitespace-pre-wrap font-mono text-sm">{block.latex}</code>
                      {block.comment ? <p className="mt-1 text-xs text-[var(--muted)]">{block.comment}</p> : null}
                    </div>
                  ) : null}
                  {block.kind === "table" ? (
                    <table className="mt-2 w-full border-collapse text-sm">
                      <thead><tr>{block.header.map((h, i) => <th key={i} className="border border-[var(--border)] px-2 py-1 text-left">{h}</th>)}</tr></thead>
                      <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((c, i) => <td key={i} className="border border-[var(--border)] px-2 py-1">{c}</td>)}</tr>)}</tbody>
                    </table>
                  ) : null}
                  {block.kind === "card" ? <p className="mt-2 text-sm"><b>{block.term}</b> — {block.definition}</p> : null}
                  {block.kind === "step" ? (
                    <div className="mt-2 flex gap-2 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[11px] font-bold text-[var(--primary)]">→</span>
                      <div><b>{block.title}</b><p className="text-[var(--muted)]">{block.body}</p></div>
                    </div>
                  ) : null}
                  {block.kind === "exercise" ? (
                    <div className="mt-2 rounded-xl border border-dashed border-[var(--border)] p-3 text-sm">
                      <b>{block.question}</b>
                      <p className="mt-1 text-[var(--muted)]">Ответ: {block.answer}</p>
                    </div>
                  ) : null}
                </div>
              );
            });
          })()}
          {active.blocks.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">Блоков пока нет — вернитесь в редактор и добавьте.</p> : null}
        </article>
      ) : (
        <div className="space-y-2">
          {active.blocks.map((block) => (
            <BlockEditor
              key={block.id}
              block={block}
              onChange={(next) => mutateActive((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === block.id ? next : b)) }))}
              onRemove={() => mutateActive((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== block.id) }))}
            />
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            {(["heading", "text", "formula", "table", "card", "step", "exercise"] as const).map((kind) => (
              <button key={kind} type="button" onClick={() => addBlock(kind)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:bg-[var(--primary-soft)]">
                <Plus className="h-3.5 w-3.5" />
                {kind === "heading" ? "Заголовок" : kind === "text" ? "Текст" : kind === "formula" ? "Формула" : kind === "table" ? "Таблица" : kind === "card" ? "Карточка" : kind === "step" ? "Шаг разбора" : "Упражнение"}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="rounded-2xl border border-dashed border-[var(--border)] p-3 text-xs leading-5 text-[var(--muted)]">
        Автосохранение черновика — в этом браузере ({new Date(active.updatedAt).toLocaleString("ru-RU")}). Публикация в Workshop
        проходит через существующую модерацию; карточки терминов уходят в личное интервальное повторение (SRS).
        Модели создания на базе AI здесь нет и не требуется — материал пишется вручную.{" "}
        <Link href="/workshop" className="font-semibold text-[var(--primary)] hover:underline">Что уже опубликовано →</Link>
      </p>
    </div>
  );
}
