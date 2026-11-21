"use client";

/**
 * Редактор методических карточек препаратов.
 *
 * Правка идёт по одной карточке и сохраняется upsert-ом по `key`: списки
 * вводятся построчно, структуры — через запятую. Это тот же контент, что видит
 * атлас и диагностикум, поэтому поля названы как в методичке.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Search } from "lucide-react";
import { adminListPreparationGuides, adminSavePreparationGuide } from "@/lib/api";
import { describeApiError } from "@/lib/errors";

type Guide = {
  key: string;
  name?: string | null;
  section?: string | null;
  system?: string | null;
  organ?: string | null;
  tissue?: string | null;
  stain?: string | null;
  difficulty?: number | null;
  low_magnification?: string | null;
  high_magnification?: string | null;
  structures?: string[] | null;
  steps?: string[] | null;
  features?: string[] | null;
  inclusions?: string[] | null;
  differential?: string[] | null;
  mistakes?: string[] | null;
};

type Form = {
  key: string;
  name: string;
  section: string;
  system: string;
  organ: string;
  tissue: string;
  stain: string;
  difficulty: string;
  structures: string;
  steps: string;
  features: string;
  inclusions: string;
  differential: string;
  mistakes: string;
  low: string;
  high: string;
};

const EMPTY: Form = {
  key: "",
  name: "",
  section: "",
  system: "",
  organ: "",
  tissue: "",
  stain: "",
  difficulty: "",
  structures: "",
  steps: "",
  features: "",
  inclusions: "",
  differential: "",
  mistakes: "",
  low: "",
  high: "",
};

const lines = (value?: string[] | null) => (Array.isArray(value) ? value.join("\n") : "");
const fromLines = (value: string) =>
  value
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean);

function toForm(guide: Guide): Form {
  return {
    key: guide.key,
    name: String(guide.name ?? ""),
    section: String(guide.section ?? ""),
    system: String(guide.system ?? ""),
    organ: String(guide.organ ?? ""),
    tissue: String(guide.tissue ?? ""),
    stain: String(guide.stain ?? ""),
    difficulty: guide.difficulty == null ? "" : String(guide.difficulty),
    structures: (guide.structures || []).join(", "),
    steps: lines(guide.steps),
    features: lines(guide.features),
    inclusions: lines(guide.inclusions),
    differential: lines(guide.differential),
    mistakes: lines(guide.mistakes),
    low: String(guide.low_magnification ?? ""),
    high: String(guide.high_magnification ?? ""),
  };
}

function toPayload(form: Form) {
  return {
    name: form.name,
    section: form.section,
    system: form.system,
    organ: form.organ,
    tissue: form.tissue,
    stain: form.stain,
    difficulty: form.difficulty === "" ? null : Number(form.difficulty),
    structures: form.structures
      .split(/[,\s]+/)
      .map((slug) => slug.trim().toLowerCase())
      .filter(Boolean),
    steps: fromLines(form.steps),
    features: fromLines(form.features),
    inclusions: fromLines(form.inclusions),
    differential: fromLines(form.differential),
    mistakes: fromLines(form.mistakes),
    low_magnification: form.low,
    high_magnification: form.high,
  };
}

const field =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm text-slate-800";
const label = "text-[11px] font-semibold uppercase tracking-wide text-slate-400";

export function PreparationGuideEditor() {
  const [items, setItems] = useState<Guide[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void adminListPreparationGuides()
      .then((res) => {
        if (res.ok) setItems(res.data.items || []);
        else setError(describeApiError(res.error));
      })
      .catch(() => setError("Не удалось загрузить карточки"));
  }, []);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      `${item.name ?? ""} ${item.section ?? ""} ${item.key}`.toLowerCase().includes(query),
    );
  }, [items, filter]);

  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    if (!form.key.trim()) {
      setError("Сначала укажите ключ карточки");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const res = await adminSavePreparationGuide(form.key.trim().toLowerCase(), toPayload(form));
    if (res.ok) {
      const saved = res.data.item as Guide;
      setItems((current) => {
        const rest = current.filter((item) => item.key !== saved.key);
        return [...rest, saved].sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"));
      });
      setMessage(`Сохранено: ${saved.name}`);
    } else {
      setError(describeApiError(res.error));
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="card space-y-2 p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Поиск карточки"
              className="w-full rounded-lg border border-[var(--border)] py-1.5 pl-8 pr-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY);
              setMessage("");
              setError("");
            }}
            className="rounded-lg border border-[var(--border)] p-1.5 text-slate-600 hover:border-indigo-200"
            title="Новая карточка"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[560px] space-y-1 overflow-auto">
          {visible.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setForm(toForm(item));
                setMessage("");
                setError("");
              }}
              className={
                "block w-full rounded-lg px-2 py-1.5 text-left text-sm " +
                (form.key === item.key ? "bg-indigo-50 font-semibold text-indigo-800" : "text-slate-700 hover:bg-slate-50")
              }
            >
              {item.name || item.key}
              <span className="block text-[11px] text-slate-400">{item.key}</span>
            </button>
          ))}
          {!visible.length ? <p className="px-2 py-3 text-xs text-slate-400">Карточек нет.</p> : null}
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Ключ
            <input
              value={form.key}
              onChange={(event) => set({ key: event.target.value })}
              placeholder="cytology-mitosis"
              className={field}
            />
          </label>
          <label className={label}>
            Название
            <input value={form.name} onChange={(event) => set({ name: event.target.value })} className={field} />
          </label>
          <label className={label}>
            Раздел
            <input value={form.section} onChange={(event) => set({ section: event.target.value })} className={field} />
          </label>
          <label className={label}>
            Система
            <input value={form.system} onChange={(event) => set({ system: event.target.value })} className={field} />
          </label>
          <label className={label}>
            Орган
            <input value={form.organ} onChange={(event) => set({ organ: event.target.value })} className={field} />
          </label>
          <label className={label}>
            Ткань
            <input value={form.tissue} onChange={(event) => set({ tissue: event.target.value })} className={field} />
          </label>
          <label className={label}>
            Окраска
            <input value={form.stain} onChange={(event) => set({ stain: event.target.value })} className={field} />
          </label>
          <label className={label}>
            Сложность (1–3)
            <input
              value={form.difficulty}
              onChange={(event) => set({ difficulty: event.target.value })}
              inputMode="numeric"
              className={field}
            />
          </label>
        </div>

        <label className={label}>
          Структуры (slug через запятую)
          <input
            value={form.structures}
            onChange={(event) => set({ structures: event.target.value })}
            placeholder="chromosomes, spindle"
            className={field}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Признаки (по строке)
            <textarea value={form.features} onChange={(event) => set({ features: event.target.value })} rows={4} className={field} />
          </label>
          <label className={label}>
            Включения (по строке)
            <textarea value={form.inclusions} onChange={(event) => set({ inclusions: event.target.value })} rows={4} className={field} />
          </label>
          <label className={label}>
            Шаги поиска (по строке)
            <textarea value={form.steps} onChange={(event) => set({ steps: event.target.value })} rows={4} className={field} />
          </label>
          <label className={label}>
            Дифференциал (по строке)
            <textarea value={form.differential} onChange={(event) => set({ differential: event.target.value })} rows={4} className={field} />
          </label>
          <label className={label}>
            Частые ошибки (по строке)
            <textarea value={form.mistakes} onChange={(event) => set({ mistakes: event.target.value })} rows={4} className={field} />
          </label>
          <div className="space-y-3">
            <label className={label}>
              Малое увеличение
              <textarea value={form.low} onChange={(event) => set({ low: event.target.value })} rows={2} className={field} />
            </label>
            <label className={label}>
              Большое увеличение
              <textarea value={form.high} onChange={(event) => set({ high: event.target.value })} rows={2} className={field} />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Сохранить
          </button>
          <span className="text-xs text-slate-400">
            Сохранение по ключу: повторная запись обновляет карточку, дубля не будет.
          </span>
        </div>

        {message ? (
          <p className="rounded-xl bg-[var(--status-ok-bg)] px-3 py-2 text-sm text-[var(--status-ok-fg)]">{message}</p>
        ) : null}
        {error ? (
          <p className="rounded-xl bg-[var(--status-critical-bg)] px-3 py-2 text-sm text-[var(--status-critical-fg)]">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
