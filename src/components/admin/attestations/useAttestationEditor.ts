"use client";

/**
 * Конструктор аттестаций: список, черновик формы с автосохранением, этапы и
 * материалы, сохранение и удаление. Разметка — в панелях домена.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminDeleteAttestation, adminGetAttestation, adminListAttestations, adminSaveAttestation } from "@/lib/api";
import type { Attestation, AttestationItem, AttestationItemKind, AttestationStage, AttestationSummary } from "@/types/attestations";
import { ATTESTATION_TYPE_LABELS } from "@/types/attestations";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { clearDraft, readDraft, saveDraft, useUnsavedChanges } from "@/lib/unsaved-changes";
import { describeApiError } from "@/lib/errors";
import { newAttestation, newItem, uid } from "@/components/admin/attestations/model";

export type AttestationEditorState = ReturnType<typeof useAttestationEditor>;

export function useAttestationEditor() {
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
  // Эффект ниже следит только за сменой аттестации, а не за каждым нажатием
  // клавиши: сравниваем примитивы вместо самого объекта draft.
  const hasDraft = Boolean(draft);
  const draftSlug = draft?.slug;
  const draftSubjectSlug = draft?.subject_slug;
  const editorDirty = Boolean(draft) && editorBaseline !== null && JSON.stringify(draft) !== editorBaseline;
  useUnsavedChanges(editorDirty);

  // Черновик формы переживает перезагрузку: этап и материалы можно набирать долго.
  useEffect(() => {
    if (!editorDirty || !draft) return;
    const timer = setTimeout(() => saveDraft(attestationDraftKey, { item: draft, isNew }), 800);
    return () => clearTimeout(timer);
  }, [editorDirty, draft, isNew, attestationDraftKey]);

  useEffect(() => {
    if (!hasDraft) {
      setDraftOffer(null);
      return;
    }
    const stored = readDraft<{ item: Attestation; isNew: boolean }>(attestationDraftKey);
    setDraftOffer(stored?.data?.item ? { savedAt: stored.savedAt, data: stored.data } : null);
  }, [attestationDraftKey, hasDraft, draftSlug, draftSubjectSlug]);
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

  return {
    confirm,
    dialog,
    items,
    loading,
    listError,
    query,
    setQuery,
    draft,
    setDraft,
    setEditorBaseline,
    isNew,
    setIsNew,
    saving,
    notice,
    setNotice,
    draftOffer,
    setDraftOffer,
    attestationDraftKey,
    filtered,
    load,
    openExisting,
    startNew,
    patch,
    addStage,
    updateStage,
    removeStage,
    moveStage,
    updateItem,
    addItem,
    removeItem,
    moveItem,
    save,
    remove,
    totalItems,
  };
}
