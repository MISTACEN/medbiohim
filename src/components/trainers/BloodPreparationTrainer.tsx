"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Eye, Loader2, RotateCcw, RotateCw } from "lucide-react";
import { getTrainerImageUrl, retryTrainerImage } from "@/lib/api";
import { ImageLightbox } from "@/components/media/ImageLightbox";

type PreparationCard = {
  id: string;
  trainerId: string;
  title: string;
  imageLabel: string;
  prompt: string;
  answer: string;
  clues: string[];
  function: string;
  avoid: string;
  whereToLook: string;
};

const CARDS: PreparationCard[] = [
  {
    id: "neutrophil",
    trainerId: "feed-prep-867b72a4b6",
    title: "Нейтрофил",
    imageLabel: "5.Соед.тк. Кровь. Нейтрофил..jpg",
    prompt: "Что за клетка на препарате и по каким признакам ты её определишь?",
    answer: "Нейтрофильный гранулоцит. Сначала найди ядро: у зрелого сегментоядерного нейтрофила обычно 3–5 сегментов. Затем оцени размер около 10–12 мкм и мелкую бледную розово-фиолетовую зернистость.",
    clues: ["нейтрофил", "3–5 сегментов ядра", "мелкая бледная розово-фиолетовая зернистость", "10–12 мкм"],
    function: "По материалу занятия основная функция — фагоцитоз и микрофагальная защита.",
    avoid: "Не путай с эозинофилом: у него 2 крупных сегмента и крупная яркая оксифильная зернистость.",
    whereToLook: "На фото сначала выдели самую подходящую клетку с отчётливым сегментированным ядром, потом рассматривай зернистость.",
  },
  {
    id: "eosinophil-neutrophil",
    trainerId: "feed-prep-a47e9dc83a",
    title: "Эозинофил + нейтрофил: сравнение",
    imageLabel: "5.Соед.тк. Кровь. Эозинофил и нейтр..jpg",
    prompt: "Как на этом препарате отличить эозинофил от нейтрофила?",
    answer: "Эозинофил крупнее, около 12–14 мкм, с двумя крупными сегментами ядра и крупной ярко-розовой/малиновой зернистостью. Нейтрофил около 10–12 мкм, с 3–5 сегментами и мелкой бледной зернистостью.",
    clues: ["эозинофил", "2 сегмента", "крупные яркие оксифильные гранулы", "нейтрофил", "3–5 сегментов"],
    function: "Эозинофил участвует в противопаразитарной защите и регуляции аллергических реакций; нейтрофил — в фагоцитозе.",
    avoid: "Не определяй клетку только по оттенку. Сначала ядро, затем размер, потом зернистость.",
    whereToLook: "На сравнительном фото ищи две разные морфологические комбинации: «2 крупных сегмента + яркие гранулы» и «3–5 сегментов + мелкие гранулы».",
  },
  {
    id: "lymphocyte",
    trainerId: "feed-prep-5a224c48f5",
    title: "Лимфоцит",
    imageLabel: "5.Соед.тк. Кровь.Лимфоцит..jpg",
    prompt: "Как узнать лимфоцит на мазке?",
    answer: "Лимфоцит обычно небольшой. Крупное округлое плотное тёмное ядро занимает почти всю клетку, а вокруг остаётся узкий ободок ярко базофильной цитоплазмы.",
    clues: ["лимфоцит", "округлое плотное тёмное ядро", "высокое ядерно-цитоплазматическое соотношение", "узкий базофильный ободок"],
    function: "Лимфоциты участвуют в иммунных реакциях.",
    avoid: "Не путай с моноцитом: моноцит заметно крупнее, его ядро светлее и рыхлее, а цитоплазмы значительно больше.",
    whereToLook: "Сначала найди клетку с максимально высоким отношением ядра к цитоплазме: почти вся клетка занята плотным округлым ядром.",
  },
  {
    id: "monocyte",
    trainerId: "feed-prep-bca30caf3b",
    title: "Моноцит",
    imageLabel: "5.Соед.тк. Кровь.Моноцит..jpg",
    prompt: "Как определить моноцит и не перепутать его с лимфоцитом?",
    answer: "Моноцит — крупная клетка около 18–20 мкм. Ищи светлое рыхлое бобовидное/подковообразное ядро и широкую серо-голубую («дымчатую») цитоплазму.",
    clues: ["моноцит", "18–20 мкм", "бобовидное или подковообразное светлое ядро", "широкая серо-голубая цитоплазма"],
    function: "Моноциты выходят в ткани и дифференцируются в макрофаги.",
    avoid: "Главная ловушка — размер. Большая клетка с рыхлым светлым бобовидным ядром и большим количеством цитоплазмы — аргумент в пользу моноцита.",
    whereToLook: "Сначала оцени размер относительно соседних форменных элементов, затем форму и плотность ядра.",
  },
  {
    id: "lymph-monocyte",
    trainerId: "feed-prep-a2feb3ec86",
    title: "Лимфоцит + моноцит: сравнение",
    imageLabel: "5.Соед.тк. Кровь.Лимфоцит и моноцит..jpg",
    prompt: "Какая из клеток лимфоцит, а какая моноцит? Объясни ход определения.",
    answer: "Сначала сравни размер. Лимфоцит меньше, его плотное круглое тёмное ядро почти занимает всю клетку. Моноцит значительно крупнее, с более светлым рыхлым бобовидным/подковообразным ядром и широкой цитоплазмой.",
    clues: ["лимфоцит меньше", "плотное круглое ядро", "моноцит", "крупнее", "рыхлое бобовидное ядро"],
    function: "Лимфоцит — иммунные реакции; моноцит — клетка макрофагической системы и предшественник тканевых макрофагов.",
    avoid: "Не ориентируйся только на оттенок. Размер + ядро надёжнее для этой пары.",
    whereToLook: "Сравни две клетки прямо между собой: сначала размер, затем ядро, затем объём цитоплазмы.",
  },
  {
    id: "platelets",
    trainerId: "feed-prep-60e72c3e7e",
    title: "Тромбоциты",
    imageLabel: "5.Соед.тк. Кровь.Тромбоциты..jpg",
    prompt: "Как узнать тромбоциты на мазке?",
    answer: "Тромбоциты — очень мелкие безъядерные фрагменты клеток, примерно 2–4 мкм, часто лежат группами и выглядят как небольшие зернистые пластинки.",
    clues: ["тромбоциты", "2–4 мкм", "безъядерные фрагменты", "группами"],
    function: "Участвуют в гемостазе и свертывании крови.",
    avoid: "Не принимай случайные точки или артефакты окраски за тромбоциты: ищи характерные мелкие безъядерные фрагменты и их скопления.",
    whereToLook: "В отличие от лейкоцитов ищи самые мелкие элементы без ядра; на хорошем поле они часто видны группами.",
  },
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/й/g, "и")
    .replace(/[^a-zа-я0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const [showAlgorithm, setShowAlgorithm] = useState(true);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(true);
  const [photoRetrying, setPhotoRetrying] = useState(false);

  const card = CARDS[index];
  const answered = useMemo(() => Object.values(answers).filter((v) => v.trim()).length, [answers]);
  const isChecked = checked[card.id] ?? false;
  const matched = matches(answers[card.id] || "", card.clues);

  useEffect(() => {
    let alive = true;
    setPhoto(null);
    setPhotoLoading(true);
    setPhotoRetrying(false);
    void getTrainerImageUrl(card.trainerId).then((url) => {
      if (!alive) return;
      setPhoto(url);
      setPhotoLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [card.trainerId]);

  async function retryPhoto() {
    if (photoRetrying) return;
    setPhotoRetrying(true);
    setPhoto(null);
    const url = await retryTrainerImage(card.trainerId);
    setPhoto(url);
    setPhotoLoading(false);
    setPhotoRetrying(false);
  }

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
        <h2 className="text-xl font-extrabold">Препараты крови — что, где и как определить</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Практика построена по связке «реальный препарат → признаки клетки → функция → дифференциация».
          Сначала ответь сам, затем открой разбор. Фото берутся из канонического histology-контента через защищённый
          trainer-image pipeline.
        </p>
      </div>

      {showAlgorithm ? (
        <section className="rounded-3xl border border-indigo-100 bg-indigo-50/70 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-indigo-950">Экспресс-алгоритм определения</div>
              <p className="mt-1 text-sm leading-6 text-indigo-900">
                1) найди ядро → 2) оцени размер → 3) проверь зернистость → 4) оцени цитоплазму/форму ядра →
                5) назови функцию. Это рабочий порядок из учебной памятки по определению клеток.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAlgorithm(false)}
              className="shrink-0 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700"
            >
              Свернуть
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setShowAlgorithm(true)}
          className="inline-flex rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700"
        >
          Показать алгоритм определения
        </button>
      )}

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
            {photo ? (
              <ImageLightbox
                src={photo}
                alt={card.imageLabel}
                title={card.title}
                caption={"Реальный препарат · " + card.imageLabel}
                className="w-full"
                imageClassName="mx-auto max-h-[70vh] min-h-[320px] w-full object-contain"
              />
            ) : photoLoading ? (
              <div className="flex min-h-[320px] items-center justify-center text-sm text-white/70">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Загружаем фотографию препарата…
              </div>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center p-6 text-center text-white/80">
                <div className="text-sm font-semibold">Фотография временно недоступна</div>
                <button
                  type="button"
                  onClick={() => void retryPhoto()}
                  disabled={photoRetrying}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15 disabled:opacity-50"
                >
                  <RotateCw className={"h-4 w-4 " + (photoRetrying ? "animate-spin" : "")} />
                  Повторить
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="text-sm font-bold leading-6">{card.prompt}</div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <b className="text-slate-800">Куда смотреть:</b> {card.whereToLook}
            </div>

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
              <div className="mt-3 rounded-2xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] p-4 text-sm leading-6 text-[var(--status-ok-fg)]">
                <b>Самопроверка:</b> сверяем смысловые ориентиры, а не дословную формулировку.
                <div className="mt-1"><b>Ключевые признаки:</b> {matched.length} / {card.clues.length}</div>
              </div>
            ) : null}

            {showGuide ? (
              <div className="mt-3 space-y-3 rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-4 text-sm leading-6 text-[var(--status-warn-fg)]">
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
