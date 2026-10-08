"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Eye, RotateCcw } from "lucide-react";

type PreparationCard = {
  id: string;
  title: string;
  image: string;
  imageLabel: string;
  prompt: string;
  answer: string;
  clues: string[];
  function: string;
  avoid: string;
};

const CARDS: PreparationCard[] = [
  {
    id: "neutrophil",
    title: "Нейтрофил",
    image: "/content/histology/5_Фотографии препаратов/цитология, эмбриология и общая гистология/5.Соед.тк. Кровь. Нейтрофил..jpg",
    imageLabel: "5.Соед.тк. Кровь. Нейтрофил..jpg",
    prompt: "Что за клетка на препарате и по каким признакам ты её определишь?",
    answer: "Нейтрофильный гранулоцит. Ищи клетку около 10–12 мкм с сегментированным ядром (обычно 3–5 сегментов) и мелкой бледной розово-фиолетовой зернистостью.",
    clues: ["3–5 сегментов ядра у зрелого сегментоядерного нейтрофила", "мелкая бледная розово-фиолетовая зернистость", "размер около 10–12 мкм"],
    function: "Главная функция — фагоцитоз и микрофагальная защита.",
    avoid: "Не путай с эозинофилом: у эозинофила крупная яркая красно-розовая зернистость и 2 крупных сегмента ядра.",
  },
  {
    id: "eosinophil",
    title: "Эозинофил + нейтрофил: сравнение",
    image: "/content/histology/5_Фотографии препаратов/цитология, эмбриология и общая гистология/5.Соед.тк. Кровь. Эозинофил и нейтр..jpg",
    imageLabel: "5.Соед.тк. Кровь. Эозинофил и нейтр..jpg",
    prompt: "Как на этом препарате отличить эозинофил от нейтрофила?",
    answer: "Эозинофил — крупнее, около 12–14 мкм, ядро из 2 крупных сегментов, зернистость крупная ярко-розовая/малиновая. Нейтрофил — около 10–12 мкм, 3–5 сегментов и мелкая бледная зернистость.",
    clues: ["эозинофил: 2 сегмента", "эозинофил: крупные яркие оксифильные гранулы", "нейтрофил: 3–5 сегментов и мелкие гранулы"],
    function: "Эозинофилы участвуют в противопаразитарной защите и регуляции аллергических реакций.",
    avoid: "Не определяй клетку только по цвету: сначала смотри на ядро, затем на размер и зернистость.",
  },
  {
    id: "lymphocyte",
    title: "Лимфоцит",
    image: "/content/histology/5_Фотографии препаратов/цитология, эмбриология и общая гистология/5.Соед.тк. Кровь.Лимфоцит..jpg",
    imageLabel: "5.Соед.тк. Кровь.Лимфоцит..jpg",
    prompt: "Как узнать лимфоцит на мазке?",
    answer: "Лимфоцит обычно небольшой: крупное округлое плотное тёмное ядро занимает почти всю клетку, вокруг него остаётся узкий ободок базофильной цитоплазмы.",
    clues: ["округлое плотное тёмное ядро", "очень высокое ядерно-цитоплазматическое соотношение", "узкий базофильный ободок цитоплазмы"],
    function: "Лимфоциты участвуют в иммунных реакциях.",
    avoid: "Не путай с моноцитом: моноцит заметно крупнее и имеет более светлое рыхлое бобовидное/подковообразное ядро.",
  },
  {
    id: "monocyte",
    title: "Моноцит",
    image: "/content/histology/5_Фотографии препаратов/цитология, эмбриология и общая гистология/5.Соед.тк. Кровь.Моноцит..jpg",
    imageLabel: "5.Соед.тк. Кровь.Моноцит..jpg",
    prompt: "Как определить моноцит и не перепутать его с лимфоцитом?",
    answer: "Моноцит — самая крупная из обычных лейкоцитарных клеток крови, около 18–20 мкм. Ищи светлое рыхлое бобовидное/подковообразное ядро и широкую серо-голубую цитоплазму.",
    clues: ["18–20 мкм", "бобовидное или подковообразное светлое ядро", "широкая серо-голубая цитоплазма"],
    function: "Моноциты выходят в ткани и дифференцируются в макрофаги.",
    avoid: "Главная ловушка — размер: если клетка явно крупнее лимфоцита и имеет рыхлое светлое ядро, думай о моноците.",
  },
  {
    id: "lymph-monocyte",
    title: "Лимфоцит + моноцит: сравнение",
    image: "/content/histology/5_Фотографии препаратов/цитология, эмбриология и общая гистология/5.Соед.тк. Кровь.Лимфоцит и моноцит..jpg",
    imageLabel: "5.Соед.тк. Кровь.Лимфоцит и моноцит..jpg",
    prompt: "Какая из клеток лимфоцит, а какая моноцит? Объясни ход определения.",
    answer: "Сначала сравни размер. Лимфоцит меньше, с плотным круглым тёмным ядром и узким ободком цитоплазмы. Моноцит значительно крупнее, его ядро светлее и рыхлее, форма бобовидная/подковообразная, цитоплазмы много.",
    clues: ["лимфоцит меньше", "лимфоцит: плотное круглое ядро", "моноцит: крупный, рыхлое бобовидное ядро"],
    function: "Лимфоцит — иммунные реакции; моноцит — предшественник макрофагов.",
    avoid: "Не ориентируйся только на оттенок цитоплазмы — размер и форма ядра надёжнее.",
  },
  {
    id: "platelets",
    title: "Тромбоциты",
    image: "/content/histology/5_Фотографии препаратов/цитология, эмбриология и общая гистология/5.Соед.тк. Кровь.Тромбоциты..jpg",
    imageLabel: "5.Соед.тк. Кровь.Тромбоциты..jpg",
    prompt: "Как узнать тромбоциты на мазке?",
    answer: "Тромбоциты — очень мелкие безъядерные фрагменты клеток, примерно 2–4 мкм, часто лежат группами. Видны как небольшие зернистые пластинки.",
    clues: ["2–4 мкм", "нет ядра", "часто расположены группами"],
    function: "Участвуют в гемостазе и свертывании крови.",
    avoid: "Не принимай мелкие артефакты окраски за тромбоциты: ищи характерные группы мелких безъядерных фрагментов.",
  },
];

