"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ClipboardList,
  Eye,
  FilePlus2,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  adminDeleteAttestation,
  adminGetAttestation,
  adminListAttestations,
  adminSaveAttestation,
} from "@/lib/api";
import type {
  Attestation,
  AttestationItem,
  AttestationItemKind,
  AttestationStage,
  AttestationSummary,
  AttestationType,
} from "@/types/attestations";
import { ATTESTATION_TYPE_LABELS } from "@/types/attestations";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { clearDraft, formatDraftTime, readDraft, saveDraft, useUnsavedChanges } from "@/lib/unsaved-changes";
import { describeApiError } from "@/lib/errors";

const TYPES = Object.keys(ATTESTATION_TYPE_LABELS) as AttestationType[];
const KINDS: { value: AttestationItemKind; label: string }[] = [
  { value: "theory", label: "Теория" },
  { value: "test", label: "Тест" },
  { value: "task", label: "Задача" },
];

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100";
const labelClass = "mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function newAttestation(): Attestation {
  return {
    slug: "",
    subject_slug: "",
    type: "colloquium",
    title: "",
    description: "",
    pass_score: 70,
    is_published: false,
    stages: [{ id: uid("stage"), title: "Этап 1", items: [] }],
  };
}

function newItem(kind: AttestationItemKind): AttestationItem {
  if (kind === "test") {
    return { id: uid("item"), kind, title: "", options: ["", ""], correct: [0], explanation: "" };
  }
  if (kind === "task") return { id: uid("item"), kind, title: "", answer: "" };
  return { id: uid("item"), kind, title: "", body: "", answer: "" };
}

