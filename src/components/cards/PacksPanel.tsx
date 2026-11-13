"use client";

/**
 * Паки карточек (Quizlet-стиль): свои колоды, создание вручную и ИИ-генерация
 * по лекциям предмета, публикация в мастерскую и сессия «знаю / не знаю».
 *
 * Сессия: flip-карточка → «Показать ответ» → ✕ «не знаю» (вернётся в конец
 * очереди, SM-2 review) / ✓ «знаю» (SM-2 Good). Прогресс N/M — как в мастерской
 * Quizlet: ответы «не знаю» возвращают карточку, пока все не будут отвечены.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download, Layers, Loader2, Plus, Sparkles, Trash2, X, Check,
} from "lucide-react";
import {
  cardPacksMine, cardPacksShared, cardPack, cardPackCreate, cardPackPatch, cardPackDelete, cardPackAiGenerate, cardPackImport,
  type CardPack, type CardPackItem, type CardPackAiDraft,
} from "@/lib/features-api";
import { describeApiError } from "@/lib/errors";

type PackDraftItem = { front: string; back: string; source?: string };

/** Очередь сессии: неизвестные возвращаются в конец (Quizlet-повторение). */
function advance(queue: CardPackItem[], idx: number, known: boolean): { queue: CardPackItem[]; idx: number; finished: boolean } {
  if (known) {
    const next = queue.filter((_, i) => i !== idx);
    return { queue: next, idx: next.length ? Math.min(idx, next.length - 1) : 0, finished: next.length === 0 };
  }
  // «Не знаю»: карточка уходит в конец очереди и будет показана снова.
  const item = queue[idx];
  const rest = [...queue.slice(0, idx), ...queue.slice(idx + 1), item];
  return { queue: rest, idx: Math.min(idx, rest.length - 1), finished: false };
}

