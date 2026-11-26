"use client";

/**
 * Редактор карточки препарата v2: архив, дополнительные изображения, подписи
 * и указатели на основной картинке.
 *
 * Учебное содержание (признаки, структуры, дифференциал) живёт в методичке —
 * её правит соседний редактор `/admin/preparation-guides`. Здесь только то,
 * чего в методичке нет: сами изображения и метки на них.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, ImagePlus, Loader2, MapPin, Search, Trash2, X } from "lucide-react";
import {
  adminAddTrainerCardImage,
  adminDeleteTrainerCardImage,
  adminGetTrainerCard,
  adminListTrainerCards,
  adminUpdateTrainerCard,
  adminUpdateTrainerCardImage,
  getTrainerCardImageUrl,
  getTrainerImageUrl,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";

type Hotspot = { x: number; y: number; label: string; structure: string };

type CardImage = {
  id: string;
  object_key: string | null;
  external_url: string | null;
  caption: string;
  hotspots: Hotspot[];
  sort_order: number;
};

type CardSummary = {
  id: string;
  name: string;
  organ: string;
  mode_set: string | null;
  is_archived: boolean;
  images: number;
};

type CardDetail = {
  id: string;
  name: string;
  organ: string;
  stain: string;
  captions: string[];
  hotspots: Hotspot[];
  is_archived: boolean;
  mode_set: string | null;
  images: CardImage[];
};

const field =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm text-slate-800";
const label = "text-[11px] font-semibold uppercase tracking-wide text-slate-400";

const lines = (value: string[]) => value.join("\n");
const fromLines = (value: string) => value.split("\n").map((row) => row.trim()).filter(Boolean);

export function TrainerCardEditor() {
  const [items, setItems] = useState<CardSummary[]>([]);
  const [filter, setFilter] = useState("");
  const [card, setCard] = useState<CardDetail | null>(null);
  const [primaryUrl, setPrimaryUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newCaption, setNewCaption] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);

  async function loadList() {
    const res = await adminListTrainerCards();
    if (res.ok) setItems(res.data.items || []);
    else setError(describeApiError(res.error));
  }

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    setPrimaryUrl(null);
    setImageUrls({});
    if (!card) return;
    let alive = true;
    void getTrainerImageUrl(card.id).then((url) => {
      if (alive) setPrimaryUrl(url);
    });
    for (const image of card.images) {
      void getTrainerCardImageUrl(card.id, image.id).then((url) => {
        if (alive) setImageUrls((current) => ({ ...current, [image.id]: url }));
      });
    }
    return () => {
      alive = false;
    };
  }, [card]);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => `${item.name} ${item.organ}`.toLowerCase().includes(query));
  }, [items, filter]);

  async function open(id: string) {
    setMessage("");
    setError("");
    const res = await adminGetTrainerCard(id);
    if (res.ok) setCard(res.data.item as CardDetail);
    else setError(describeApiError(res.error));
  }

  const patchCard = (patch: Partial<CardDetail>) =>
    setCard((current) => (current ? { ...current, ...patch } : current));

  async function saveCard(patch: Record<string, unknown>, success: string) {
    if (!card) return;
    setBusy(true);
    setError("");
    setMessage("");
    const res = await adminUpdateTrainerCard(card.id, patch);
    if (res.ok) {
      setCard(res.data.item as CardDetail);
      setMessage(success);
      void loadList();
    } else {
      setError(describeApiError(res.error));
    }
    setBusy(false);
  }

  function addHotspot(event: React.MouseEvent<HTMLDivElement>) {
    if (!card || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    patchCard({
      hotspots: [...card.hotspots, { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000, label: "", structure: "" }],
    });
  }

  function updateHotspot(index: number, patch: Partial<Hotspot>) {
    if (!card) return;
    patchCard({ hotspots: card.hotspots.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  }

  function removeHotspot(index: number) {
    if (!card) return;
    patchCard({ hotspots: card.hotspots.filter((_, i) => i !== index) });
  }

  async function addImage() {
    if (!card) return;
    const payload: Record<string, unknown> = { caption: newCaption };
    if (newKey.trim()) payload.object_key = newKey.trim();
    else if (newUrl.trim()) payload.external_url = newUrl.trim();
    else {
      setError("Нужен ключ хранилища или https-ссылка");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const res = await adminAddTrainerCardImage(card.id, payload);
    if (res.ok) {
      setNewKey("");
      setNewUrl("");
      setNewCaption("");
      await open(card.id);
      setMessage("Изображение добавлено");
      void loadList();
    } else {
      setError(describeApiError(res.error));
    }
    setBusy(false);
  }

  async function saveImageCaption(image: CardImage, caption: string) {
    if (!card) return;
    const res = await adminUpdateTrainerCardImage(card.id, image.id, { caption });
    if (res.ok) {
      setMessage("Подпись к изображению сохранена");
    } else {
      setError(describeApiError(res.error));
    }
  }

  async function removeImage(image: CardImage) {
    if (!card) return;
    const res = await adminDeleteTrainerCardImage(card.id, image.id);
    if (res.ok) {
      await open(card.id);
      setMessage("Изображение удалено из карточки");
      void loadList();
    } else {
      setError(describeApiError(res.error));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="card space-y-2 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Поиск препарата"
            className="w-full rounded-lg border border-[var(--border)] py-1.5 pl-8 pr-2 text-sm"
          />
        </div>
        <div className="max-h-[560px] space-y-1 overflow-auto">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void open(item.id)}
              className={
                "block w-full rounded-lg px-2 py-1.5 text-left text-sm " +
                (card?.id === item.id ? "bg-indigo-50 font-semibold text-indigo-800" : "text-slate-700 hover:bg-slate-50")
              }
            >
              {item.name || item.id}
              <span className="block text-[11px] text-slate-400">
                {item.mode_set === "electronogram" ? "электронограмма" : "препарат"}
                {item.images ? ` · снимков ${item.images + 1}` : ""}
                {item.is_archived ? " · в архиве" : ""}
              </span>
            </button>
          ))}
          {!visible.length ? <p className="px-2 py-3 text-xs text-slate-400">Карточек нет.</p> : null}
        </div>
      </div>

      <div className="card space-y-4 p-4">
        {!card ? (
          <p className="text-sm text-slate-500">Выберите препарат слева.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">{card.name || card.id}</h2>
                <p className="text-xs text-slate-500">Карточка {card.id}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveCard({ is_archived: !card.is_archived }, card.is_archived ? "Карточка возвращена из архива" : "Карточка в архиве")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-200 disabled:opacity-60"
              >
                {card.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {card.is_archived ? "Вернуть из архива" : "В архив"}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className={label}>
                Название
                <input value={card.name} onChange={(event) => patchCard({ name: event.target.value })} className={field} />
              </label>
              <label className={label}>
                Орган
                <input value={card.organ} onChange={(event) => patchCard({ organ: event.target.value })} className={field} />
              </label>
              <label className={label}>
                Окраска
                <input value={card.stain} onChange={(event) => patchCard({ stain: event.target.value })} className={field} />
              </label>
            </div>

            <label className={label}>
              Подписи к изображению (по строке, как в методичке)
              <textarea
                value={lines(card.captions)}
                onChange={(event) => patchCard({ captions: fromLines(event.target.value) })}
                rows={3}
                className={field}
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void saveCard(
                    {
                      preparation: { name: card.name, organ: card.organ, stain: card.stain, captions: card.captions },
                      hotspots: card.hotspots,
                    },
                    "Карточка сохранена",
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                Сохранить карточку
              </button>
              <span className="text-xs text-slate-400">
                Указатели ставятся кликом по изображению; координаты — доли 0–1.
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
              <div className="space-y-2">
                <p className={label}>Основное изображение</p>
                <div
                  ref={stageRef}
                  onClick={addHotspot}
                  className="relative w-full cursor-crosshair overflow-hidden rounded-xl border border-[var(--border)] bg-slate-50"
                  role="presentation"
                >
                  {primaryUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={primaryUrl} alt={card.name} className="block w-full" draggable={false} />
                  ) : (
                    <div className="flex h-40 items-center justify-center text-xs text-slate-400">Изображение недоступно</div>
                  )}
                  {card.hotspots.map((spot, index) => (
                    <span
                      key={index}
                      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow"
                      style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
                    >
                      {index + 1}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <p className={label}>Указатели ({card.hotspots.length})</p>
                <div className="max-h-64 space-y-1 overflow-auto pr-1">
                  {card.hotspots.map((spot, index) => (
                    <div key={index} className="flex items-start gap-1">
                      <span className="mt-1.5 w-4 text-[11px] font-bold text-slate-400">{index + 1}</span>
                      <div className="flex-1 space-y-1">
                        <input
                          value={spot.label}
                          onChange={(event) => updateHotspot(index, { label: event.target.value })}
                          placeholder="Подпись структуры"
                          className="w-full rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                        />
                        <input
                          value={spot.structure}
                          onChange={(event) => updateHotspot(index, { structure: event.target.value })}
                          placeholder="Структура (slug, необязательно)"
                          className="w-full rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-slate-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeHotspot(index)}
                        aria-label="Удалить указатель"
                        className="mt-1 rounded p-1 text-slate-400 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {!card.hotspots.length ? <p className="text-[11px] text-slate-400">Кликните по изображению, чтобы поставить метку.</p> : null}
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t border-[var(--border)] pt-3">
              <p className={label}>Дополнительные снимки того же препарата</p>
              {card.images.map((image) => (
                <div key={image.id} className="flex items-start gap-2 rounded-xl border border-[var(--border)] p-2">
                  {imageUrls[image.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrls[image.id] as string} alt={image.caption || card.name} className="h-16 w-24 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">нет</div>
                  )}
                  <div className="flex-1 space-y-1">
                    <input
                      defaultValue={image.caption}
                      onBlur={(event) => {
                        if (event.target.value !== image.caption) void saveImageCaption(image, event.target.value);
                      }}
                      placeholder="Подпись к снимку"
                      className="w-full rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                    />
                    <p className="truncate text-[11px] text-slate-400">
                      {image.external_url ? image.external_url : image.object_key}
                      {image.hotspots.length ? ` · указателей ${image.hotspots.length}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeImage(image)}
                    aria-label="Удалить снимок"
                    className="rounded p-1 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  value={newKey}
                  onChange={(event) => setNewKey(event.target.value)}
                  placeholder="Ключ в хранилище (histology/...)"
                  className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
                />
                <input
                  value={newUrl}
                  onChange={(event) => setNewUrl(event.target.value)}
                  placeholder="или https-ссылка"
                  className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
                />
                <input
                  value={newCaption}
                  onChange={(event) => setNewCaption(event.target.value)}
                  placeholder="Подпись"
                  className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void addImage()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-200 disabled:opacity-60"
              >
                <ImagePlus className="h-4 w-4" />
                Добавить снимок
              </button>
            </div>

            {message ? (
              <p className="rounded-xl bg-[var(--status-ok-bg)] px-3 py-2 text-sm text-[var(--status-ok-fg)]">{message}</p>
            ) : null}
            {error ? (
              <p className="rounded-xl bg-[var(--status-critical-bg)] px-3 py-2 text-sm text-[var(--status-critical-fg)]">{error}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}