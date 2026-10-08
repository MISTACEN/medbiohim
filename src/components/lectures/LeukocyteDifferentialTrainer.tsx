"use client";

import { useEffect, useMemo, useState } from "react";
import { getTrainerImageUrl } from "@/lib/api";
import { ImageLightbox } from "@/components/media/ImageLightbox";

type CellKey = "neutrophils" | "lymphocytes" | "monocytes" | "eosinophils" | "basophils";
type Mode = "percent" | "changes" | "morphology" | "mixed";
type SourceMode = "local" | "external" | "mixed";

type Spec = {
  title?: string;
  mode?: Mode;
  sourceMode?: SourceMode;
  rounds?: number;
};

type Range = { min: number; max: number; label: string };
type CellInfo = {
  key: CellKey;
  name: string;
  short: string;
  courseAdult: Range;
  external: Range;
  morphology: string;
  high: string;
  low: string;
  localIds: string[];
};

const CELLS: CellInfo[] = [
  {
    key: "neutrophils",
    name: "Нейтрофилы",
    short: "Нейтрофилы",
    courseAdult: { min: 47, max: 72, label: "47–72%" },
    external: { min: 50, max: 60, label: "50–60%" },
    morphology: "10–12 мкм; ядро обычно 3–5 сегментов; мелкая бледная зернистость.",
    high: "Нейтрофилия. В учебных карточках часто связывается с острым бактериальным/воспалительным ответом; возможна и при стрессовых состояниях.",
    low: "Нейтропения. Частые причины включают лекарственное/химиотерапевтическое угнетение, инфекции и снижение продукции в костном мозге.",
    localIds: ["feed-prep-9f7dc534b5", "feed-prep-867b72a4b6", "feed-prep-a47e9dc83a"],
  },
  {
    key: "lymphocytes",
    name: "Лимфоциты",
    short: "Лимфоциты",
    courseAdult: { min: 19, max: 37, label: "19–37%" },
    external: { min: 20, max: 40, label: "20–40%" },
    morphology: "Обычно 7–10 мкм; крупное округлое тёмное ядро занимает почти всю клетку; узкий ободок базофильной цитоплазмы.",
    high: "Лимфоцитоз. У детей раннего возраста относительное повышение может быть физиологическим; патологически часто встречается при вирусных инфекциях.",
    low: "Лимфопения. Может наблюдаться при терапии кортикостероидами, иммунодефицитах и ряде состояний с угнетением иммунной системы.",
    localIds: ["feed-prep-a2feb3ec86", "feed-prep-5a224c48f5", "feed-prep-29f73833e0"],
  },
  {
    key: "monocytes",
    name: "Моноциты",
    short: "Моноциты",
    courseAdult: { min: 3, max: 11, label: "3–11%" },
    external: { min: 2, max: 9, label: "2–9%" },
    morphology: "Крупнейший лейкоцит периферической крови; около 18–20 мкм; бобовидное/подковообразное ядро, широкая серо-голубая цитоплазма.",
    high: "Моноцитоз. Может сопровождать хронические инфекции и воспалительные процессы.",
    low: "Моноцитопения. Низкий процент обычно менее специфичен и оценивается вместе с общей формулой и абсолютным числом.",
    localIds: ["feed-prep-bca30caf3b", "feed-prep-a2feb3ec86"],
  },
  {
    key: "eosinophils",
    name: "Эозинофилы",
    short: "Эозинофилы",
    courseAdult: { min: 1, max: 6, label: "1–6%" },
    external: { min: 1, max: 4, label: "1–4%" },
    morphology: "12–14 мкм; обычно 2 сегмента ядра; крупные яркие оксифильные/красноватые гранулы.",
    high: "Эозинофилия. Классические учебные ассоциации — аллергические реакции и паразитарные инвазии.",
    low: "Эозинопения. Может встречаться при терапии кортикостероидами, стрессовых состояниях и тяжёлых инфекциях; обычно сама по себе малоинформативна.",
    localIds: ["feed-prep-9f7dc534b5", "feed-prep-a47e9dc83a"],
  },
  {
    key: "basophils",
    name: "Базофилы",
    short: "Базофилы",
    courseAdult: { min: 0.5, max: 1, label: "0,5–1%" },
    external: { min: 0.5, max: 2, label: "0,5–2%" },
    morphology: "Около 11–12 мкм; ядро слабодольчатое/S-образное и часто скрыто крупными тёмно-фиолетовыми гранулами.",
    high: "Базофилия. Особенно важна как учебный признак при миелопролиферативных заболеваниях; также возможна при некоторых реакциях гиперчувствительности.",
    low: "Базопения. Обычно не является самостоятельным диагностическим признаком и оценивается только в контексте всей формулы.",
    localIds: [],
  },
];

