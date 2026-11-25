"use client";

/**
 * «Свои препараты»: личные карточки микропрепаратов внутри практики предмета.
 *
 * Карточка — название, орган/ткань, окраска, описание и фото (загрузка в
 * `/files/upload` либо ссылка на картинку). Строки живут в
 * `public.user_preparations` под RLS владельца, поэтому они не попадают в общий
 * атлас; тренировка по своим снимкам идёт здесь же — без перехода на другую
 * страницу.
 */
/* eslint-disable @next/next/no-img-element -- фото приходят по подписанным ссылкам без известных размеров */
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { uploadFile } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import {
  createMyPreparation,
  deleteMyPreparation,
  listMyPreparations,
  type MyPreparation,
} from "@/lib/content-api";

const MAX_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type Draft = { name: string; organ: string; stain: string; description: string; image_url: string };

const EMPTY: Draft = { name: "", organ: "", stain: "", description: "", image_url: "" };

export default function MyPreparations({ subjectSlug = "histology" }: { subjectSlug?: string }) {
  const [items, setItems] = useState<MyPreparation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [study, setStudy] = useState<{ queue: string[]; index: number; open: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listMyPreparations(subjectSlug);
    setLoading(false);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setError(null);
    setItems(result.data.items || []);
  }, [subjectSlug]);

  useEffect(() => { void load(); }, [load]);

  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));

  async function add() {
    if (saving) return;
    const name = draft.name.trim();
    if (name.length < 2) {
      setError("Введите название препарата — хотя бы два символа.");
      return;
    }
    setError(null);
    setNotice(null);
    setSaving(true);

    let fileId: string | null = null;
    const file = fileRef.current?.files?.[0] ?? null;
    if (file) {
      if (file.size > MAX_BYTES) {
        setSaving(false);
        setError("Фото больше 12 МБ — сервер такой не примет.");
        return;
      }
      if (file.type && !IMAGE_TYPES.has(file.type)) {
        setSaving(false);
        setError("Нужно фото: JPEG, PNG, WebP или GIF.");
        return;
      }
      const uploaded = await uploadFile(file);
      const created = uploaded.ok ? (uploaded.data?.file as { id?: string } | undefined) : undefined;
      if (!uploaded.ok || !created?.id) {
        setSaving(false);
        setError(uploaded.ok ? "Фото не сохранилось в хранилище." : describeApiError(uploaded.error));
        return;
      }
      fileId = String(created.id);
    }

    const result = await createMyPreparation({
      name,
      organ: draft.organ,
      stain: draft.stain,
      description: draft.description,
      image_url: draft.image_url,
      file_id: fileId,
      subject_slug: subjectSlug,
    });
    setSaving(false);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setDraft(EMPTY);
    if (fileRef.current) fileRef.current.value = "";
    setFormOpen(false);
    setNotice("Препарат сохранён — он ниже, в вашем списке.");
    await load();
  }

  async function remove(item: MyPreparation) {
    setBusyId(item.id);
    setError(null);
    const result = await deleteMyPreparation(item.id);
    setBusyId(null);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setItems((current) => current.filter((row) => row.id !== item.id));
    setNotice(`«${item.name}» удалён.`);
  }

  const current = study ? items.find((item) => item.id === study.queue[study.index]) ?? null : null;

  function startStudy() {
    const queue = items.map((item) => item.id);
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    setStudy({ queue, index: 0, open: false });
  }

  return (
    <section id="my-preparations" className="scroll-mt-24 space-y-4 sm:scroll-mt-28">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-extrabold">
            <ImagePlus className="h-4 w-4 text-indigo-600" /> Свои препараты
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Добавьте свои снимки с микроскопа: название, орган, окраска, описание. Они хранятся только у вас и
            не попадают в общий атлас.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.length ? (
            <button type="button" onClick={startStudy} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">
              <Eye className="h-4 w-4" /> Тренировка ({items.length})
            </button>
          ) : null}
          <button type="button" onClick={() => setFormOpen((open) => !open)} className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white">
            {formOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {formOpen ? "Свернуть" : "Добавить"}
          </button>
        </div>
      </div>

      {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-[var(--primary-soft)] px-4 py-3 text-sm">{notice}</p> : null}

      {formOpen ? (
        <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2">
          <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Название препарата *" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
          <input value={draft.organ} onChange={(e) => patch({ organ: e.target.value })} placeholder="Орган или ткань" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
          <input value={draft.stain} onChange={(e) => patch({ stain: e.target.value })} placeholder="Окраска (гематоксилин-эозин…)" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
          <input value={draft.image_url} onChange={(e) => patch({ image_url: e.target.value })} placeholder="Ссылка на фото (https://…)" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
          <textarea value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Что видно: слои, структуры, признаки" rows={3} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm sm:col-span-2" />
          <div className="sm:col-span-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary)] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" />
            <p className="mt-1 text-[11px] text-[var(--muted)]">Фото до 12 МБ. Можно указать ссылку вместо загрузки.</p>
          </div>
          <button type="button" onClick={() => void add()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {saving ? "Сохраняем…" : "Сохранить препарат"}
          </button>
        </div>
      ) : null}

      {study && current ? (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-indigo-700">Тренировка · {study.index + 1} из {study.queue.length}</p>
            <button type="button" onClick={() => setStudy(null)} className="text-xs font-semibold text-[var(--muted)]">Закрыть</button>
          </div>
          {current.image ? <img src={current.image} alt={study.open ? current.name : "Свой препарат"} className="mt-3 max-h-[420px] w-full rounded-xl object-contain" /> : <p className="mt-3 rounded-xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">У этой карточки нет фото.</p>}
          {study.open ? (
            <div className="mt-3 space-y-1 text-sm">
              <p className="text-lg font-extrabold">{current.name}</p>
              <p className="text-[var(--muted)]">{[current.organ, current.stain].filter(Boolean).join(" · ") || "—"}</p>
              {current.description ? <p className="whitespace-pre-line">{current.description}</p> : null}
            </div>
          ) : (
            <button type="button" onClick={() => setStudy({ ...study, open: true })} className="mt-3 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold">Показать ответ</button>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={study.index >= study.queue.length - 1} onClick={() => setStudy({ ...study, index: study.index + 1, open: false })} className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Следующий</button>
            <button type="button" onClick={startStudy} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold">Заново</button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Загружаем ваши препараты…</p>
      ) : items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              {item.image ? <img src={item.image} alt={item.name} className="h-40 w-full object-cover" /> : <div className="flex h-40 items-center justify-center bg-slate-50 text-xs text-[var(--muted)]">Без фото</div>}
              <div className="space-y-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold">{item.name}</p>
                  <button type="button" onClick={() => void remove(item)} disabled={busyId === item.id} aria-label={`Удалить ${item.name}`} className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--muted)] hover:border-red-300 hover:text-red-600 disabled:opacity-40">
                    {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="text-xs text-[var(--muted)]">{[item.organ, item.stain].filter(Boolean).join(" · ") || "—"}</p>
                {item.description ? <p className="line-clamp-3 text-xs leading-5 text-slate-600">{item.description}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
          Пока пусто. Нажмите «Добавить», чтобы сохранить первый свой снимок с подписью.
        </p>
      )}
    </section>
  );
}
