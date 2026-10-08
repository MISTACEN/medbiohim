"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardCheck, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { getTrainerImageUrl } from "@/lib/api";
import { ImageLightbox } from "@/components/media/ImageLightbox";
import { LeukocyteIllustration } from "@/components/lectures/LeukocyteIllustration";

type CellKey = "neutrophils" | "lymphocytes" | "monocytes" | "eosinophils" | "basophils";
type Mode = "percent" | "changes" | "morphology" | "mixed" | "case";
type SourceMode = "local" | "external" | "mixed";
type Deviation = "normal" | "high" | "low";

type VisualMode = "photo" | "drawing" | "mixed";
type Spec = { title?: string; mode?: Mode; sourceMode?: SourceMode; visualMode?: VisualMode; rounds?: number };
type Norm = { text: string; min: number; max: number; approximate?: boolean };
type AgeProfile = { id: string; label: string; norms: Record<CellKey, Norm> };
type CellInfo = {
  key: CellKey;
  name: string;
  morphology: string;
  function: string;
  highTerm: string;
  lowTerm?: string;
  localIds: string[];
  highHypotheses: string[];
  lowHypotheses: string[];
};
type Case = {
  id: string;
  age: AgeProfile;
  cell: CellKey;
  norm: Norm;
  result: number;
  deviation: Deviation;
  source: "local" | "external";
  imageId?: string;
  imageUrl?: string;
  imageSourceUrl?: string;
  imageFocus?: { x: number; y: number; scale?: number };
  visual: "photo" | "drawing";
  drawingVariant?: 0 | 1;
};
type Answers = { cell: string; norm: string; result: string; conclusion: string; diagnosis: string };
type Evaluation = { cell: boolean; norm: boolean; result: boolean; conclusion: boolean; diagnosis: boolean; grade: 2 | 4 | 5 };

const COURSE_NORM_SOURCE = "Методичка «Кровь» / 4.Кровь.docx";

/* Таблица строго из учебной методички «Кровь»: взрослый + возрастные колонки. */
const AGE_PROFILES: AgeProfile[] = [
  {
    id: "adult",
    label: "Взрослый",
    norms: {
      neutrophils: { text: "48–78%", min: 48, max: 78 },
      lymphocytes: { text: "19–37%", min: 19, max: 37 },
      monocytes: { text: "3–11%", min: 3, max: 11 },
      eosinophils: { text: "0,5–5%", min: 0.5, max: 5 },
      basophils: { text: "0–1%", min: 0, max: 1 },
    },
  },
  {
    id: "teen12_14",
    label: "12–14 лет",
    norms: {
      neutrophils: { text: "48–78%", min: 48, max: 78 },
      lymphocytes: { text: "19–37%", min: 19, max: 37 },
      monocytes: { text: "3–11%", min: 3, max: 11 },
      eosinophils: { text: "0,5–5%", min: 0.5, max: 5 },
      basophils: { text: "0–1%", min: 0, max: 1 },
    },
  },
  {
    id: "day4",
    label: "4–5 дней",
    norms: {
      neutrophils: { text: "≈45%", min: 45, max: 45, approximate: true },
      lymphocytes: { text: "45%", min: 45, max: 45, approximate: true },
      monocytes: { text: "3–11%", min: 3, max: 11 },
      eosinophils: { text: "0,5–5%", min: 0.5, max: 5 },
      basophils: { text: "0–1%", min: 0, max: 1 },
    },
  },
  {
    id: "year1_2",
    label: "1–2 года",
    norms: {
      neutrophils: { text: "≈25%", min: 25, max: 25, approximate: true },
      lymphocytes: { text: "65%", min: 65, max: 65, approximate: true },
      monocytes: { text: "3–11%", min: 3, max: 11 },
      eosinophils: { text: "0,5–5%", min: 0.5, max: 5 },
      basophils: { text: "0–1%", min: 0, max: 1 },
    },
  },
  {
    id: "year4_5",
    label: "4–5 лет",
    norms: {
      neutrophils: { text: "≈45%", min: 45, max: 45, approximate: true },
      lymphocytes: { text: "45%", min: 45, max: 45, approximate: true },
      monocytes: { text: "3–11%", min: 3, max: 11 },
      eosinophils: { text: "0,5–5%", min: 0.5, max: 5 },
      basophils: { text: "0–1%", min: 0, max: 1 },
    },
  },
];