function normalize(text: string) {
  return text.toLowerCase().replace(/ё/g, "е").replace(/й/g, "и").replace(/[^a-zа-я0-9\s-]/gi, " ").replace(/\s+/g, " ").trim();
}

function matches(answer: string, expected: string[]) {
  const value = normalize(answer);
  return expected.filter((term) => value.includes(normalize(term)));
}

export default function BloodPreparationTrainer() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [showGuide, setShowGuide] = useState(false);

  const card = CARDS[index];
  const answered = useMemo(() => Object.values(answers).filter((v) => v.trim()).length, [answers]);
  const isChecked = checked[card.id] ?? false;

  function check() {
    setChecked((current) => ({ ...current, [card.id]: true }));
    setShowGuide(false);
  }

  function next() {
    setIndex((value) => Math.min(value + 1, CARDS.length - 1));
    setShowGuide(false);
  }

  function previous() {
    setIndex((value) => Math.max(value - 1, 0));
    setShowGuide(false);
  }

  function reset() {
    setIndex(0);
    setAnswers({});
    setChecked({});
    setShowGuide(false);
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold">Препараты крови — что и как определить</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Это практическая связка «фото → морфологические признаки → функция». Сначала смотри на препарат и отвечай сам,
          затем открывай разбор. Фотографии взяты из уже загруженной базы препаратов MEDBIOHIM.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="border-b border-[var(--border)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
            <span>Препарат {index + 1} из {CARDS.length}</span>
            <span>Заполнено ответов: {answered} / {CARDS.length}</span>
          </div>
          <h3 className="mt-2 text-lg font-extrabold">{card.title}</h3>
        </div>

        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
            <img
              src={card.image}
              alt={card.imageLabel}
              className="block h-auto max-h-[70vh] w-full object-contain"
              loading="lazy"
            />
          </div>

          <div>
            <div className="text-sm font-bold leading-6">{card.prompt}</div>
            <textarea
              value={answers[card.id] || ""}
              onChange={(event) => {
                setAnswers((current) => ({ ...current, [card.id]: event.target.value }));
                setChecked((current) => ({ ...current, [card.id]: false }));
                setShowGuide(false);
              }}
              placeholder="Опиши, что видишь и по каким признакам определяешь…"
              className="mt-3 min-h-36 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={check}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-bold text-white"
              >
                <Check className="h-4 w-4" /> Проверить
              </button>
              <button
                type="button"
                onClick={() => setShowGuide((value) => !value)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-bold text-slate-700"
              >
                <Eye className="h-4 w-4" /> {showGuide ? "Скрыть разбор" : "Показать разбор"}
              </button>
            </div>

            {isChecked ? (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                <b>Проверка:</b> сравни свой ответ с признаками ниже. В этом режиме не требуется дословное совпадение.
                <div className="mt-2"><b>Ключевые признаки:</b> {matches(answers[card.id] || "", card.clues).length} / {card.clues.length}</div>
              </div>
            ) : null}

            {showGuide ? (
              <div className="mt-3 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <div><b>Как определить:</b> {card.answer}</div>
                <div><b>Функция:</b> {card.function}</div>
                <div><b>Не перепутать:</b> {card.avoid}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-[var(--border)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
          Источник фотографии: <span className="font-semibold">{card.imageLabel}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={previous} disabled={index === 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" /> Назад
        </button>
        <button type="button" onClick={next} disabled={index === CARDS.length - 1} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Следующий препарат <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={reset} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold">
          <RotateCcw className="h-4 w-4" /> Начать заново
        </button>
      </div>
    </section>
  );
}
