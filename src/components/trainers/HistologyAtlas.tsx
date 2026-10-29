"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { GraduationCap, Loader2, Maximize2, Microscope, Search, X } from "lucide-react";
import { listTrainerFeed } from "@/lib/content-api";
import { describeApiError } from "@/lib/errors";
import { AtlasThumb, topicLabel } from "@/components/trainers/HistologyTrainerParts";
import { TrainerImageViewer } from "@/components/trainers/TrainerImageViewer";
import { lessonKeyOf } from "@/lib/histologyOrder";
import {
  atlasCardName,
  atlasStats,
  flattenAtlasGroups,
  groupAtlasCards,
  type AtlasCard,
  type AtlasKind,
  type AtlasSort,
} from "@/lib/histologyAtlas";

export type AtlasTrainSelection = { ids: string[]; lesson: string; kind: AtlasKind };

type Props = {
  /** Готовые карточки банка. Если не переданы — компонент загрузит их сам. */
  cards?: AtlasCard[];
  /** Внешняя загрузка ещё идёт (карточки передаёт тренажёр). */
  loading?: boolean;
  /** Компактный режим для боковой панели внутри тренажёра. */
  compact?: boolean;
  initialKind?: AtlasKind;
  initialLesson?: string;
  /** Карточка из ссылки (?card=…) — сразу открываем её в просмотрщике. */
  focusCardId?: string;
  /** Кнопка «Тренировать»: отдаёт выбранные карточки и текущую тему. */
  onTrain?: (selection: AtlasTrainSelection) => void;
  onClose?: () => void;
  showAtlasLink?: boolean;
};

const KIND_TABS: Array<[AtlasKind, string]> = [
  ["preparation", "Микропрепараты"],
  ["electronogram", "Электронограммы"],
  ["all", "Всё"],
];

function captionsOf(card: AtlasCard): string[] {
  const captions = card.preparation?.captions;
  return Array.isArray(captions) ? captions.map(String).filter(Boolean) : [];
}