const CELLS: CellInfo[] = [
  {
    key: "neutrophils",
    name: "Нейтрофилы",
    morphology: "10–11 мкм; сегментированное ядро (обычно ≥3 сегментов); мелкая нейтрофильная зернистость.",
    function: "Фагоцитоз микроорганизмов; участие в антигистаминных реакциях и гнойном воспалении.",
    highTerm: "нейтрофилия (нейтрофилёз)",
    lowTerm: "нейтрофилопения",
    localIds: ["feed-prep-867b72a4b6"],
    highHypotheses: ["бактериаль", "инфекц", "воспал"],
    lowHypotheses: ["угнет", "костного мозга", "лекарств", "нейтропени"],
  },
  {
    key: "lymphocytes",
    name: "Лимфоциты",
    morphology: "Обычно 4,5–10 мкм и более; округлое плотное тёмное ядро занимает большую часть клетки; базофильная цитоплазма.",
    function: "Участие в иммунных реакциях; Т- и В-лимфоциты участвуют в клеточном и гуморальном иммунитете.",
    highTerm: "лимфоцитоз",
    lowTerm: "лимфоцитопения",
    localIds: ["feed-prep-5a224c48f5"],
    highHypotheses: ["вирус", "инфекц"],
    lowHypotheses: ["иммунодефицит", "иммунн", "угнет", "кортикост"],
  },
  {
    key: "monocytes",
    name: "Моноциты",
    morphology: "18–20 мкм; крупная клетка; бобовидное/подковообразное светлое рыхлое ядро; широкая светло-базофильная цитоплазма.",
    function: "Дифференцируются в макрофаги и формируют макрофагическую систему организма.",
    highTerm: "моноцитоз",
    lowTerm: "моноцитопения",
    localIds: ["feed-prep-bca30caf3b"],
    highHypotheses: ["хроническ", "инфекц", "воспал", "аутоиммун"],
    lowHypotheses: ["угнет", "лекарств", "иммунодефицит", "инфекц"],
  },
  {
    key: "eosinophils",
    name: "Эозинофилы",
    morphology: "12–14 мкм; ядро обычно из 2 сегментов; крупные оксифильные гранулы.",
    function: "Уничтожение микроорганизмов, гельминтов и простейших; разрушение гистамина и участие в аллергических реакциях.",
    highTerm: "эозинофилия",
    localIds: [],
    highHypotheses: ["аллерг", "паразит", "инваз"],
    lowHypotheses: ["кортикост", "стресс", "тяжёл"],
  },
  {
    key: "basophils",
    name: "Базофилы",
    morphology: "11–12 мкм; ядро слабо разделено на сегменты и часто скрыто крупными базофильными гранулами.",
    function: "Гепарин действует как антикоагулянт; гистамин увеличивает проницаемость сосудов и соединительной ткани.",
    highTerm: "базофилия",
    localIds: [],
    highHypotheses: ["миелопролифера", "гиперчувств", "аллерг"],
    lowHypotheses: ["самостоятельн", "не имеет специфическ"],
  },
];

const SINGLE_CELL_EXTERNAL = [
  {
    cell: "neutrophils" as CellKey,
    url: "https://webpath.med.utah.edu/jpeg5/HEME002.jpg",
    sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM020.html",
    imageFocus: { x: 73, y: 44, scale: 2.7 },
  },
  {
    cell: "lymphocytes" as CellKey,
    url: "https://webpath.med.utah.edu/jpeg5/HEME002.jpg",
    sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM020.html",
    imageFocus: { x: 35, y: 62, scale: 2.7 },
  },
  {
    cell: "eosinophils" as CellKey,
    url: "https://webpath.med.utah.edu/jpeg5/HEME004.jpg",
    sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM022.html",
    imageFocus: { x: 50, y: 50, scale: 2.2 },
  },
  {
    cell: "basophils" as CellKey,
    url: "https://webpath.med.utah.edu/jpeg5/HEME005.jpg",
    sourceUrl: "https://webpath.med.utah.edu/HISTHTML/NORMAL/NORM023.html",
    imageFocus: { x: 50, y: 50, scale: 2.2 },
  },
];