const AGE_CROSSINGS = [
  { age: "1-е сутки", neut: "60–70%", lymph: "20–30%", note: "преобладают нейтрофилы" },
  { age: "4-е сутки", neut: "≈45%", lymph: "≈45%", note: "1-й перекрёст" },
  { age: "1–2 года", neut: "25–30%", lymph: "60–65% (до 70%)", note: "преобладают лимфоциты" },
  { age: "4 года", neut: "≈45%", lymph: "≈45%", note: "2-й перекрёст" },
  { age: "14–15 лет и взрослые", neut: "47–72%", lymph: "19–37%", note: "формула взрослого" },
];

const EXTERNAL_IMAGES = [
  { cell: "neutrophils" as CellKey, url: "https://webpath.med.utah.edu/jpeg5/HEME002.jpg", source: "University of Utah WebPath", sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM020.html", caption: "Сегментоядерный нейтрофил и лимфоцит" },
  { cell: "monocytes" as CellKey, url: "https://webpath.med.utah.edu/jpeg5/HEME003.jpg", source: "University of Utah WebPath", sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM021.html", caption: "Моноцит в периферической крови" },
  { cell: "eosinophils" as CellKey, url: "https://webpath.med.utah.edu/jpeg5/HEME004.jpg", source: "University of Utah WebPath", sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM022.html", caption: "Эозинофил и лимфоцит" },
  { cell: "basophils" as CellKey, url: "https://webpath.med.utah.edu/jpeg5/HEME005.jpg", source: "University of Utah WebPath", sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM023.html", caption: "Базофил, палочкоядерный нейтрофил и лимфоцит" },
];

const PERCENT_QUESTIONS: Array<{ cell: CellKey; prompt: string; options: string[]; answer: string; explanation: string }> = [
  { cell: "neutrophils", prompt: "Какой учебный диапазон нормы нейтрофилов у взрослого?", options: ["19–37%", "47–72%", "1–6%", "3–11%"], answer: "47–72%", explanation: "В Lecture 05 для взрослой формулы: нейтрофилы 47–72%." },
  { cell: "lymphocytes", prompt: "Какой учебный диапазон нормы лимфоцитов у взрослого?", options: ["47–72%", "0,5–1%", "19–37%", "3–11%"], answer: "19–37%", explanation: "В Lecture 05 для взрослой формулы: лимфоциты 19–37%." },
  { cell: "monocytes", prompt: "Какой учебный диапазон нормы моноцитов у взрослого?", options: ["3–11%", "1–6%", "19–37%", "47–72%"], answer: "3–11%", explanation: "В Lecture 05: моноциты 3–11%." },
  { cell: "eosinophils", prompt: "Какой учебный диапазон нормы эозинофилов у взрослого?", options: ["0,5–1%", "1–6%", "3–11%", "19–37%"], answer: "1–6%", explanation: "В Lecture 05: эозинофилы 1–6%." },
  { cell: "basophils", prompt: "Какой учебный диапазон нормы базофилов у взрослого?", options: ["0,5–1%", "1–6%", "3–11%", "19–37%"], answer: "0,5–1%", explanation: "В Lecture 05: базофилы 0,5–1%." },
  { cell: "neutrophils", prompt: "У взрослого нейтрофилы 68%. Как оценить показатель по учебной норме Lecture 05?", options: ["Норма", "Нейтрофилия", "Нейтропения", "Эозинофилия"], answer: "Норма", explanation: "68% попадает в диапазон 47–72%." },
  { cell: "lymphocytes", prompt: "У взрослого лимфоциты 34%. Как оценить показатель по учебной норме Lecture 05?", options: ["Норма", "Лимфоцитоз", "Лимфопения", "Моноцитоз"], answer: "Норма", explanation: "34% попадает в диапазон 19–37%." },
  { cell: "eosinophils", prompt: "У взрослого эозинофилы 0,6%. Что это по учебному порогу Lecture 05?", options: ["Эозинофилия", "Норма", "Эозинопения", "Базофилия"], answer: "Эозинопения", explanation: "0,6% ниже учебной нижней границы 1%." },
  { cell: "monocytes", prompt: "У взрослого моноциты 8%. Как оценить показатель?", options: ["Моноцитоз", "Норма", "Моноцитопения", "Лимфоцитоз"], answer: "Норма", explanation: "8% находится в диапазоне 3–11%." },
];

const CHANGE_QUESTIONS = [
  { prompt: "В анализе взрослого: нейтрофилы 80%. Что происходит?", options: ["Нейтрофилия", "Нейтропения", "Лимфопения", "Эозинофилия"], answer: "Нейтрофилия", cell: "neutrophils" as CellKey, explanation: "80% выше учебной верхней границы 72% — нейтрофилия." },
  { prompt: "В анализе взрослого: нейтрофилы 35%. Что происходит?", options: ["Нейтропения", "Нейтрофилия", "Моноцитоз", "Базофилия"], answer: "Нейтропения", cell: "neutrophils" as CellKey, explanation: "35% ниже учебной нижней границы 47% — нейтропения." },
  { prompt: "В анализе взрослого: лимфоциты 52%. Какой термин по проценту?", options: ["Лимфоцитоз", "Лимфопения", "Нейтрофилия", "Моноцитопения"], answer: "Лимфоцитоз", cell: "lymphocytes" as CellKey, explanation: "52% выше учебной верхней границы 37% — лимфоцитоз." },
  { prompt: "В анализе взрослого: лимфоциты 14%. Какой термин?", options: ["Лимфопения", "Лимфоцитоз", "Эозинофилия", "Норма"], answer: "Лимфопения", cell: "lymphocytes" as CellKey, explanation: "14% ниже учебной нижней границы 19% — лимфопения." },
  { prompt: "Эозинофилы 9% у взрослого. Что запомнить?", options: ["Эозинофилия", "Эозинопения", "Норма", "Лимфопения"], answer: "Эозинофилия", cell: "eosinophils" as CellKey, explanation: "9% выше учебной верхней границы 6% — эозинофилия." },
  { prompt: "Базофилы 1,4% у взрослого. Что запомнить по учебному порогу?", options: ["Базофилия", "Базопения", "Норма", "Нейтрофилия"], answer: "Базофилия", cell: "basophils" as CellKey, explanation: "1,4% выше учебной верхней границы 1% — базофилия." },
  { prompt: "Моноциты 1% у взрослого. Что это?", options: ["Моноцитопения", "Моноцитоз", "Норма", "Лимфоцитоз"], answer: "Моноцитопения", cell: "monocytes" as CellKey, explanation: "1% ниже учебной нижней границы 3% — моноцитопения." },
  { prompt: "Палочкоядерные нейтрофилы 12%. Какой термин для карточки?", options: ["Сдвиг влево", "Лимфопения", "Эозинофилия", "Базофилия"], answer: "Сдвиг влево", cell: "neutrophils" as CellKey, explanation: "12% палочкоядерных выше учебного диапазона 3–5% — сдвиг влево." },
];

function cellByKey(key: CellKey) {
  return CELLS.find((item) => item.key === key) || CELLS[0];
}

function externalImageFor(key: CellKey) {
  return EXTERNAL_IMAGES.find((item) => item.cell === key) || EXTERNAL_IMAGES[0];
}

function deterministicIndex(seed: number, length: number) {
  if (!length) return 0;
  return Math.abs(seed * 17 + 7) % length;
}

export function LeukocyteDifferentialTrainer({ raw }: { raw: string }) {
  const spec = useMemo<Spec>(() => {
    try {
      const value = JSON.parse(raw || "{}") as Spec;
      return {
        title: String(value.title || "Лейкоцитарная формула — тренажёр"),
        mode: value.mode === "percent" || value.mode === "changes" || value.mode === "morphology" || value.mode === "mixed" ? value.mode : "mixed",
        sourceMode: value.sourceMode === "local" || value.sourceMode === "external" || value.sourceMode === "mixed" ? value.sourceMode : "mixed",
        rounds: Math.min(30, Math.max(5, Number(value.rounds) || 12)),
      };
    } catch {
      return { title: "Лейкоцитарная формула — тренажёр", mode: "mixed", sourceMode: "mixed", rounds: 12 };
    }
  }, [raw]);

  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [sourceTab, setSourceTab] = useState<"local" | "external">(spec.sourceMode === "external" ? "external" : "local");

  const modeForRound = spec.mode === "mixed"
    ? (["percent", "changes", "morphology"] as const)[round % 3]
    : spec.mode;

  const question = useMemo(() => {
    if (modeForRound === "percent") {
      const item = PERCENT_QUESTIONS[deterministicIndex(round, PERCENT_QUESTIONS.length)];
      return { kind: "percent" as const, ...item };
    }
    if (modeForRound === "changes") {
      const item = CHANGE_QUESTIONS[deterministicIndex(round, CHANGE_QUESTIONS.length)];
      return { kind: "changes" as const, ...item };
    }
    const localCandidates = CELLS.flatMap((item) => item.localIds.map((id) => ({ source: "local" as const, cell: item.key, id })));
    const externalCandidates = EXTERNAL_IMAGES.map((item) => ({ source: "external" as const, cell: item.cell, url: item.url, sourceUrl: item.sourceUrl, caption: item.caption }));
    const candidates = sourceTab === "local"
      ? localCandidates
      : sourceTab === "external"
        ? externalCandidates
        : [...localCandidates, ...externalCandidates];
    const item = candidates[deterministicIndex(round, candidates.length)];
    if (!item) {
      return { kind: "morphology" as const, source: "external" as const, cell: EXTERNAL_IMAGES[0].cell, url: EXTERNAL_IMAGES[0].url, sourceUrl: EXTERNAL_IMAGES[0].sourceUrl, caption: EXTERNAL_IMAGES[0].caption };
    }
    return { kind: "morphology" as const, ...item };
  }, [modeForRound, round, sourceTab]);

  useEffect(() => {
    setSelected("");
    setChecked(null);
    setImageFailed(false);
    setImageUrl(null);
    if (question.kind !== "morphology") return;
    if (question.source === "external") {
      setImageUrl(question.url);
      return;
    }
    setImageLoading(true);
    void getTrainerImageUrl(question.id).then((url) => {
      setImageLoading(false);
      setImageUrl(url || null);
      if (!url) setImageFailed(true);
    }).catch(() => {
      setImageLoading(false);
      setImageFailed(true);
    });
  }, [question]);

  const cell = cellByKey(question.cell);

  function submit() {
    if (checked !== null || !selected) return;
    const correct = selected === question.cell || selected === question.answer;
    setChecked(correct);
    if (correct) setScore((value) => value + 1);
  }

  function next() {
    if (round + 1 >= spec.rounds) return;
    setRound((value) => value + 1);
    setSelected("");
    setChecked(null);
  }

  function restart() {
    setRound(0);
    setScore(0);
    setSelected("");
    setChecked(null);
  }

  const options = question.kind === "morphology"
    ? [cellByKey(question.cell).name, "Другая клетка", "Эритроцит", "Тромбоцит"].sort((a, b) => a.localeCompare(b, "ru"))
    : question.options || [];

  const progress = Math.min(100, ((round + 1) / spec.rounds) * 100);
  const done = round + 1 >= spec.rounds && checked !== null;

  return (
    <section className="my-7 overflow-hidden rounded-3xl border border-indigo-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-indigo-50 via-white to-emerald-50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Интерактивный тренажёр</div>
            <h3 className="mt-1 text-lg font-extrabold text-slate-900">{spec.title}</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
              Проценты → увеличение/уменьшение → распознавание мазка. Для запоминания используется учебная норма Lecture 05; лабораторные референсы могут отличаться.
            </p>
          </div>
          <div className="min-w-[150px] text-right">
            <div className="text-xs font-semibold text-slate-500">Раунд {Math.min(round + 1, spec.rounds)} / {spec.rounds}</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-500" style={{ width: progress + "%" }} /></div>
            <div className="mt-1 text-xs font-bold text-slate-700">Счёт: {score}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {modeForRound === "morphology" ? (
            <>
              <button type="button" onClick={() => setSourceTab("local")} className={"rounded-full border px-3 py-1.5 text-xs font-bold " + (sourceTab === "local" ? "border-indigo-500 bg-indigo-100 text-indigo-800" : "bg-white text-slate-600")}>Мои препараты</button>
              <button type="button" onClick={() => setSourceTab("external")} className={"rounded-full border px-3 py-1.5 text-xs font-bold " + (sourceTab === "external" ? "border-indigo-500 bg-indigo-100 text-indigo-800" : "bg-white text-slate-600")}>Внешняя сверка</button>
            </>
          ) : null}
          <div className="ml-auto rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500">режим: {modeForRound === "percent" ? "проценты" : modeForRound === "changes" ? "↑ / ↓" : "мазок"}</div>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          {question.kind === "morphology" ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {imageLoading ? (
                <div className="flex min-h-[280px] items-center justify-center text-sm text-slate-500">Загружаем препарат…</div>
              ) : imageUrl && !imageFailed ? (
                <ImageLightbox
                  src={imageUrl}
                  alt={"Учебное изображение: " + cell.name}
                  caption={question.source === "external" ? question.caption : "Канонический препарат MEDBIOHIM"}
                  className="min-h-[280px] bg-slate-50"
                  imageClassName="mx-auto max-h-[420px] w-full object-contain p-2 sm:max-h-[520px]"
                />
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-500">
                  <span>Изображение временно недоступно.</span>
                  {question.source === "external" ? (
                    <a href={question.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 underline">Открыть источник</a>
                  ) : null}
                </div>
              )}
              <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                <div className="font-bold text-slate-900">Смотри сначала сам</div>
                <div className="mt-1">Размер → ядро → сегментация → зернистость → клетка.</div>
                {question.source === "external" ? (
                  <a href={question.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex font-semibold text-indigo-600 underline">{question.caption} · WebPath</a>
                ) : (
                  <a href="/subjects/histology?tab=trainer" className="mt-2 inline-flex font-semibold text-indigo-600 underline">Открыть локальный атлас</a>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              {question.kind === "percent" ? (
                <>
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-600">Запомни процент</div>
                  <div className="mt-2 text-lg font-extrabold text-slate-900">{question.prompt}</div>
                </>
              ) : (
                <>
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-600">↑ / ↓</div>
                  <div className="mt-2 text-lg font-extrabold text-slate-900">{question.prompt}</div>
                </>
              )}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={checked !== null}
                    onClick={() => setSelected(option)}
                    className={"rounded-xl border px-3 py-3 text-left text-sm font-semibold transition " +
                      (selected === option ? "border-indigo-500 bg-indigo-100 text-indigo-900" : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50") +
                      (checked !== null && (option === question.cell || option === question.answer) ? " border-emerald-400 bg-emerald-50 text-emerald-900" : "")}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {checked !== null && (
            <div className={"mt-4 rounded-2xl border p-4 " + (checked ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50")}>
              <div className="text-sm font-extrabold">{checked ? "✓ Правильно" : "✕ Пока нет"}</div>
              <div className="mt-2 text-sm leading-6 text-slate-700">
                <b>{cell.name}:</b> {cell.morphology}
              </div>
              {question.kind === "percent" && <div className="mt-2 text-sm text-slate-700">{question.explanation}</div>}
              {question.kind === "changes" && <div className="mt-2 text-sm text-slate-700">{question.explanation}</div>}
              {question.kind === "morphology" && <div className="mt-2 text-sm text-slate-700">{cell.morphology}</div>}
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {done ? (
              <button type="button" onClick={restart} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">Пройти ещё раз</button>
            ) : checked !== null ? (
              <button type="button" onClick={next} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">Следующий</button>
            ) : (
              <button type="button" disabled={!selected} onClick={submit} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">Проверить</button>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Норма взрослого · курс</div>
            <div className="mt-3 space-y-2">
              {CELLS.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                  <span className="font-semibold text-slate-700">{item.short}</span>
                  <span className="font-extrabold text-slate-900">{item.courseAdult.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-800">Внешняя сверка</div>
            <div className="mt-2 text-xs leading-5 text-amber-900">
              University of Iowa Health Care: нейтрофилы 50–60%, лимфоциты 20–40%, моноциты 2–9%, эозинофилы 1–4%, базофилы 0,5–2%. Референсы зависят от лаборатории.
            </div>
            <a href="https://uihc.org/cancer/educational-resources/complete-blood-count-guide-patients-cancer" target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-bold text-amber-900 underline">Открыть источник Iowa</a>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Возрастные перекрёсты</div>
            <div className="mt-2 space-y-2">
              {AGE_CROSSINGS.map((item) => (
                <div key={item.age} className="rounded-xl bg-slate-50 p-2.5 text-[11px] leading-5">
                  <div className="font-bold text-slate-800">{item.age}</div>
                  <div className="text-slate-600">N {item.neut} · L {item.lymph} · {item.note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Главный алгоритм</div>
            <div className="mt-2 text-sm font-bold leading-6 text-slate-800">Возраст → процент → ↑/↓ → морфология → функция.</div>
            <div className="mt-2 text-[11px] leading-5 text-slate-500">
              Процентный тренажёр учебный. При реальной лабораторной интерпретации учитываются абсолютные числа, симптомы и референсный интервал конкретной лаборатории.
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default LeukocyteDifferentialTrainer;
