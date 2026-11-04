"use client";

/**
 * Конструктор учебных материалов: редактор + предпросмотр + черновики +
 * экспорт/импорт JSON. Связь с предметом через канонические области.
 */

import { useEffect, useState } from "react";
import { Download, Eye, FilePlus2, Save, Trash2, Upload, Pencil } from "lucide-react";
import {
  CONSTRUCTOR_KIND_LABELS,
  deleteDraft,
  emptyDraft,
  exportDraft,
  importDraft,
  listDrafts,
  saveDraft,
  validateDraft,
  type ConstructorDraft,
  type ConstructorKind,
  type ConstructorData,
  type PyramidBlock,
} from "@/lib/constructors/constructors";

const BLOCK_LABELS: Record<Exclude<PyramidBlock, null>, string> = {
  base: "База (флеш-карты)",
  algo: "Алгоритм (чек-лист)",
  deep: "Углубление",
};

const inputCls = "rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm";

/* ---------- Редакторы по типу материала ---------- */

function CardsEditor({ data, onChange }: { data: Extract<ConstructorData, { kind: "cards" }>; onChange: (data: ConstructorData) => void }) {
  return (
    <ul className="space-y-3">
      {data.items.map((item, i) => (
        <li key={i} className="grid gap-2 sm:grid-cols-2">
          <input
            value={item.term}
            aria-label={`Термин карточки ${i + 1}`}
            placeholder="Термин"
            className={inputCls}
            onChange={(e) => {
              const items = [...data.items];
              items[i] = { ...item, term: e.target.value };
              onChange({ kind: "cards", items });
            }}
          />
          <input
            value={item.definition}
            aria-label={`Определение карточки ${i + 1}`}
            placeholder="Определение"
            className={inputCls}
            onChange={(e) => {
              const items = [...data.items];
              items[i] = { ...item, definition: e.target.value };
              onChange({ kind: "cards", items });
            }}
          />
        </li>
      ))}
      <button className="btn-pill" onClick={() => onChange({ kind: "cards", items: [...data.items, { term: "", definition: "" }] })}>
        + Карточка
      </button>
    </ul>
  );
}

function ChecklistEditor({ data, onChange }: { data: Extract<ConstructorData, { kind: "checklist" }>; onChange: (data: ConstructorData) => void }) {
  return (
    <ul className="space-y-2">
      {data.items.map((item, i) => (
        <li key={i}>
          <input
            value={item.text}
            aria-label={`Пункт ${i + 1}`}
            placeholder={`Пункт ${i + 1}`}
            className={`${inputCls} w-full`}
            onChange={(e) => {
              const items = [...data.items];
              items[i] = { ...item, text: e.target.value };
              onChange({ kind: "checklist", items });
            }}
          />
        </li>
      ))}
      <button className="btn-pill" onClick={() => onChange({ kind: "checklist", items: [...data.items, { text: "" }] })}>
        + Пункт
      </button>
    </ul>
  );
}