export function PacksPanel() {
  const [packs, setPacks] = useState<CardPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Состояние сессии по паку.
  const [sessionPack, setSessionPack] = useState<{ pack: CardPack; items: CardPackItem[] } | null>(null);
  const [queue, setQueue] = useState<CardPackItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [sessionBusy, setSessionBusy] = useState(false);

  // Создание пака.
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [draftItems, setDraftItems] = useState<PackDraftItem[]>([{ front: "", back: "" }]);
  const [aiTopic, setAiTopic] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await cardPacksMine();
    setLoading(false);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    setPacks(response.data.items || []);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const draftValid = useMemo(
    () => title.trim().length > 0 && draftItems.some((item) => item.front.trim()),
    [title, draftItems],
  );

  async function openSession(packId: string) {
    setError(null);
    const response = await cardPack(packId);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    const items = (response.data.items || []).map((item) => ({ id: item.id, front: item.front, back: item.back, order_index: item.order_index }));
    if (!items.length) {
      setError("В паке нет карточек");
      return;
    }
    setSessionPack({ pack: response.data.pack, items });
    setQueue(items);
    setIdx(0);
    setFlipped(false);
    setAnswered(0);
  }

  function answer(known: boolean) {
    if (!sessionPack || sessionBusy) return;
    // Пункты пака не привязаны к банку вопросов, поэтому сессия — очередь
    // с повторением «не знаю» в конце (Quizlet-режим), без SM-2 расписания.
    setSessionBusy(true);
    const { queue: nextQueue, idx: nextIdx, finished } = advance(queue, idx, known);
    setAnswered((n) => n + 1);
    setFlipped(false);
    setQueue(nextQueue);
    setIdx(nextIdx);
    setSessionBusy(false);
    if (finished) setSessionPack((current) => (current ? { ...current, items: [] } : current));
  }

  async function generateAi() {
    if (!aiTopic.trim() || !subjectSlug) {
      setAiNote("Укажите предмет и тему — ИИ соберёт определения из лекций предмета.");
      return;
    }
    setAiBusy(true);
    setAiNote(null);
    const response = await cardPackAiGenerate({ topic: aiTopic.trim(), subject_slug: subjectSlug });
    setAiBusy(false);
    if (!response.ok) {
      setAiNote(describeApiError(response.error));
      return;
    }
    const draft: CardPackAiDraft = response.data;
    const generated = draft.cards.map((card) => ({ front: card.front, back: card.back, source: card.source }));
    if (!generated.length) {
      setAiNote("ИИ не нашёл в лекциях материала по этой теме — попробуйте другую тему.");
      return;
    }
    setDraftItems(generated);
    if (!title.trim()) setTitle(`Пак: ${aiTopic.trim()}`);
    setAiNote(`ИИ собрал ${generated.length} карточек из лекций. Проверьте и сохраните.`);
  }

  async function savePack(publish: boolean) {
    if (!draftValid || saveBusy) return;
    setSaveBusy(true);
    setError(null);
    const items = draftItems
      .filter((item) => item.front.trim())
      .map((item) => ({ front: item.front.trim(), back: item.back.trim() }));
    const response = await cardPackCreate({
      title: title.trim(),
      description: description.trim(),
      subject_slug: subjectSlug || null,
      source: draftItems.some((item) => item.source) ? "ai" : "user",
      is_published: publish,
      items,
    });
    setSaveBusy(false);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    setCreating(false);
    setTitle(""); setDescription(""); setSubjectSlug(""); setAiTopic(""); setAiNote(null);
    setDraftItems([{ front: "", back: "" }]);
    await reload();
  }

  async function togglePublish(pack: CardPack) {
    setPublishingId(pack.id);
    const response = await cardPackPatch(pack.id, { is_published: !pack.is_published });
    setPublishingId(null);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    await reload();
  }

  async function removePack(pack: CardPack) {
    const response = await cardPackDelete(pack.id);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    await reload();
  }

  // ── Сессия по паку ────────────────────────────────────────────────────────
  if (sessionPack) {
    const card = queue[idx] || null;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setSessionPack(null)} className="text-sm font-semibold text-[var(--muted)]">← К пакам</button>
          <span className="text-xs text-[var(--muted)]">
            {card ? `${idx + 1} / ${queue.length}` : `Сессия завершена · ответов: ${answered}`}
          </span>
        </div>
        {card ? (
          <>
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="min-h-[240px] w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-left shadow-sm"
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                {flipped ? "Ответ" : "Вопрос"} · {sessionPack.pack.title}
              </div>
              <div className="whitespace-pre-wrap text-base leading-relaxed">{flipped ? card.back || "—" : card.front}</div>
            </button>
            {!flipped ? (
              <button
                type="button"
                onClick={() => setFlipped(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] py-3 text-sm font-semibold"
              >
                Показать ответ
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={sessionBusy}
                  onClick={() => answer(false)}
                  className="flex min-h-14 items-center justify-center gap-2 rounded-full border-2 border-[var(--status-critical-fg)]/40 bg-[var(--status-critical-bg)] text-xl font-bold text-[var(--status-critical-fg)] transition active:scale-95"
                  aria-label="Не знаю"
                >
                  <X className="h-6 w-6" /> Не знаю
                </button>
                <button
                  type="button"
                  disabled={sessionBusy}
                  onClick={() => answer(true)}
                  className="flex min-h-14 items-center justify-center gap-2 rounded-full border-2 border-[var(--status-ok-fg)]/40 bg-[var(--status-ok-bg)] text-xl font-bold text-[var(--status-ok-fg)] transition active:scale-95"
                  aria-label="Знаю"
                >
                  <Check className="h-6 w-6" /> Знаю
                </button>
              </div>
            )}
            <p className="text-center text-xs text-[var(--muted)]">
              Ответов: {answered} · осталось в очереди: {queue.length} · «не знаю» вернёт карточку в конец очереди
            </p>
          </>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-10 text-center">
            <Check className="mx-auto h-10 w-10 text-[var(--status-ok-fg)]" />
            <p className="mt-3 font-semibold">Пак пройден: {answered} ответов</p>
            <button type="button" onClick={() => setSessionPack(null)} className="btn-primary mt-4">К списку паков</button>
          </div>
        )}
      </div>
    );
  }

  // ── Список паков + создание ──────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted)]">
          Свои паки: создайте вручную или попросите ИИ собрать определения дословно из лекций предмета.
        </p>
        <button type="button" onClick={() => setCreating((c) => !c)} className="btn-primary inline-flex items-center gap-2">
          <Plus className="h-4 w-4" /> Новый пак
        </button>
      </div>

      {error ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {creating ? (
        <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название пака" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
            <input value={subjectSlug} onChange={(e) => setSubjectSlug(e.target.value)} placeholder="Предмет (slug), напр. histology" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
          </div>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание (необязательно)" className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />

          <div className="rounded-xl border border-dashed border-[var(--primary)]/40 bg-[var(--primary-soft)]/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--primary)]" />
              <input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="Тема для ИИ: «что такое энтальпия» и т.п."
                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              />
              <button type="button" onClick={() => void generateAi()} disabled={aiBusy} className="btn-primary inline-flex items-center gap-2 text-sm">
                {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Собрать из лекций
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              ИИ берёт определения дословно из лекций выбранного предмета и помечает источник. Ничего не выдумывает.
            </p>
            {aiNote ? <p className="mt-2 text-xs text-[var(--primary)]">{aiNote}</p> : null}
          </div>

          <div className="space-y-2">
            {draftItems.map((item, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-[var(--border)] p-2 sm:grid-cols-[1fr_1fr_auto]">
                <textarea
                  value={item.front}
                  onChange={(e) => setDraftItems((current) => current.map((it, i) => (i === index ? { ...it, front: e.target.value } : it)))}
                  placeholder="Вопрос / термин"
                  className="min-h-16 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                <textarea
                  value={item.back}
                  onChange={(e) => setDraftItems((current) => current.map((it, i) => (i === index ? { ...it, back: e.target.value } : it)))}
                  placeholder="Ответ / определение"
                  className="min-h-16 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setDraftItems((current) => current.filter((_, i) => i !== index))}
                  disabled={draftItems.length === 1}
                  className="h-10 rounded-lg p-2 text-slate-400 hover:text-red-600 disabled:opacity-30"
                  aria-label="Удалить карточку"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDraftItems((current) => [...current, { front: "", back: "" }])}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            >
              + карточка
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void savePack(false)} disabled={saveBusy || !draftValid} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40">
              {saveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />} Сохранить пак
            </button>
            <button type="button" onClick={() => void savePack(true)} disabled={saveBusy || !draftValid} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold">
              Сохранить и выложить в мастерскую
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="inline-flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Загружаем паки…</p>
      ) : packs.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <Layers className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-semibold">Паков пока нет</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Создайте первый: вручную или из лекций через ИИ.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {packs.map((pack) => (
            <div key={pack.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <b className="block truncate">{pack.title}</b>
                  <span className="text-xs text-[var(--muted)]">
                    {pack.card_count} карточек{pack.subject_slug ? ` · ${pack.subject_slug}` : ""}
                    {pack.source === "ai" ? " · из лекций (ИИ)" : ""}
                    {pack.is_published ? " · в мастерской" : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void togglePublish(pack)}
                    disabled={publishingId === pack.id}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold"
                    title={pack.is_published ? "Убрать из мастерской" : "Выложить в мастерскую"}
                  >
                    {pack.is_published ? "Снять" : "Выложить"}
                  </button>
                  <button type="button" onClick={() => void removePack(pack)} className="rounded-lg p-2 text-slate-400 hover:text-red-600" aria-label="Удалить пак">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {pack.description ? <p className="mt-1.5 line-clamp-2 text-sm text-[var(--muted)]">{pack.description}</p> : null}
              <button type="button" onClick={() => void openSession(pack.id)} className="btn-primary mt-3 w-full">
                Повторять ({pack.card_count})
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Мастерская: опубликованные паки других студентов, импорт к себе. */
export function SharedPacksPanel() {
  const [packs, setPacks] = useState<CardPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);

  async function importPack(pack: CardPack) {
    setImportingId(pack.id);
    setError(null);
    const response = await cardPackImport(pack.id);
    setImportingId(null);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    setImported(pack.title);
  }

  useEffect(() => {
    let cancelled = false;
    void cardPacksShared().then((response) => {
      if (cancelled) return;
      if (response.ok) setPacks(response.data?.items || []);
      else setError(describeApiError(response.error));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p className="inline-flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Загружаем мастерскую…</p>;

  return (
    <div className="space-y-3">
      {error ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {imported ? <div className="rounded-xl bg-[var(--status-ok-bg)] px-4 py-3 text-sm text-[var(--status-ok-fg)]">Пак «{imported}» скопирован к вам — смотрите во вкладке «Мои паки».</div> : null}
      {packs.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <Download className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-semibold">Опубликованных паков пока нет</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Выложите свой пак — он появится здесь у всей группы.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {packs.map((pack) => (
            <div key={pack.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
              <b className="block truncate">{pack.title}</b>
              <span className="text-xs text-[var(--muted)]">
                {pack.card_count} карточек{pack.subject_slug ? ` · ${pack.subject_slug}` : ""}
                {pack.owner_name ? ` · автор: ${pack.owner_name}` : ""}
                {pack.source === "ai" ? " · из лекций (ИИ)" : ""}
              </span>
              {pack.description ? <p className="mt-1.5 line-clamp-2 text-sm text-[var(--muted)]">{pack.description}</p> : null}
              <button type="button" onClick={() => void importPack(pack)} disabled={importingId === pack.id} className="btn-primary mt-3 inline-flex w-full items-center justify-center gap-2">
                {importingId === pack.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Скачать к себе
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