export default function AdminAttestationsPage() {
  const { confirm, dialog } = useConfirm();
  const [items, setItems] = useState<AttestationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Attestation | null>(null);
  const [isNew, setIsNew] = useState(false);
  // Снимок сохранённого состояния: аттестация — многоэкранная форма, и потерять
  // её из-за случайного перехода было слишком легко.
  const [editorBaseline, setEditorBaseline] = useState<string | null>(null);
  const [draftOffer, setDraftOffer] = useState<{ savedAt: string; data: { item: Attestation; isNew: boolean } } | null>(null);
  const attestationDraftKey = `admin:attestation:${draft?.subject_slug || "none"}:${draft?.slug || "new"}`;
  const editorDirty = Boolean(draft) && editorBaseline !== null && JSON.stringify(draft) !== editorBaseline;
  useUnsavedChanges(editorDirty);

  // Черновик формы переживает перезагрузку: этап и материалы можно набирать долго.
  useEffect(() => {
    if (!editorDirty || !draft) return;
    const timer = setTimeout(() => saveDraft(attestationDraftKey, { item: draft, isNew }), 800);
    return () => clearTimeout(timer);
  }, [editorDirty, draft, isNew, attestationDraftKey]);

  useEffect(() => {
    if (!draft) return setDraftOffer(null);
    const stored = readDraft<{ item: Attestation; isNew: boolean }>(attestationDraftKey);
    setDraftOffer(stored?.data?.item ? { savedAt: stored.savedAt, data: stored.data } : null);
  }, [attestationDraftKey, draft?.slug, draft?.subject_slug]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    const result = await adminListAttestations();
    setLoading(false);
    if (result.ok) setItems((result.data.items || []) as AttestationSummary[]);
    else setListError(result.error.code === "FORBIDDEN" ? "Нужны права преподавателя или администратора." : describeApiError(result.error));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.title, item.subject_slug, item.subject_name || "", ATTESTATION_TYPE_LABELS[item.type]]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [items, query]);

  async function openExisting(item: AttestationSummary) {
    setNotice(null);
    const result = await adminGetAttestation(item.subject_slug, item.slug);
    if (!result.ok) {
      setNotice({ tone: "error", text: describeApiError(result.error) });
      return;
    }
    const loaded = result.data.item as Attestation;
    setDraft(loaded);
    setEditorBaseline(JSON.stringify(loaded));
    setIsNew(false);
    setDraftOffer(null);
  }

  function startNew() {
    setNotice(null);
    const next = newAttestation();
    setDraft(next);
    setEditorBaseline(JSON.stringify(next));
    setIsNew(true);
    setDraftOffer(null);
  }

  function patch(values: Partial<Attestation>) {
    setDraft((current) => (current ? { ...current, ...values } : current));
  }

  function patchStages(next: AttestationStage[]) {
    patch({ stages: next });
  }

  function updateStage(index: number, values: Partial<AttestationStage>) {
    if (!draft) return;
    const stages = draft.stages.map((stage, i) => (i === index ? { ...stage, ...values } : stage));
    patchStages(stages);
  }

  function addStage() {
    if (!draft) return;
    patchStages([
      ...draft.stages,
      { id: uid("stage"), title: `Этап ${draft.stages.length + 1}`, items: [] },
    ]);
  }

  async function removeStage(index: number) {
    if (!draft) return;
    const agreed = await confirm({
      title: "Удалить этап?",
      description: "Вместе с этапом пропадут все его материалы, а нумерация остальных сдвинется.",
      confirmLabel: "Удалить этап",
      danger: true,
    });
    if (!agreed) return;
    patchStages(draft.stages.filter((_, i) => i !== index));
  }

  function moveStage(index: number, delta: number) {
    if (!draft) return;
    const target = index + delta;
    if (target < 0 || target >= draft.stages.length) return;
    const stages = [...draft.stages];
    [stages[index], stages[target]] = [stages[target], stages[index]];
    patchStages(stages);
  }

  function updateItem(stageIndex: number, itemIndex: number, values: Partial<AttestationItem>) {
    if (!draft) return;
    const stages = draft.stages.map((stage, i) =>
      i === stageIndex
        ? { ...stage, items: stage.items.map((item, j) => (j === itemIndex ? { ...item, ...values } : item)) }
        : stage
    );
    patchStages(stages);
  }

  function addItem(stageIndex: number, kind: AttestationItemKind) {
    if (!draft) return;
    const stages = draft.stages.map((stage, i) =>
      i === stageIndex ? { ...stage, items: [...stage.items, newItem(kind)] } : stage
    );
    patchStages(stages);
  }

  function removeItem(stageIndex: number, itemIndex: number) {
    if (!draft) return;
    const stages = draft.stages.map((stage, i) =>
      i === stageIndex ? { ...stage, items: stage.items.filter((_, j) => j !== itemIndex) } : stage
    );
    patchStages(stages);
  }

  function moveItem(stageIndex: number, itemIndex: number, delta: number) {
    if (!draft) return;
    const target = itemIndex + delta;
    const stage = draft.stages[stageIndex];
    if (!stage || target < 0 || target >= stage.items.length) return;
    const stageItems = [...stage.items];
    [stageItems[itemIndex], stageItems[target]] = [stageItems[target], stageItems[itemIndex]];
    updateStage(stageIndex, { items: stageItems });
  }

  async function save() {
    if (!draft) return;
    const subject = draft.subject_slug.trim();
    const slug = draft.slug.trim();
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(subject) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
      setNotice({ tone: "error", text: "Укажите subject_slug и slug: латиница, цифры, дефис." });
      return;
    }
    if (!draft.title.trim()) {
      setNotice({ tone: "error", text: "Укажите название аттестации." });
      return;
    }
    for (const [stageIndex, stage] of draft.stages.entries()) {
      if (!stage.title.trim()) {
        setNotice({ tone: "error", text: `Этап ${stageIndex + 1}: укажите название.` });
        return;
      }
      for (const [itemIndex, item] of stage.items.entries()) {
        if (!item.title.trim()) {
          setNotice({ tone: "error", text: `Этап ${stageIndex + 1}, материал ${itemIndex + 1}: заполните текст.` });
          return;
        }
        if (item.kind === "test") {
          const options = (item.options || []).map((option) => option.trim());
          if (options.filter(Boolean).length < 2) {
            setNotice({ tone: "error", text: `Этап ${stageIndex + 1}, тест ${itemIndex + 1}: нужно минимум два варианта.` });
            return;
          }
          if (!(item.correct || []).length) {
            setNotice({ tone: "error", text: `Этап ${stageIndex + 1}, тест ${itemIndex + 1}: отметьте правильный ответ.` });
            return;
          }
        }
      }
    }

    setSaving(true);
    setNotice(null);
    const result = await adminSaveAttestation(subject, slug, { ...draft, subject_slug: subject, slug });
    setSaving(false);
    if (!result.ok) {
      setNotice({ tone: "error", text: describeApiError(result.error) });
      return;
    }
    setNotice({ tone: "ok", text: isNew ? "Аттестация создана." : "Изменения сохранены." });
    setIsNew(false);
    const saved = result.data.item as Attestation;
    setDraft(saved);
    setEditorBaseline(JSON.stringify(saved));
    clearDraft(attestationDraftKey);
    setDraftOffer(null);
    void load();
  }

  async function remove(item: AttestationSummary) {
    const agreed = await confirm({
      title: "Удалить аттестацию?",
      description: `«${item.title}» — действие необратимо, материалы и этапы будут потеряны.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!agreed) return;
    const result = await adminDeleteAttestation(item.subject_slug, item.slug);
    if (!result.ok) {
      setNotice({ tone: "error", text: describeApiError(result.error) });
      return;
    }
    if (draft && draft.slug === item.slug && draft.subject_slug === item.subject_slug) {
      setDraft(null);
      setEditorBaseline(null);
    }
    setNotice({ tone: "ok", text: "Аттестация удалена." });
    void load();
  }

  const totalItems = draft?.stages.reduce((sum, stage) => sum + stage.items.length, 0) || 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> В центр управления
        </Link>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          <FilePlus2 className="h-4 w-4" /> Новая аттестация
        </button>
      </div>

      <header>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
          <ClipboardList className="h-4 w-4" /> Конструктор
        </div>
        <h1 className="mt-1.5 font-serif text-3xl font-semibold tracking-tight">Аттестации</h1>
        <p className="mt-1 text-sm text-slate-500">
          Коллоквиум, экзамен, зачёт, тест или контрольная по любому предмету. Этапы, теория, тесты с проверкой и задачи с эталоном.
        </p>
      </header>

      {draftOffer && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <span className="min-w-0 flex-1">
            Найден несохранённый черновик аттестации от {formatDraftTime(draftOffer.savedAt)}.
          </span>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => {
              setDraft(draftOffer.data.item);
              setIsNew(Boolean(draftOffer.data.isNew));
              setDraftOffer(null);
              setNotice({ tone: "ok", text: "Черновик восстановлен — проверьте и сохраните." });
            }}
          >
            Восстановить
          </button>
          <button
            type="button"
            className="text-xs font-semibold text-[var(--status-critical-fg)]"
            onClick={() => { clearDraft(attestationDraftKey); setDraftOffer(null); }}
          >
            Удалить черновик
          </button>
        </div>
      )}

      {notice && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "ok" ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {notice.tone === "ok" && <CheckCircle2 className="h-4 w-4" />} {notice.text}
          </span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {!draft && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
            <h2 className="text-sm font-bold">Опубликованные и черновики</h2>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по названию или предмету"
              className={`${inputClass} max-w-xs`}
            />
          </div>

          {loading && (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
            </div>
          )}
          {listError && <div className="p-6 text-sm text-[var(--status-critical-fg)]">{listError}</div>}
          {!loading && !listError && filtered.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400">Аттестаций пока нет. Создайте первую.</div>
          )}

          <ul className="divide-y divide-[var(--border)]">
            {filtered.map((item) => (
              <li key={`${item.subject_slug}:${item.slug}`} className="flex flex-wrap items-center gap-3 p-4">
                <span className={`h-2 w-2 shrink-0 rounded-full ${item.is_published ? "bg-[var(--status-ok-fg)]" : "bg-[var(--status-warn-fg)]"}`} />
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => void openExisting(item)} className="block text-left">
                    <span className="block text-sm font-semibold text-[var(--text)] hover:text-indigo-600">{item.title}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">
                      {ATTESTATION_TYPE_LABELS[item.type]} · {item.subject_name || item.subject_slug} · {item.stages_count} этап(ов) ·{" "}
                      {item.items_count} материал(ов) · {item.is_published ? "опубликовано" : "черновик"}
                    </span>
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    href={`/subjects/${item.subject_slug}/attestations/${item.slug}`}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-slate-500 hover:text-indigo-600"
                    aria-label="Открыть"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => void remove(item)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-slate-400 hover:border-[var(--status-critical-border)] hover:text-[var(--status-critical-fg)]"
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {draft && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" /> К списку
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{totalItems} материалов</span>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Сохранить
              </button>
            </div>
          </div>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-sm font-bold">Основное</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label>
                <span className={labelClass}>Название</span>
                <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} className={inputClass} placeholder="Коллоквиум по физиологии возбудимых систем" />
              </label>
              <label>
                <span className={labelClass}>Тип</span>
                <select value={draft.type} onChange={(e) => patch({ type: e.target.value as AttestationType })} className={inputClass}>
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {ATTESTATION_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>Предмет (slug)</span>
                <input value={draft.subject_slug} onChange={(e) => patch({ subject_slug: e.target.value })} className={inputClass} placeholder="physiology" />
              </label>
              <label>
                <span className={labelClass}>Адрес аттестации (slug)</span>
                <input value={draft.slug} onChange={(e) => patch({ slug: e.target.value })} className={inputClass} placeholder="colloquium-1" />
              </label>
              <label className="sm:col-span-2">
                <span className={labelClass}>Описание</span>
                <textarea value={draft.description || ""} onChange={(e) => patch({ description: e.target.value })} rows={2} className={inputClass} />
              </label>
              <label>
                <span className={labelClass}>Курс</span>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={draft.course_number ?? ""}
                  onChange={(e) => patch({ course_number: e.target.value ? Number(e.target.value) : undefined })}
                  className={inputClass}
                />
              </label>
              <label>
                <span className={labelClass}>Семестр</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={draft.semester ?? ""}
                  onChange={(e) => patch({ semester: e.target.value ? Number(e.target.value) : undefined })}
                  className={inputClass}
                />
              </label>
              <label>
                <span className={labelClass}>Проходной балл, %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.pass_score ?? 70}
                  onChange={(e) => patch({ pass_score: Number(e.target.value) })}
                  className={inputClass}
                />
              </label>
              <label>
                <span className={labelClass}>Доступ с</span>
                <input
                  type="datetime-local"
                  value={draft.available_from ? draft.available_from.slice(0, 16) : ""}
                  onChange={(e) => patch({ available_from: e.target.value || null })}
                  className={inputClass}
                />
              </label>
              <label>
                <span className={labelClass}>Доступ до</span>
                <input
                  type="datetime-local"
                  value={draft.available_to ? draft.available_to.slice(0, 16) : ""}
                  onChange={(e) => patch({ available_to: e.target.value || null })}
                  className={inputClass}
                />
              </label>
              <label className="flex items-center gap-2 self-end rounded-xl border border-[var(--border)] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={draft.is_published}
                  onChange={(e) => patch({ is_published: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span className="text-sm font-semibold">Опубликовать для студентов</span>
              </label>
            </div>
          </section>

          {draft.stages.map((stage, stageIndex) => (
            <section key={stage.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-4">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 font-mono text-xs font-bold text-indigo-600">
                  {String(stageIndex + 1).padStart(2, "0")}
                </span>
                <input
                  value={stage.title}
                  onChange={(e) => updateStage(stageIndex, { title: e.target.value })}
                  className={`${inputClass} max-w-sm font-semibold`}
                  placeholder="Название этапа"
                />
                <input
                  value={stage.description || ""}
                  onChange={(e) => updateStage(stageIndex, { description: e.target.value })}
                  className={`${inputClass} max-w-md`}
                  placeholder="Короткое описание (необязательно)"
                />
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => moveStage(stageIndex, -1)} disabled={stageIndex === 0} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-slate-500 disabled:opacity-30" aria-label="Выше">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => moveStage(stageIndex, 1)} disabled={stageIndex === draft.stages.length - 1} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-slate-500 disabled:opacity-30" aria-label="Ниже">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => void removeStage(stageIndex)} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-slate-400 hover:border-[var(--status-critical-border)] hover:text-[var(--status-critical-fg)]" aria-label="Удалить этап">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3 p-4">
                {stage.items.map((item, itemIndex) => (
                  <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--background)]/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={item.kind}
                        onChange={(e) => {
                          const kind = e.target.value as AttestationItemKind;
                          const fresh = newItem(kind);
                          updateItem(stageIndex, itemIndex, {
                            ...fresh,
                            id: item.id,
                            title: item.title,
                            kind,
                            options: kind === "test" ? item.options || ["", ""] : undefined,
                            correct: kind === "test" ? item.correct || [0] : undefined,
                            body: kind === "theory" ? item.body : undefined,
                            answer: item.answer,
                          });
                        }}
                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs font-semibold"
                      >
                        {KINDS.map((kind) => (
                          <option key={kind.value} value={kind.value}>
                            {kind.label}
                          </option>
                        ))}
                      </select>
                      <span className="font-mono text-[11px] text-slate-400">
                        {String(stageIndex + 1)}.{String(itemIndex + 1).padStart(2, "0")}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <button type="button" onClick={() => moveItem(stageIndex, itemIndex, -1)} disabled={itemIndex === 0} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] text-slate-500 disabled:opacity-30" aria-label="Выше">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => moveItem(stageIndex, itemIndex, 1)} disabled={itemIndex === stage.items.length - 1} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] text-slate-500 disabled:opacity-30" aria-label="Ниже">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => removeItem(stageIndex, itemIndex)} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] text-slate-400 hover:border-[var(--status-critical-border)] hover:text-[var(--status-critical-fg)]" aria-label="Удалить материал">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <label className="mt-3 block">
                      <span className={labelClass}>{item.kind === "test" ? "Вопрос" : item.kind === "task" ? "Условие задачи" : "Тема / вопрос"}</span>
                      <textarea value={item.title} onChange={(e) => updateItem(stageIndex, itemIndex, { title: e.target.value })} rows={2} className={inputClass} />
                    </label>

                    {item.kind !== "task" && (
                      <label className="mt-2 block">
                        <span className={labelClass}>{item.kind === "theory" ? "Текст теории" : "Пояснение к ответу (необязательно)"}</span>
                        <textarea
                          value={item.kind === "theory" ? item.body || "" : item.explanation || ""}
                          onChange={(e) =>
                            updateItem(stageIndex, itemIndex, item.kind === "theory" ? { body: e.target.value } : { explanation: e.target.value })
                          }
                          rows={item.kind === "theory" ? 4 : 2}
                          className={inputClass}
                        />
                      </label>
                    )}

                    {item.kind === "test" && (
                      <div className="mt-2">
                        <span className={labelClass}>Варианты ответа (отметьте правильные)</span>
                        <div className="space-y-2">
                          {(item.options || []).map((option, optionIndex) => (
                            <div key={optionIndex} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={(item.correct || []).includes(optionIndex)}
                                onChange={(e) => {
                                  const set = new Set(item.correct || []);
                                  if (e.target.checked) set.add(optionIndex);
                                  else set.delete(optionIndex);
                                  updateItem(stageIndex, itemIndex, { correct: [...set].sort((a, b) => a - b) });
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-[var(--status-ok-fg)]"
                                aria-label={`Правильный вариант ${optionIndex + 1}`}
                              />
                              <span className="font-mono text-[11px] text-slate-400">{String.fromCharCode(1040 + optionIndex)}</span>
                              <input
                                value={option}
                                onChange={(e) => {
                                  const options = [...(item.options || [])];
                                  options[optionIndex] = e.target.value;
                                  updateItem(stageIndex, itemIndex, { options });
                                }}
                                className={inputClass}
                                placeholder={`Вариант ${optionIndex + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const options = (item.options || []).filter((_, i) => i !== optionIndex);
                                  const correct = (item.correct || [])
                                    .filter((i) => i !== optionIndex)
                                    .map((i) => (i > optionIndex ? i - 1 : i));
                                  updateItem(stageIndex, itemIndex, { options, correct });
                                }}
                                disabled={(item.options || []).length <= 2}
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] text-slate-400 hover:border-[var(--status-critical-border)] hover:text-[var(--status-critical-fg)] disabled:opacity-30"
                                aria-label="Удалить вариант"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateItem(stageIndex, itemIndex, { options: [...(item.options || []), ""] })}
                          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                        >
                          <Plus className="h-3.5 w-3.5" /> Вариант
                        </button>
                      </div>
                    )}

                    {item.kind !== "test" && (
                      <label className="mt-2 block">
                        <span className={labelClass}>{item.kind === "theory" ? "Конспект ответа (необязательно)" : "Эталонное решение"}</span>
                        <textarea value={item.answer || ""} onChange={(e) => updateItem(stageIndex, itemIndex, { answer: e.target.value })} rows={3} className={inputClass} />
                      </label>
                    )}
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Добавить:</span>
                  {KINDS.map((kind) => (
                    <button
                      key={kind.value}
                      type="button"
                      onClick={() => addItem(stageIndex, kind.value)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600"
                    >
                      <Plus className="h-3.5 w-3.5" /> {kind.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ))}

          <button
            type="button"
            onClick={addStage}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] py-4 text-sm font-semibold text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600"
          >
            <Plus className="h-4 w-4" /> Добавить этап
          </button>
        </div>
      )}
      {dialog}
    </div>
  );
}