const CONCLUSION_TERMS: Record<CellKey, { normal: string[]; high: string[]; low: string[] }> = {
  neutrophils: { normal: ["норма", "норм"], high: ["нейтрофилия", "нейтрофилез"], low: ["нейтрофилопения"] },
  lymphocytes: { normal: ["норма", "норм"], high: ["лимфоцитоз"], low: ["лимфоцитопения"] },
  monocytes: { normal: ["норма", "норм"], high: ["моноцитоз"], low: ["моноцитопения"] },
  eosinophils: { normal: ["норма", "норм"], high: ["эозинофилия"], low: [] },
  basophils: { normal: ["норма", "норм"], high: ["базофилия"], low: [] },
};

function cellByKey(key: CellKey) {
  return CELLS.find((item) => item.key === key) || CELLS[0];
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/й/g, "и")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numbers(value: string): number[] {
  return (value.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(",", ".")));
}

function closeNumber(a: number, b: number, tolerance = 0.15) {
  return Math.abs(a - b) <= tolerance;
}

function normMatches(input: string, norm: Norm) {
  const nums = numbers(input);
  if (norm.approximate) return nums.length >= 1 && closeNumber(nums[0], norm.min, 1);
  return nums.length >= 2 && closeNumber(nums[0], norm.min, 0.2) && closeNumber(nums[1], norm.max, 0.2);
}

function resultMatches(input: string, expected: number) {
  const nums = numbers(input);
  return nums.length >= 1 && closeNumber(nums[0], expected, 0.15);
}

