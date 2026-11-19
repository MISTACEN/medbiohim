"use client";

/** Лента тренажёра: загрузка карточек, выбор препаратов, проход и ответы. */
import { useEffect, useMemo, useState } from "react";
import { answerTrainerCard, getTrainerFeed, hasToken, type TrainerFeedCard } from "@/lib/api";
import { compareLessons, isElectronogramCard, lessonKeyOf } from "@/lib/histologyOrder";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";
import { sortCardsByPlan, type PickFilter } from "@/components/trainers/model";

export function useTrainerFeedPage(params: Promise<{ subject: string }>) {
  const [queue, setQueue] = useState<TrainerFeedCard[] | null>(null); // null = экран выбора
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [pickFilter, setPickFilter] = useState<PickFilter>("all");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  // Зависимость намеренная: переход к следующей карточке должен начинать
  // отсчёт заново, хотя сам Date.now() аргумент не читает.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startedAt = useMemo(() => Date.now(), [index]);

  const { data: feed, loading } = useApiRequest<{ slug: string; cards: TrainerFeedCard[]; note: string | null }>(async () => {
    const p = await params;
    const slug = p.subject || "histology";
    if (!hasToken()) return { slug, cards: [], note: "Войдите, чтобы проходить тренажёр." };
    const r = await getTrainerFeed(slug, "mbh", 500, 0);
    if (!r.ok) return { slug, cards: [], note: describeApiError(r.error) };
    return { slug, cards: slug === "histology" ? sortCardsByPlan(r.data.items || []) : (r.data.items || []), note: null };
  }, [params]);

  const subject = feed?.slug ?? "histology";
  const allCards = useMemo(() => feed?.cards ?? [], [feed]);
  const note = actionNote ?? feed?.note ?? null;

  const card = queue ? queue[index] : undefined;

  // Глубокая ссылка из поиска: /trainers/feed/histology?card=<id> сразу
  // открывает конкретный препарат, а не экран выбора.
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (deepLinked || !allCards.length) return;
    const id = new URLSearchParams(window.location.search).get("card");
    setDeepLinked(true);
    if (!id) return;
    const target = allCards.findIndex((item) => item.id === id);
    if (target < 0) {
      setActionNote("Препарат из ссылки не найден в текущем банке — выберите карточку вручную.");
      return;
    }
    setQueue(allCards);
    setIndex(target);
    setSelected(null);
    setResult(null);
  }, [allCards, deepLinked]);

  const answered = result !== null;

  // --- выбор карточек ---
  const prepCount = useMemo(() => allCards.filter((c) => !isElectronogramCard(c)).length, [allCards]);
  const emCount = allCards.length - prepCount;
  const pickedCount = useMemo(() => allCards.reduce((n, c) => n + (picked[c.id] ? 1 : 0), 0), [allCards, picked]);

  const pickerGroups = useMemo(() => {
    const visible = allCards.filter((c) =>
      pickFilter === "all" ? true : pickFilter === "electronogram" ? isElectronogramCard(c) : !isElectronogramCard(c));
    const map = new Map<string, TrainerFeedCard[]>();
    for (const c of visible) {
      const key = lessonKeyOf(c);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries())
      .sort((a, b) => compareLessons(a[0], b[0]))
      .map(([title, items]) => ({ title, items: sortCardsByPlan(items) }));
  }, [allCards, pickFilter]);

  const toggleCard = (id: string) =>
    setPicked((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; return n; });

  const toggleGroup = (items: TrainerFeedCard[]) =>
    setPicked((p) => {
      const n = { ...p };
      const allOn = items.every((c) => n[c.id]);
      for (const c of items) { if (allOn) delete n[c.id]; else n[c.id] = true; }
      return n;
    });

  function startRun(cards: TrainerFeedCard[]) {
    if (!cards.length) return;
    setQueue(cards);
    setIndex(0);
    setSelected(null);
    setResult(null);
  }
  const startPicked = () => startRun(sortCardsByPlan(allCards.filter((c) => picked[c.id])));
  const startAll = () => startRun(sortCardsByPlan(allCards));
  const backToPicker = () => { setQueue(null); setIndex(0); setSelected(null); setResult(null); };
  const restartRun = () => { setIndex(0); setSelected(null); setResult(null); };

  async function choose(optionId: string) {
    if (!card || busy || result !== null) return;
    setSelected(optionId);
    setBusy(true);
    const r = await answerTrainerCard({ card_id: card.id, option_id: optionId, time_ms: Date.now() - startedAt });
    if (r.ok) setResult(r.data.correct); else setActionNote(describeApiError(r.error));
    setBusy(false);
  }

  async function skip() {
    if (!card || busy || result !== null) return;
    setBusy(true);
    const r = await answerTrainerCard({ card_id: card.id, is_skipped: true, time_ms: Date.now() - startedAt });
    if (!r.ok) setActionNote(describeApiError(r.error));
    next();
    setBusy(false);
  }

  function next() {
    if (!queue) return;
    setIndex((i) => (i + 1) % Math.max(queue.length, 1));
    setSelected(null);
    setResult(null);
  }

  return {
    queue,
    picked,
    pickFilter,
    setPickFilter,
    index,
    selected,
    result,
    busy,
    note,
    subject,
    allCards,
    loading,
    card,
    answered,
    prepCount,
    emCount,
    pickedCount,
    pickerGroups,
    toggleCard,
    toggleGroup,
    startPicked,
    startAll,
    backToPicker,
    restartRun,
    choose,
    skip,
    next,
  };
}

export type TrainerFeedPageState = ReturnType<typeof useTrainerFeedPage>;