export function HistologyAtlas({
  cards,
  loading: externalLoading = false,
  compact = false,
  initialKind = "preparation",
  initialLesson = "",
  focusCardId,
  onTrain,
  onClose,
  showAtlasLink = true,
}: Props) {
  const [fetched, setFetched] = useState<AtlasCard[]>([]);
  const [fetching, setFetching] = useState(cards === undefined);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<AtlasKind>(initialKind);
  const [lesson, setLesson] = useState(initialLesson);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AtlasSort>("plan");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const focusedRef = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (cards !== undefined) return;
    let alive = true;
    setFetching(true);
    listTrainerFeed("histology", "mbh", 500)
      .then((result) => {
        if (!alive) return;
        if (result.ok) setFetched(result.data.items || []);
        else setError(describeApiError(result.error) || "Не удалось загрузить атлас.");
      })
      .catch(() => {
        if (alive) setError("Не удалось загрузить атлас.");
      })
      .finally(() => {
        if (alive) setFetching(false);
      });
    return () => {
      alive = false;
    };
  }, [cards]);

  const all = cards ?? fetched;
  const stats = useMemo(() => atlasStats(all), [all]);

  const lessons = useMemo(
    () => groupAtlasCards(all, { kind, query, singleElectronogramBlock: false }),
    [all, kind, query],
  );

  const groups = useMemo(
    () => groupAtlasCards(all, { kind, lesson, query, sort }),
    [all, kind, lesson, query, sort],
  );
  const visible = useMemo(() => flattenAtlasGroups(groups), [groups]);
  const visibleIds = useMemo(
    () => visible.map((card) => String(card.id || "")).filter(Boolean),
    [visible],
  );

  // Ссылка ?card=<id> должна открывать именно этот препарат, даже если он в
  // другой вкладке (электронограмма) или под фильтром темы.
  useEffect(() => {
    if (!focusCardId || focusedRef.current || !all.length) return;
    const target = all.find((card) => String(card.id || "") === focusCardId);
    if (!target) return;
    focusedRef.current = true;
    setKind("all");
    setLesson("");
    setQuery("");
    setViewerId(focusCardId);
  }, [all, focusCardId]);

  const viewerIndex = viewerId ? visible.findIndex((card) => String(card.id || "") === viewerId) : -1;
  const viewerCard = viewerIndex >= 0 ? visible[viewerIndex] : null;

  function step(direction: -1 | 1) {
    if (viewerIndex < 0 || visible.length < 2) return;
    const next = (viewerIndex + direction + visible.length) % visible.length;
    const id = String(visible[next].id || "");
    if (id) setViewerId(id);
  }

  function openFirst() {
    const first = String(visible[0]?.id || "");
    if (first) setViewerId(first);
  }

  useEffect(() => {
    if (!viewerCard) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function resetFilters() {
    setKind("preparation");
    setLesson("");
    setQuery("");
    setSort("plan");
  }

  if (externalLoading || fetching) {
    return (
      <div className="card flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Загружаем атлас микропрепаратов…
      </div>
    );
  }

  const filtersActive = Boolean(lesson || query || kind !== "preparation");

  return (
    <section className="space-y-4">
      <div className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Microscope className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {compact ? "Атлас под рукой" : "Атлас микропрепаратов"}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Только препараты: {stats.preparations} микропрепаратов и {stats.electronograms} электронограмм.
                Схемы, методички, тесты и учебники остаются в «Материалах».
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showAtlasLink && !compact ? (
              <Link
                href="/atlas"
                className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-300"
              >
                <Maximize2 className="h-3.5 w-3.5" /> Отдельная страница
              </Link>
            ) : null}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border)] bg-white p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Закрыть атлас"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти препарат: «почка», «мазок крови», «неделя 5»…"
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-400"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2" aria-label="Тип материала">
          {KIND_TABS.map(([value, label]) => {
            const count = value === "preparation"
              ? stats.preparations
              : value === "electronogram"
                ? stats.electronograms
                : stats.total;
            const active = kind === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setKind(value);
                  setLesson("");
                }}
                className={
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition sm:text-sm " +
                  (active
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-[var(--border)] bg-white text-slate-700 hover:border-indigo-300")
                }
              >
                {label}
                <span className={"rounded-full px-1.5 text-[10px] " + (active ? "bg-white/20" : "bg-slate-100 text-slate-600")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {lessons.length > 1 ? (
          <div className="mobile-scroll-x flex gap-2 overflow-x-auto pb-1" aria-label="Темы занятий">
            <button
              type="button"
              onClick={() => setLesson("")}
              className={
                "shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold " +
                (!lesson ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-[var(--border)] bg-white text-slate-600")
              }
            >
              Все темы
            </button>
            {lessons.map((group) => (
              <button
                key={group.lesson}
                type="button"
                onClick={() => setLesson(lesson === group.lesson ? "" : group.lesson)}
                className={
                  "shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold " +
                  (lesson === group.lesson
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                    : "border-[var(--border)] bg-white text-slate-600 hover:border-indigo-300")
                }
              >
                {topicLabel(group.lesson)} · {group.items.length}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>
              Показано <b className="text-slate-700">{visible.length}</b> из {stats.total}
            </span>
            {filtersActive ? (
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1 font-semibold text-slate-700 hover:border-indigo-300"
              >
                Сбросить
              </button>
            ) : null}
            <label htmlFor="atlas-sort" className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Сортировка
            </label>
            <select
              id="atlas-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as AtlasSort)}
              className="min-h-9 rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            >
              <option value="plan">По плану занятий</option>
              <option value="name-asc">По названию: А—Я</option>
              <option value="name-desc">По названию: Я—А</option>
            </select>
          </div>
          {onTrain && visibleIds.length ? (
            <button
              type="button"
              onClick={() => onTrain({ ids: visibleIds, lesson, kind })}
              className="btn-primary inline-flex items-center gap-2 text-sm"
            >
              <GraduationCap className="h-4 w-4" />
              Тренировать {lesson ? "по теме" : "эти препараты"} ({visibleIds.length})
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        ) : null}
      </div>

      {!all.length ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          В банке пока нет карточек — атлас появится после импорта микропрепаратов.
        </div>
      ) : groups.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          <p className="font-semibold text-slate-700">По этому запросу препаратов нет</p>
          <p className="mt-1">Попробуйте другое слово или сбросьте фильтры.</p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : (
        <div ref={gridRef} className="space-y-4">
          {groups.map((group) => (
            <section key={group.lesson} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900">{topicLabel(group.lesson)}</h3>
                <span className="text-xs text-slate-500">{group.items.length} фото</span>
              </div>
              <div
                className={
                  "mt-3 grid gap-3 " +
                  (compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5")
                }
              >
                {group.items.map((card) => {
                  const id = String(card.id || "");
                  const name = atlasCardName(card);
                  return (
                    <button
                      key={id || name}
                      type="button"
                      disabled={!id}
                      onClick={() => id && setViewerId(id)}
                      className="group overflow-hidden rounded-xl border border-[var(--border)] bg-white text-left shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:border-indigo-300 enabled:hover:shadow-md disabled:opacity-60"
                    >
                      <div className="relative aspect-square bg-slate-100">
                        {id ? <AtlasThumb id={id} /> : null}
                        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-black/65 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
                          <Maximize2 className="h-3 w-3" /> Открыть
                        </span>
                      </div>
                      <div className="p-2">
                        <div className="line-clamp-2 text-xs font-semibold text-slate-900">{name}</div>
                        <div className="mt-0.5 line-clamp-1 text-[10px] font-medium text-indigo-500">
                          {topicLabel(lessonKeyOf(card as never))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {viewerCard ? (
        <TrainerImageViewer
          id={String(viewerCard.id || "")}
          title={atlasCardName(viewerCard)}
          lesson={topicLabel(lessonKeyOf(viewerCard as never))}
          captions={captionsOf(viewerCard)}
          onClose={() => setViewerId(null)}
          onPrev={visible.length > 1 ? () => step(-1) : undefined}
          onNext={visible.length > 1 ? () => step(1) : undefined}
          position={viewerIndex >= 0 ? { index: viewerIndex + 1, total: visible.length } : undefined}
          actions={
            <div className="flex flex-wrap gap-2">
              {onTrain ? (
                <button
                  type="button"
                  onClick={() => onTrain({ ids: visibleIds, lesson, kind })}
                  className="inline-flex w-fit rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Тренировать по этим препаратам
                </button>
              ) : null}
              <Link
                href={"/trainers/feed/histology?cards=" + encodeURIComponent(String(viewerCard.id || ""))}
                className="inline-flex w-fit rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Открыть этот препарат в тренажёре
              </Link>
            </div>
          }
        />
      ) : null}

      {!viewerCard && visible.length ? (
        <button
          type="button"
          onClick={openFirst}
          className="text-xs font-semibold text-indigo-600 hover:underline"
        >
          Открыть первый препарат списка →
        </button>
      ) : null}
    </section>
  );
}