function TableEditor({ data, onChange }: { data: Extract<ConstructorData, { kind: "table" }>; onChange: (data: ConstructorData) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${data.columns.length}, minmax(0, 1fr))` }}>
        {data.columns.map((c, i) => (
          <input
            key={i}
            value={c}
            aria-label={`Столбец ${i + 1}`}
            className={`${inputCls} font-semibold`}
            onChange={(e) => {
              const columns = [...data.columns];
              columns[i] = e.target.value;
              onChange({ kind: "table", columns, rows: data.rows });
            }}
          />
        ))}
        {data.rows.map((row, r) =>
          row.map((cell, c) => (
            <input
              key={`${r}-${c}`}
              value={cell}
              aria-label={`Ячейка ${r + 1}:${c + 1}`}
              className={inputCls}
              onChange={(e) => {
                const rows = data.rows.map((rr, ri) => (ri === r ? rr.map((cc, ci) => (ci === c ? e.target.value : cc)) : rr));
                onChange({ kind: "table", columns: data.columns, rows });
              }}
            />
          )),
        )}
      </div>
      <button className="btn-pill" onClick={() => onChange({ kind: "table", columns: data.columns, rows: [...data.rows, data.columns.map(() => "")] })}>
        + Строка
      </button>
    </div>
  );
}

function StepsEditor({ data, onChange }: { data: Extract<ConstructorData, { kind: "steps" }>; onChange: (data: ConstructorData) => void }) {
  return (
    <ol className="space-y-3">
      {data.items.map((item, i) => (
        <li key={i} className="grid gap-2">
          <input
            value={item.title}
            aria-label={`Название шага ${i + 1}`}
            placeholder={`Шаг ${i + 1}: название`}
            className={`${inputCls} font-semibold`}
            onChange={(e) => {
              const items = [...data.items];
              items[i] = { ...item, title: e.target.value };
              onChange({ kind: "steps", items });
            }}
          />
          <textarea
            value={item.description}
            aria-label={`Описание шага ${i + 1}`}
            placeholder="Пояснение"
            rows={2}
            className={inputCls}
            onChange={(e) => {
              const items = [...data.items];
              items[i] = { ...item, description: e.target.value };
              onChange({ kind: "steps", items });
            }}
          />
        </li>
      ))}
      <button className="btn-pill" onClick={() => onChange({ kind: "steps", items: [...data.items, { title: "", description: "" }] })}>
        + Шаг
      </button>
    </ol>
  );
}

/* ---------- Предпросмотр ---------- */

function DraftPreview({ draft }: { draft: ConstructorDraft }) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <h3 className="font-bold">{draft.title || "Без названия"}</h3>
      {draft.topic && <p className="text-xs text-[var(--muted)]">Тема: {draft.topic}</p>}
      {draft.data.kind === "cards" && (
        <dl className="mt-2 space-y-2">
          {draft.data.items
            .filter((i) => i.term.trim())
            .map((i) => (
              <div key={i.term}>
                <dt className="font-semibold">{i.term}</dt>
                <dd className="text-sm">{i.definition}</dd>
              </div>
            ))}
        </dl>
      )}
      {draft.data.kind === "checklist" && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          {draft.data.items
            .filter((i) => i.text.trim())
            .map((i) => (
              <li key={i.text}>{i.text}</li>
            ))}
        </ol>
      )}
      {draft.data.kind === "table" && (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {draft.data.columns.map((c) => (
                <th key={c} className="px-2 py-1 text-left">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.data.rows.map((row, r) => (
              <tr key={r} className="border-b border-[var(--border)]">
                {row.map((c, ci) => (
                  <td key={ci} className="px-2 py-1">{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {draft.data.kind === "steps" && (
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
          {draft.data.items
            .filter((i) => i.title.trim())
            .map((i) => (
              <li key={i.title}>
                <span className="font-semibold">{i.title}</span> — {i.description}
              </li>
            ))}
        </ol>
      )}
    </div>
  );
}

/* ---------- Главный компонент ---------- */

export default function ConstructorBuilder() {
  const [draft, setDraft] = useState<ConstructorDraft | null>(null);
  const [drafts, setDrafts] = useState<ConstructorDraft[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");

  useEffect(() => setDrafts(listDrafts()), []);

  const update = (patch: Partial<ConstructorDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  };

  const create = (kind: ConstructorKind) => {
    setDraft(emptyDraft(kind));
    setMode("edit");
    setSaved(false);
    setProblems([]);
  };

  const doSave = () => {
    if (!draft) return;
    const p = validateDraft(draft);
    setProblems(p);
    if (p.length) return;
    saveDraft(draft);
    setDrafts(listDrafts());
    setSaved(true);
  };

  const doExport = () => {
    if (!draft) return;
    const blob = new Blob([exportDraft(draft)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.title || "material"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = () => {
    const res = importDraft(importText);
    if (res.error) setImportError(res.error);
    else if (res.draft) {
      setDraft(res.draft);
      setMode("edit");
      setImportError("");
      setImportText("");
    }
  };

  const kind = draft?.kind;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(CONSTRUCTOR_KIND_LABELS) as ConstructorKind[]).map((k) => (
          <button key={k} className="btn-pill flex items-center gap-1" onClick={() => create(k)}>
            <FilePlus2 className="h-3.5 w-3.5" /> {CONSTRUCTOR_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {/* Список черновиков */}
      {drafts.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Черновики</h2>
          <ul className="divide-y divide-[var(--border)]">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm">
                  <span className="font-semibold">{d.title || "Без названия"}</span>{" "}
                  <span className="text-xs text-[var(--muted)]">
                    · {CONSTRUCTOR_KIND_LABELS[d.kind]} · {new Date(d.updatedAt).toLocaleDateString("ru")}
                  </span>
                </span>
                <span className="flex gap-1">
                  <button className="btn-pill" onClick={() => { setDraft(d); setMode("edit"); }} aria-label={`Редактировать ${d.title}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button className="btn-pill" onClick={() => { deleteDraft(d.id); setDrafts(listDrafts()); }} aria-label={`Удалить ${d.title}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {draft && kind && (
        <section className="card p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{CONSTRUCTOR_KIND_LABELS[kind]}</h2>
            <div className="flex flex-wrap gap-2">
              <button className="btn-pill flex items-center gap-1" onClick={() => setMode(mode === "edit" ? "preview" : "edit")}>
                <Eye className="h-3.5 w-3.5" /> {mode === "edit" ? "Предпросмотр" : "Редактировать"}
              </button>
              <button className="btn-pill flex items-center gap-1" onClick={doSave}>
                <Save className="h-3.5 w-3.5" /> Сохранить
              </button>
              <button className="btn-pill flex items-center gap-1" onClick={doExport}>
                <Download className="h-3.5 w-3.5" /> Экспорт JSON
              </button>
            </div>
          </div>

          {problems.length > 0 && (
            <ul className="mb-4 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {saved && <p className="mb-4 text-sm text-[var(--status-ok-fg)]">Черновик сохранён.</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Название
              <input
                value={draft.title}
                onChange={(e) => update({ title: e.target.value })}
                className={`${inputCls} mt-1 w-full`}
                placeholder="Например: Буферные системы крови"
              />
            </label>
            <label className="text-sm">
              Тема
              <input
                value={draft.topic}
                onChange={(e) => update({ topic: e.target.value })}
                className={`${inputCls} mt-1 w-full`}
                placeholder="Например: КОС"
              />
            </label>
            {kind !== "table" && (
              <label className="text-sm">
                Блок пирамиды знаний
                <select
                  value={draft.block ?? ""}
                  onChange={(e) => update({ block: (e.target.value || null) as PyramidBlock })}
                  className={`${inputCls} mt-1 w-full`}
                >
                  {Object.entries(BLOCK_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {mode === "edit" ? (
            <div className="mt-4 space-y-3">
              {draft.data.kind === "cards" && <CardsEditor data={draft.data} onChange={(data) => update({ data })} />}
              {draft.data.kind === "checklist" && <ChecklistEditor data={draft.data} onChange={(data) => update({ data })} />}
              {draft.data.kind === "table" && <TableEditor data={draft.data} onChange={(data) => update({ data })} />}
              {draft.data.kind === "steps" && <StepsEditor data={draft.data} onChange={(data) => update({ data })} />}
            </div>
          ) : (
            <div className="mt-4">
              <DraftPreview draft={draft} />
            </div>
          )}
        </section>
      )}

      {/* Импорт */}
      <section className="card p-4">
        <h2 className="mb-2 flex items-center gap-1 font-semibold"><Upload className="h-4 w-4" /> Импорт JSON</h2>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={3}
          aria-label="JSON материала для импорта"
          placeholder="Вставьте JSON экспорта конструктора"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-xs"
        />
        {importError && <p className="mt-1 text-sm text-[var(--status-critical-fg)]">{importError}</p>}
        <button className="btn-pill mt-2" onClick={doImport} disabled={!importText.trim()}>
          Загрузить материал
        </button>
      </section>
    </div>
  );
}
