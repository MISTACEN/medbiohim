"use client";

/**
 * Блок 1 бэклога: «Сделать тестом» — конвертация элемента Workshop
 * (kind=test_questions) в банк вопросов с ручной сверкой (Pass 26A).
 *
 * Предпросмотр-таблица: текст, варианты (строка = вариант, флажок = верный),
 * картинка варианта — выбор из файлов исходного элемента. Публикация пишет
 * questions с provenance (source='workshop', source_item_id).
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import {
  adminWorkshopQuestionDraft,
  adminWorkshopQuestionConvert,
  adminWorkshopQuestionReject,
  listSubjects,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";

type Draft = { text: string; topic: string | null; options: Array<{ label: string; correct: boolean; image_file_id: string | null }> };
type DraftResponse = {
  item?: { id: string; title: string; status: string; conversion_status?: string; conversion_note?: string | null };
  files?: Array<{ id: string; name: string; mime: string }>;
  drafts?: Array<{ text: string; topic: string | null }>;
};

function ConvertInner() {
  const params = useSearchParams();
  const itemId = params.get("item") || "";
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [questions, setQuestions] = useState<Draft[]>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name?: string }>>([]);
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  useEffect(() => {
    if (!itemId) return;
    void (async () => {
      try {
        const [d, s] = await Promise.all([adminWorkshopQuestionDraft(itemId), listSubjects()]);
        if (d.ok) {
          setDraft(d.data as DraftResponse);
          const seeded: Draft[] = ((d.data as DraftResponse).drafts || []).map((x) => ({
            text: x.text,
            topic: x.topic,
            options: [{ label: "", correct: true, image_file_id: null }, { label: "", correct: false, image_file_id: null }],
          }));
          setQuestions(seeded);
        } else setError(describeApiError(d.error));
        if (s.ok) setSubjects(s.data?.items || s.data || []);
      } catch (e) {
        setError("Не удалось загрузить черновик.");
      }
    })();
  }, [itemId]);

  function updateQuestion(index: number, patch: Partial<Draft>) {
    setQuestions((current) => current.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }
  function updateOption(qi: number, oi: number, patch: Partial<Draft["options"][number]>) {
    setQuestions((current) => current.map((q, i) => (i === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : q)));
  }

  async function publish() {
    if (!subjectId) { setError("Выберите предмет — привязка обязательна."); return; }
    setBusy(true); setError(null); setNote(null);
    const result = await adminWorkshopQuestionConvert(itemId, {
      subject_id: subjectId,
      ...(topicId ? { topic_id: topicId } : {}),
      questions,
    });
    setBusy(false);
    if (!result.ok) {
      const details = result.error?.details?.errors;
      setError(details?.length
        ? details.map((x: { index: number; message: string }) => `Вопрос ${x.index + 1}: ${x.message}`).join("; ")
        : describeApiError(result.error));
      return;
    }
    setNote(`Опубликовано ${(result.data as { published?: number }).published ?? questions.length} вопросов. Теперь они в банке предмета.`);
  }

  async function reject() {
    if (!rejectNote.trim()) { setError("Укажите причину отклонения."); return; }
    setBusy(true); setError(null); setNote(null);
    const result = await adminWorkshopQuestionReject(itemId, rejectNote.trim());
    setBusy(false);
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote("Конвертация отклонена: элемент остался в Workshop с вашим пояснением.");
  }

  if (!itemId) {
    return (
      <div className="card p-6 text-center">
        <p>Не указан элемент: откройте страницу из админки Workshop (кнопка «Сделать тестом»).</p>
        <Link href="/admin/workshop" className="btn-primary mt-4 inline-flex">К Workshop</Link>
      </div>
    );
  }

  const files = draft?.files || [];

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-sm font-bold text-slate-900">{draft?.item?.title || "Загрузка…"}</p>
        {draft?.item?.conversion_status && draft.item.conversion_status !== "none" && (
          <p className="mt-1 text-xs text-slate-500">
            Статус конвертации: {draft.item.conversion_status === "published" ? "уже опубликовано" : draft.item.conversion_status === "rejected" ? `отклонено (${draft.item.conversion_note || "без пояснения"})` : draft.item.conversion_status}
          </p>
        )}
      </div>

      {error && <div className="rounded-xl bg-[var(--status-critical-bg)] px-3 py-2 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      {note && <div className="rounded-xl bg-[var(--status-ok-bg)] px-3 py-2 text-sm text-[var(--status-ok-fg)]">{note}</div>}

      <div className="card p-4 space-y-4">
        <p className="text-sm font-semibold text-slate-800">Привязка (обязательна)</p>
        <div className="flex flex-wrap gap-3">
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="">Предмет…</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
          </select>
          <input value={topicId} onChange={(e) => setTopicId(e.target.value)} placeholder="topic_id (необязательно, UUID)" className="rounded-xl border px-3 py-2 text-sm" />
        </div>
      </div>

      {questions.map((question, qi) => (
        <div key={qi} className="card space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-slate-400">Вопрос {qi + 1}</p>
            <button type="button" onClick={() => setQuestions((c) => c.filter((_, i) => i !== qi))} className="text-slate-400 hover:text-[var(--status-critical-fg)]" aria-label="Удалить вопрос">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <textarea value={question.text} onChange={(e) => updateQuestion(qi, { text: e.target.value })} rows={2} className="w-full rounded-xl border px-3 py-2 text-sm" />
          <div className="space-y-2">
            {question.options.map((option, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input type="checkbox" checked={option.correct} onChange={(e) => updateOption(qi, oi, { correct: e.target.checked })} aria-label="Верный вариант" />
                <input value={option.label} onChange={(e) => updateOption(qi, oi, { label: e.target.value })} placeholder="Вариант (можно пусто — только картинка)" className="flex-1 rounded-xl border px-3 py-1.5 text-sm" />
                <select value={option.image_file_id || ""} onChange={(e) => updateOption(qi, oi, { image_file_id: e.target.value || null })} className="rounded-xl border px-2 py-1.5 text-xs" aria-label="Картинка варианта">
                  <option value="">без картинки</option>
                  {files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            ))}
            <button type="button" onClick={() => updateQuestion(qi, { options: [...question.options, { label: "", correct: false, image_file_id: null }] })} className="text-xs font-semibold text-indigo-600 hover:underline">
              + вариант
            </button>
          </div>
        </div>
      ))}

      {questions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void publish()} disabled={busy} className="btn-primary inline-flex items-center gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Опубликовать в банк ({questions.length})
          </button>
          <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Причина отклонения…" className="rounded-xl border px-3 py-2 text-sm" />
          <button type="button" onClick={() => void reject()} disabled={busy || !rejectNote.trim()} className="rounded-xl border px-3 py-2 text-sm">
            Отклонить конвертацию
          </button>
        </div>
      )}

      {draft && questions.length === 0 && <p className="card p-4 text-sm text-slate-500">Черновики не найдены — в элементе нет вопросов и нумерованных строк OCR.</p>}
    </div>
  );
}

export default function WorkshopConvertPage() {
  return (
    <Suspense fallback={<div className="card p-6"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
      <ConvertInner />
    </Suspense>
  );
}
