"use client";

/**
 * Очередь «Свои препараты → атлас» в админке.
 *
 * Студент отправляет личную карточку с микроскопа, админ смотрит снимок и
 * либо публикует его в общий атлас гистологии, либо возвращает с пояснением.
 * Публикация создаёт обычную карточку препарата — дальше она живёт в
 * `/admin/trainer-cards` как любой другой препарат.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, RefreshCw, X } from "lucide-react";
import { describeApiError } from "@/lib/errors";
import {
  approvePreparationSubmission,
  listPreparationGuides,
  listPreparationSubmissions,
  rejectPreparationSubmission,
  type MyPreparationStatus,
  type PreparationSubmission,
} from "@/lib/content-api";

type GuidePick = { key: string; name: string; section: string | null };

const TABS: Array<{ id: MyPreparationStatus | "all"; label: string }> = [
  { id: "pending", label: "На проверке" },
  { id: "approved", label: "В атласе" },
  { id: "rejected", label: "Отклонённые" },
  { id: "all", label: "Все заявки" },
];

export function PreparationSubmissions() {
  const [status, setStatus] = useState<MyPreparationStatus | "all">("pending");
  const [items, setItems] = useState<PreparationSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [approveFor, setApproveFor] = useState<string | null>(null);
  const [guideKey, setGuideKey] = useState("");
  const [guides, setGuides] = useState<GuidePick[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (next: MyPreparationStatus | "all") => {
    setLoading(true);
    const result = await listPreparationSubmissions(next);
    setLoading(false);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setError(null);
    setItems(result.data.items || []);
  }, []);

  useEffect(() => { void load(status); }, [load, status]);

  // Методички нужны, чтобы одобренный снимок стал заданием тренажёра, а не
  // только экспонатом атласа. Ошибка загрузки не блокирует публикацию.
  useEffect(() => {
    void listPreparationGuides()
      .then((result) => {
        if (!result.ok) return;
        setGuides(
          (result.data.items || []).map((guide) => ({
            key: String(guide.key),
            name: String(guide.name || guide.key),
            section: guide.section ? String(guide.section) : null,
          })),
        );
      })
      .catch(() => undefined);
  }, []);

  /** Одноимённая методичка — очевидный выбор по умолчанию; модератор может сменить. */
  function defaultGuide(name: string): string {
    const target = name.trim().toLocaleLowerCase("ru-RU");
    const exact = guides.find((guide) => guide.name.trim().toLocaleLowerCase("ru-RU") === target);
    return exact?.key || "";
  }

  async function approve(item: PreparationSubmission, key: string) {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    const result = await approvePreparationSubmission(item.id, key ? { guide_key: key } : {});
    setBusyId(null);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setItems((current) => current.filter((row) => row.id !== item.id));
    setApproveFor(null);
    setGuideKey("");
    setNotice(
      key
        ? `«${item.name}» опубликован в атласе и добавлен в тренажёр.`
        : `«${item.name}» опубликован в атласе (без вариантов ответа — только просмотр).`,
    );
  }

  async function reject(item: PreparationSubmission) {
    if (note.trim().length < 3) {
      setError("Напишите, что исправить — студент увидит это пояснение.");
      return;
    }
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    const result = await rejectPreparationSubmission(item.id, note.trim());
    setBusyId(null);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setItems((current) => current.filter((row) => row.id !== item.id));
    setRejectFor(null);
    setNote("");
    setNotice(`«${item.name}» возвращён владельцу с пояснением.`);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatus(tab.id)}
              aria-pressed={status === tab.id}
              className={
                "rounded-lg px-3 py-1.5 text-sm font-semibold " +
                (status === tab.id ? "bg-indigo-50 text-indigo-700" : "text-slate-500")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load(status)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold"
        >
          <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /> Обновить
        </button>
      </div>

      {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-[var(--primary-soft)] px-4 py-3 text-sm">{notice}</p> : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем заявки…
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
          {status === "pending" ? "Новых заявок нет." : "В этой вкладке пусто."}
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- подписанная ссылка без известных размеров
                <img src={item.image} alt={item.name} className="h-52 w-full bg-slate-50 object-contain" />
              ) : (
                <div className="flex h-52 items-center justify-center bg-slate-50 text-xs text-[var(--muted)]">Нет снимка</div>
              )}
              <div className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{item.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {[item.organ, item.stain].filter(Boolean).join(" · ") || "Орган и окраска не указаны"}
                    </p>
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    {item.author.name || "Студент"}
                    {item.author.email ? ` · ${item.author.email}` : ""}
                  </p>
                </div>
                {item.description ? (
                  <p className="whitespace-pre-line text-sm leading-6 text-slate-700">{item.description}</p>
                ) : null}

                {item.submission_status === "pending" ? (
                  <div className="space-y-2 border-t border-[var(--border)] pt-2">
                    {rejectFor === item.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          rows={2}
                          placeholder="Что исправить: например, смазанный снимок или не указана окраска"
                          className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void reject(item)}
                            disabled={busyId === item.id}
                            className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                          >
                            Отклонить
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRejectFor(null); setNote(""); }}
                            className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold"
                          >
                            <X className="h-4 w-4" /> Отмена
                          </button>
                        </div>
                      </div>
                    ) : approveFor === item.id ? (
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-600">
                          Методичка препарата
                          <select
                            value={guideKey}
                            onChange={(event) => setGuideKey(event.target.value)}
                            className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-normal"
                          >
                            <option value="">Без методички — только просмотр в атласе</option>
                            {guides.map((guide) => (
                              <option key={guide.key} value={guide.key}>
                                {guide.section ? `${guide.section} · ${guide.name}` : guide.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="text-[11px] leading-4 text-[var(--muted)]">
                          С методичкой карточка получает вопрос и три варианта — её можно решать в тренажёре и
                          диагностикуме. Верный ответ строится из выбранной методички, поэтому он должен
                          соответствовать снимку.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void approve(item, guideKey)}
                            disabled={busyId === item.id}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                          >
                            {busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                            {guideKey ? "Опубликовать и добавить в тренажёр" : "Опубликовать в атласе"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setApproveFor(null); setGuideKey(""); }}
                            className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold"
                          >
                            <X className="h-4 w-4" /> Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => { setApproveFor(item.id); setGuideKey(defaultGuide(item.name)); setRejectFor(null); }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white"
                        >
                          <BadgeCheck className="h-4 w-4" /> Опубликовать в атласе
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRejectFor(item.id); setNote(""); setApproveFor(null); }}
                          className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold"
                        >
                          Вернуть на доработку
                        </button>
                      </div>
                    )}
                  </div>
                ) : item.published_card_id ? (
                  <Link
                    href={`/subjects/histology?tab=trainer&card=${encodeURIComponent(item.published_card_id)}`}
                    className="text-sm font-semibold text-indigo-600"
                  >
                    Открыть карточку в атласе →
                  </Link>
                ) : item.moderation_note ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{item.moderation_note}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