function resultLabel(value: number) {
  return String(value).replace(".", ",") + "%";
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createCase(round: number, sourceMode: SourceMode, visualMode: VisualMode): Case {
  const age = AGE_PROFILES[Math.floor(Math.random() * AGE_PROFILES.length)];
  const cell = CELLS[Math.floor(Math.random() * CELLS.length)];
  const norm = age.norms[cell.key];
  const supportsLow = Boolean(CONCLUSION_TERMS[cell.key].low.length);
  const statusPool: Deviation[] = supportsLow ? ["normal", "high", "low"] : ["normal", "high"];
  const deviation = statusPool[Math.floor(Math.random() * statusPool.length)];

  let result: number;
  if (norm.approximate) {
    if (deviation === "normal") result = norm.min;
    else if (deviation === "high") result = Math.round((norm.max + randomBetween(8, 18)) * 10) / 10;
    else result = Math.max(0.1, Math.round((norm.min - randomBetween(6, 15)) * 10) / 10);
  } else if (deviation === "normal") {
    result = Math.round(randomBetween(norm.min, norm.max) * 10) / 10;
  } else if (deviation === "high") {
    const delta = Math.max(1, (norm.max - norm.min) * 0.35);
    result = Math.round((norm.max + randomBetween(Math.max(0.5, delta * 0.35), delta)) * 10) / 10;
  } else {
    const delta = Math.max(0.5, norm.min * 0.45);
    result = Math.round(Math.max(0.1, norm.min - randomBetween(Math.max(0.2, delta * 0.5), delta)) * 10) / 10;
  }

  const id = ["case", String(round), String(Date.now())].join("-");
  const draw = visualMode === "drawing" || (visualMode === "mixed" && Math.random() < 0.5);

  if (draw) {
    return {
      id,
      age,
      cell: cell.key,
      norm,
      result,
      deviation,
      source: "local",
      visual: "drawing",
      drawingVariant: Math.random() < 0.5 ? 0 : 1,
    };
  }

  const localIds = cell.localIds;
  const external = SINGLE_CELL_EXTERNAL.filter((item) => item.cell === cell.key);
  let source: "local" | "external";
  if (sourceMode === "local" && localIds.length) source = "local";
  else if (sourceMode === "external" && external.length) source = "external";
  else if (localIds.length && external.length) source = Math.random() < 0.55 ? "local" : "external";
  else if (localIds.length) source = "local";
  else source = "external";

  if (source === "local") {
    return {
      id,
      age,
      cell: cell.key,
      norm,
      result,
      deviation,
      source,
      visual: "photo",
      imageId: localIds[Math.floor(Math.random() * localIds.length)],
    };
  }

  const image = external[0];
  if (!image) {
    // Для фото без подтверждённого одиночного внешнего кадра возвращаем
    // проверенный локальный препарат, а не изображение другой клетки.
    if (localIds.length) {
      return {
        id,
        age,
        cell: cell.key,
        norm,
        result,
        deviation,
        source: "local",
        visual: "photo",
        imageId: localIds[Math.floor(Math.random() * localIds.length)],
      };
    }
    // В такой конфигурации эта клетка появится рисунком при следующем раунде.
    return {
      id,
      age,
      cell: cell.key,
      norm,
      result,
      deviation,
      source: "local",
      visual: "drawing",
      drawingVariant: Math.random() < 0.5 ? 0 : 1,
    };
  }

  return {
    id,
    age,
    cell: cell.key,
    norm,
    result,
    deviation,
    source: "external",
    visual: "photo",
    imageUrl: image.url,
    imageSourceUrl: image.sourceUrl,
    imageFocus: image.imageFocus,
  };
}

const EMPTY: Answers = { cell: "", norm: "", result: "", conclusion: "", diagnosis: "" };

export function LeukocyteDifferentialTrainer({ raw }: { raw: string }) {
  const spec = useMemo<Spec>(() => {
    try {
      const value = JSON.parse(raw || "{}") as Spec;
      const requested = value.mode;
      return {
        title: String(value.title || "Лейкоцитарная формула — тренажёр"),
        mode: requested === "percent" || requested === "changes" || requested === "morphology" || requested === "case" || requested === "mixed" ? requested : "case",
        sourceMode: value.sourceMode === "local" || value.sourceMode === "external" || value.sourceMode === "mixed" ? value.sourceMode : "mixed",
        visualMode: value.visualMode === "photo" || value.visualMode === "drawing" || value.visualMode === "mixed" ? value.visualMode : "mixed",
        rounds: Math.min(30, Math.max(5, Number(value.rounds) || 12)),
      };
    } catch {
      return { title: "Лейкоцитарная формула — тренажёр", mode: "case", sourceMode: "mixed", visualMode: "mixed", rounds: 12 };
    }
  }, [raw]);

  const [round, setRound] = useState(0);
  const [currentCase, setCurrentCase] = useState<Case | null>(null);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [grades, setGrades] = useState<number[]>([]);

  const actualMode = spec.mode === "mixed" ? "case" : spec.mode;

  useEffect(() => {
    if (actualMode !== "case") return;
    setCurrentCase(createCase(round, spec.sourceMode || "mixed", spec.visualMode || "mixed"));
    setAnswers(EMPTY);
    setEvaluation(null);
    setImageUrl(null);
    setImageFailed(false);
  }, [actualMode, round, spec.sourceMode, spec.visualMode]);

  useEffect(() => {
    let cancelled = false;
    if (!currentCase || currentCase.visual !== "photo" || currentCase.source !== "local" || !currentCase.imageId) {
      setImageLoading(false);
      return;
    }
    setImageLoading(true);
    void getTrainerImageUrl(currentCase.imageId)
      .then((url) => {
        if (cancelled) return;
        setImageLoading(false);
        setImageUrl(url || null);
        if (!url) setImageFailed(true);
      })
      .catch(() => {
        if (cancelled) return;
        setImageLoading(false);
        setImageFailed(true);
      });
    return () => { cancelled = true; };
  }, [currentCase]);

  function update(field: keyof Answers, value: string) {
    setAnswers((prev) => ({ ...prev, [field]: value }));
  }

  function evaluate(event: FormEvent) {
    event.preventDefault();
    if (!currentCase || evaluation) return;

    const info = cellByKey(currentCase.cell);
    const cellAnswer = normalizeText(answers.cell);
    const cellCorrect = cellAnswer.includes(normalizeText(info.name)) || ["нейтрофил", "лимфоцит", "моноцит", "эозинофил", "базофил"].some((x) => cellAnswer.includes(x) && normalizeText(info.name).includes(x));

    const normCorrect = normMatches(answers.norm, currentCase.norm);
    const resultCorrect = resultMatches(answers.result, currentCase.result);
    const conclusionTerms = CONCLUSION_TERMS[currentCase.cell][currentCase.deviation];
    const conclusionCorrect = conclusionTerms.some((term) => normalizeText(answers.conclusion).includes(term));

    const diagnosisText = normalizeText(answers.diagnosis);
    const diagnosisCorrect = currentCase.deviation === "normal"
      ? diagnosisText.includes("норм") || diagnosisText.includes("нет") || diagnosisText.includes("без отклон")
      : info[currentCase.deviation === "high" ? "highHypotheses" : "lowHypotheses"].some((term) => diagnosisText.includes(term));

    const baseCorrect = [cellCorrect, normCorrect, resultCorrect, conclusionCorrect].every(Boolean);
    const grade: 2 | 4 | 5 = !baseCorrect ? 2 : diagnosisCorrect ? 5 : 4;

    setEvaluation({ cell: cellCorrect, norm: normCorrect, result: resultCorrect, conclusion: conclusionCorrect, diagnosis: diagnosisCorrect, grade });
    setGrades((prev) => [...prev, grade]);
  }

  function nextCase() {
    if (round + 1 >= spec.rounds) return;
    setRound((value) => value + 1);
  }

  function restart() {
    setRound(0);
    setGrades([]);
    setAnswers(EMPTY);
    setEvaluation(null);
    setCurrentCase(null);
  }

  if (actualMode !== "case") {
    return (
      <section className="my-7 rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm">
        <div className="rounded-2xl bg-indigo-50 p-4">
          <h3 className="text-lg font-extrabold text-slate-900">{spec.title}</h3>
          <p className="mt-1 text-sm text-slate-600">Этот блок сохранён для совместимости со старыми режимами. Для практики по методичке используется режим «Карточка исследования».</p>
        </div>
      </section>
    );
  }

  if (!currentCase) {
    return <section className="my-7 rounded-3xl border border-indigo-200 bg-white p-6 text-sm text-slate-500">Готовлю карточку исследования…</section>;
  }

  const cell = cellByKey(currentCase.cell);
  const visibleImage = currentCase.visual === "photo"
    ? currentCase.source === "external"
      ? currentCase.imageUrl || null
      : imageUrl
    : null;
  const overallDone = Boolean(evaluation && round + 1 >= spec.rounds);
  const average = grades.length ? Math.round((grades.reduce((sum, value) => sum + value, 0) / grades.length) * 10) / 10 : null;

  return (
    <section className="my-7 overflow-hidden rounded-3xl border border-indigo-200 bg-white shadow-sm">
      <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-emerald-50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-indigo-800">
              <ClipboardCheck className="h-3.5 w-3.5" /> Практическая карточка
            </div>
            <h3 className="mt-2 text-xl font-extrabold text-slate-900">{spec.title}</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
              1) опознай клетку по мазку → 2) назови норму по возрасту → 3) перепиши результат → 4) сравни и поставь термин → 5) объясни функцию и сформулируй предварительную гипотезу.
            </p>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-white/80 px-4 py-3 text-right shadow-sm">
            <div className="text-xs font-semibold text-slate-500">Карточка</div>
            <div className="text-lg font-extrabold text-slate-900">{round + 1} / {spec.rounds}</div>
            {average !== null ? <div className="mt-1 text-[11px] font-bold text-indigo-700">Средняя: {average}</div> : null}
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: String(((round + 1) / spec.rounds) * 100) + "%" }} />
        </div>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_300px] sm:p-5">
        <div className="min-w-0 space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-800">
                На изображении: один целевой лейкоцит
              </span>
              <span className="text-[10px] font-semibold text-slate-500">
                Других лейкоцитов в рабочем кадре нет
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Карточка исследования</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">Возраст пациента: {currentCase.age.label}</div>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Результат исследования</div>
                <div className="text-2xl font-black text-slate-900">{resultLabel(currentCase.result)}</div>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">Это единственное числовое значение на карточке. Его нужно самостоятельно переписать в 3-й столбик.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="p-3 text-sm font-extrabold text-slate-900">1. Опознать клетку</div>
              <div className="bg-slate-950">
                {currentCase.visual === "drawing" ? (
                  <ImageLightbox
                    caption="Один целевой лейкоцит — учебный рисунок"
                    className="bg-white"
                    imageClassName="mx-auto h-[235px] w-full p-2 sm:h-[270px]"
                  >
                    <LeukocyteIllustration
                      cell={currentCase.cell}
                      variant={currentCase.drawingVariant ?? 0}
                      className="h-full w-full"
                    />
                  </ImageLightbox>
                ) : visibleImage ? (
                  <ImageLightbox
                    src={visibleImage}
                    alt="Мазок периферической крови"
                    caption="Один целевой лейкоцит — реальный препарат"
                    className="bg-slate-950"
                    imageClassName="mx-auto h-[235px] w-full object-contain p-2 sm:h-[270px]"
                    focus={currentCase.imageFocus}
                  />
                ) : (
                  <div className="flex h-[235px] items-center justify-center text-xs text-white/60">{imageLoading ? "Загрузка мазка…" : "Изображение временно недоступно"}</div>
                )}
              </div>
              <div className="border-t border-slate-200 px-3 py-2 text-[10px] text-slate-500">
                {currentCase.visual === "drawing"
                  ? "Учебный рисунок · однозначная морфология"
                  : currentCase.source === "local"
                    ? "Реальный препарат MEDBIOHIM · одиночная клетка"
                    : "Реальный препарат WebPath · сфокусирована одна клетка"}
                {imageFailed && currentCase.imageSourceUrl ? <a href={currentCase.imageSourceUrl} target="_blank" rel="noreferrer" className="ml-1 font-semibold text-indigo-600 underline">Источник</a> : null}
              </div>
              <input value={answers.cell} onChange={(e) => update("cell", e.target.value)} disabled={Boolean(evaluation)} className="w-full border-0 border-t border-slate-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Какой это лейкоцит?" />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-extrabold text-slate-900">2. Норма по возрасту</div>
              <div className="mt-2 rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">Возраст: <b>{currentCase.age.label}</b></div>
              <div className="mt-3 text-xs leading-5 text-slate-500">Пиши норму именно для распознанной клетки и этого возраста. Можно: «19–37%», «19-37%».</div>
              <input value={answers.norm} onChange={(e) => update("norm", e.target.value)} disabled={Boolean(evaluation)} className="mt-4 w-full rounded-xl border px-3 py-3 text-sm" placeholder="Норма, %" />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-extrabold text-slate-900">3. Результат исследования</div>
              <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Скопируй вручную число с карточки исследования выше.</div>
              <input value={answers.result} onChange={(e) => update("result", e.target.value)} disabled={Boolean(evaluation)} className="mt-4 w-full rounded-xl border px-3 py-3 text-sm" placeholder="Результат, %" />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-extrabold text-slate-900">4. Вывод</div>
              <div className="mt-2 text-xs leading-5 text-slate-500">Сравни результат с возрастной нормой и напиши термин из методички.</div>
              <input value={answers.conclusion} onChange={(e) => update("conclusion", e.target.value)} disabled={Boolean(evaluation)} className="mt-4 w-full rounded-xl border px-3 py-3 text-sm" placeholder="Норма / нейтрофилия / ..." />
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 md:col-span-2 xl:col-span-4">
              <div className="text-sm font-extrabold text-slate-900">5. Предварительный диагноз / гипотеза для «5»</div>
              <div className="mt-2 text-xs leading-5 text-slate-600">Сначала назови функцию клетки, затем свяжи её с найденным отклонением. Это учебная гипотеза, а не окончательный диагноз.</div>
              <input value={answers.diagnosis} onChange={(e) => update("diagnosis", e.target.value)} disabled={Boolean(evaluation)} className="mt-4 w-full rounded-xl border px-3 py-3 text-sm" placeholder="Например: предполагаю бактериальную инфекцию" />
            </div>
          </div>

          <form onSubmit={evaluate}>
            {!evaluation ? (
              <button type="submit" disabled={!answers.cell.trim() || !answers.norm.trim() || !answers.result.trim() || !answers.conclusion.trim()} className="w-full rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-40">
                Проверить карточку
              </button>
            ) : null}
          </form>

          {evaluation ? (
            <div className="space-y-4">
              <div className={"rounded-3xl border p-4 " + (evaluation.grade === 2 ? "border-rose-200 bg-rose-50" : evaluation.grade === 5 ? "border-emerald-200 bg-emerald-50" : "border-indigo-200 bg-indigo-50")}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Результат карточки</div>
                    <div className="mt-1 text-3xl font-black text-slate-900">{evaluation.grade}</div>
                  </div>
                  <div className="text-right text-xs font-semibold text-slate-600">
                    {evaluation.grade === 2 ? "Ошибка хотя бы в одном из первых 4 столбиков." : evaluation.grade === 5 ? "Все 4 столбика верны + обоснована предварительная гипотеза." : "Все 4 основных столбика решены верно."}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-5">
                {[
                  ["Клетка", evaluation.cell],
                  ["Норма", evaluation.norm],
                  ["Результат", evaluation.result],
                  ["Вывод", evaluation.conclusion],
                  ["Гипотеза", evaluation.diagnosis],
                ].map(([label, ok]) => (
                  <div key={String(label)} className={"rounded-xl border px-3 py-3 text-xs " + (ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50")}>
                    <div className="font-bold text-slate-500">{label}</div>
                    <div className="mt-1 flex items-center gap-1 font-extrabold">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}{ok ? "Верно" : "Ошибка"}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-extrabold text-slate-900">Эталон разбора</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">1. Клетка</div><div className="mt-1 font-bold">{cell.name}</div></div>
                  <div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">2. Норма</div><div className="mt-1 font-bold">{currentCase.norm.text}</div></div>
                  <div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">3. Результат</div><div className="mt-1 font-bold">{resultLabel(currentCase.result)}</div></div>
                  <div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">4. Вывод</div><div className="mt-1 font-bold">{currentCase.deviation === "normal" ? "Норма" : currentCase.deviation === "high" ? cell.highTerm : cell.lowTerm || "отклонение"}</div></div>
                </div>
                <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-700"><b>Функция клетки:</b> {cell.function}</div>
                <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
                  <b>Для «5»:</b>{" "}
                  {currentCase.deviation === "normal"
                    ? "при нормальном результате по этому показателю отдельная патологическая гипотеза не формируется."
                    : currentCase.deviation === "high"
                      ? "учебные направления: " + cell.highHypotheses.join(", ") + ". Конкретный диагноз требует дополнительных данных."
                      : "контекст снижения: " + cell.lowHypotheses.join(", ") + ". Одного процента недостаточно для диагноза."}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {overallDone ? (
                  <button type="button" onClick={restart} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"><RotateCcw className="h-4 w-4" /> Пройти заново</button>
                ) : (
                  <button type="button" onClick={nextCase} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white"><Sparkles className="h-4 w-4" /> Следующая карточка</button>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-extrabold text-slate-900">Критерии оценки</div>
            <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
              <div className="rounded-xl bg-rose-50 p-3"><b>2</b> — ошибка хотя бы в одном из первых 4 столбиков.</div>
              <div className="rounded-xl bg-indigo-50 p-3"><b>4</b> — все 4 основных столбика верны.</div>
              <div className="rounded-xl bg-emerald-50 p-3"><b>5</b> — все 4 верны + предварительная гипотеза связана с функцией клетки.</div>
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
            <div className="text-sm font-extrabold text-indigo-950">Нормы для карточек</div>
            <div className="mt-2 text-[11px] leading-5 text-indigo-900">Источник: <b>{COURSE_NORM_SOURCE}</b>. Используются именно возрастные значения лейкоцитарной формулы.</div>
            <div className="mt-3 space-y-1.5">
              {AGE_PROFILES.map((age) => (
                <div key={age.id} className="rounded-xl bg-white/80 p-2.5 text-[10px] text-slate-700">
                  <div className="font-bold">{age.label}</div>
                  <div className="mt-1">N {age.norms.neutrophils.text} · L {age.norms.lymphocytes.text} · M {age.norms.monocytes.text}</div>
                  <div>E {age.norms.eosinophils.text} · B {age.norms.basophils.text}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-5 text-amber-900">
              Эозинофилы и базофилы в курсовой таблице имеют только оценку «норма/повышение» для этой карточки: отдельный термин снижения в исходном документе не указан.
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-extrabold text-slate-900">Как делать на занятии</div>
            <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
              <div><b>1.</b> Узнай клетку по размеру, ядру и зернистости.</div>
              <div><b>2.</b> Открой нужную возрастную колонку и назови норму.</div>
              <div><b>3.</b> Перепиши значение исследования без округления.</div>
              <div><b>4.</b> Назови термин: норма, повышение или понижение.</div>
              <div><b>5.</b> Свяжи функцию клетки с возможной причиной отклонения.</div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default LeukocyteDifferentialTrainer;
