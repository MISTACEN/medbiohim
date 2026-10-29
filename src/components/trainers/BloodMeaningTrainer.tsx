"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, RotateCcw, Sparkles } from "lucide-react";

type Concept = {
  label: string;
  variants: string[];
};

type MeaningQuestion = {
  id: string;
  question: string;
  sourceAnswer: string;
  concepts: Concept[];
};

const QUESTIONS: MeaningQuestion[] = [
  {
    id: "blood-functions",
    question: "Какие основные функции выполняет кровь?",
    sourceAnswer: "Транспортная (дыхательная, трофическая, экскреторная, регуляторная), защитная (гемостаз и иммунная защита) и гомеостатическая.",
    concepts: [
      { label: "транспортная", variants: ["транспорт", "транспортная", "перенос"] },
      { label: "защитная", variants: ["защит", "гемостаз", "иммун"] },
      { label: "гомеостатическая", variants: ["гомеостат", "поддержание гомеостаза"] },
    ],
  },
  {
    id: "blood-composition",
    question: "Из чего состоит кровь как соединительная ткань?",
    sourceAnswer: "Из клеток (эритроциты, лейкоциты, тромбоциты) и межклеточного вещества — жидкой плазмы; волокна в нормальном состоянии отсутствуют.",
    concepts: [
      { label: "форменные элементы", variants: ["эритроцит", "лейкоцит", "тромбоцит", "клетк"] },
      { label: "плазма", variants: ["плазм"] },
      { label: "волокна отсутствуют", variants: ["волокн", "нет волокон", "волокна отсутств"] },
    ],
  },
  {
    id: "hemogram",
    question: "Что такое гемограмма?",
    sourceAnswer: "Гемограмма — показатели количества форменных элементов крови в 1 л крови.",
    concepts: [
      { label: "количество форменных элементов", variants: ["количеств", "форменных элемент", "клеток крови"] },
      { label: "в 1 литре крови", variants: ["1 л", "1л", "литр крови"] },
    ],
  },
  {
    id: "leukocyte-formula",
    question: "Что показывает лейкоцитарная формула?",
    sourceAnswer: "Процентное соотношение разных видов лейкоцитов в крови.",
    concepts: [
      { label: "процентное соотношение", variants: ["процент", "соотношен", "%"] },
      { label: "разные виды лейкоцитов", variants: ["видов лейкоцит", "типы лейкоцит", "лейкоцит"] },
    ],
  },
  {
    id: "erythrocyte",
    question: "Почему эритроцит хорошо подходит для переноса газов?",
    sourceAnswer: "Эритроцит — двояковогнутый диск без ядра и органелл в зрелом состоянии; содержит гемоглобин и выполняет дыхательную функцию — перенос газов.",
    concepts: [
      { label: "двояковогнутая форма", variants: ["двояковогнут", "дискоцит", "двояковогнутый диск"] },
      { label: "гемоглобин", variants: ["гемоглобин", "hb"] },
      { label: "перенос газов", variants: ["перенос газ", "транспорт газ", "дыхательн"] },
    ],
  },
  {
    id: "platelet",
    question: "Какова главная роль тромбоцитов и как они участвуют в гемостазе?",
    sourceAnswer: "Тромбоциты участвуют в свертывании крови, образуют тромб и выделяют факторы свертывания; их функции происходят внутри сосудистого русла.",
    concepts: [
      { label: "свертывание", variants: ["свертыван", "свёртыван", "коагуляц"] },
      { label: "тромб", variants: ["тромб", "тромбообраз"] },
      { label: "факторы свертывания", variants: ["фактор свертыван", "фактор свёртыван"] },
    ],
  },
  {
    id: "leukocyte-groups",
    question: "На какие две группы делятся лейкоциты по наличию гранул?",
    sourceAnswer: "На гранулоциты (зернистые) и агранулоциты (незернистые). Гранулоциты включают нейтрофилы, эозинофилы и базофилы; агранулоциты — лимфоциты и моноциты.",
    concepts: [
      { label: "гранулоциты", variants: ["гранулоцит", "зернист"] },
      { label: "агранулоциты", variants: ["агранулоцит", "незернист"] },
      { label: "примеры", variants: ["нейтрофил", "эозинофил", "базофил", "лимфоцит", "моноцит"] },
    ],
  },
  {
    id: "neutrophil",
    question: "Как по морфологии узнать нейтрофил и с чем связана его функция?",
    sourceAnswer: "Нейтрофил имеет 3 и более сегментов ядра, размер около 10–11 мкм, нейтрофильную специфическую зернистость; основная функция — фагоцитоз микроорганизмов и участие в антигистаминных реакциях и гнойном воспалении.",
    concepts: [
      { label: "3 и более сегмента", variants: ["3 и более", "3+", "сегмент", "сегментированное ядро"] },
      { label: "10–11 мкм", variants: ["10-11", "10 11", "10–11", "10 11 мкм"] },
      { label: "фагоцитоз", variants: ["фагоцит", "поглощение микроорганизм"] },
    ],
  },
  {
    id: "eosinophil",
    question: "Какие главные признаки и функции эозинофила нужно помнить?",
    sourceAnswer: "Эозинофил около 12–14 мкм, имеет ядро из 2 крупных сегментов («боксерские перчатки»/«наушники») и эозинофильную зернистость; участвует в уничтожении микроорганизмов, гельминтов и простейших и снижает аллергические реакции.",
    concepts: [
      { label: "12–14 мкм", variants: ["12-14", "12 14", "12–14", "12 14 мкм"] },
      { label: "2 сегмента", variants: ["2 сегмент", "два сегмент", "боксерские перчатки", "наушники"] },
      { label: "аллергические реакции", variants: ["аллерг", "гистамин", "противоаллерг"] },
    ],
  },
  {
    id: "basophil",
    question: "Какие признаки отличают базофил и какова его функция?",
    sourceAnswer: "Базофил около 11–12 мкм, ядро слабо разделено примерно на 3 сегмента, цитоплазма содержит крупные базофильные/метахроматические гранулы; гепарин действует как антикоагулянт, гистамин повышает проницаемость сосудов и соединительной ткани.",
    concepts: [
      { label: "11–12 мкм", variants: ["11-12", "11 12", "11–12", "11 12 мкм"] },
      { label: "крупные тёмные гранулы", variants: ["крупн", "гранул", "метахромат", "базофильн"] },
      { label: "гепарин и гистамин", variants: ["гепарин", "гистамин"] },
    ],
  },
  {
    id: "lymphocyte",
    question: "Как по морфологии и функции описать лимфоцит?",
    sourceAnswer: "Лимфоциты небольшие (4,5–10 мкм и более), с округлым плотным тёмным ядром и ярко базофильной цитоплазмой; основная функция — участие в иммунных реакциях.",
    concepts: [
      { label: "округлое плотное ядро", variants: ["округл", "плотн", "темное ядро", "гетерохромат"] },
      { label: "высокое ядерно-цитоплазматическое соотношение", variants: ["ядро занимает", "высокое ядерно", "мало цитоплазм", "большая часть клетки"] },
      { label: "иммунные реакции", variants: ["иммун"] },
    ],
  },
  {
    id: "monocyte",
    question: "Как распознать моноцит и чем объясняется его функция?",
    sourceAnswer: "Моноцит крупный, около 18–20 мкм, с бобовидным светлым рыхлым ядром и большим количеством цитоплазмы; он дифференцируется в макрофаги и формирует макрофагическую систему.",
    concepts: [
      { label: "18–20 мкм", variants: ["18-20", "18 20", "18–20", "18 20 мкм"] },
      { label: "бобовидное рыхлое ядро", variants: ["бобовид", "рыхл", "светлое ядро", "эухроматин"] },
      { label: "макрофаги", variants: ["макрофаг", "макрофагическ"] },
    ],
  },
  {
    id: "changes",
    question: "Какими терминами называют увеличение и уменьшение количества основных лейкоцитов?",
    sourceAnswer: "Увеличение: лейкоцитоз, нейтрофилия, эозинофилия, базофилия, лимфоцитоз, моноцитоз; для увеличения палочкоядерных нейтрофилов — сдвиг лейкоцитарной формулы влево. Уменьшение: лейкопения, нейтропения, лимфоцитопения, моноцитопения.",
    concepts: [
      { label: "увеличение: -цитоз/-филия", variants: ["цитоз", "филия", "лейкоцитоз", "нейтрофилия", "эозинофилия", "базофилия", "лимфоцитоз", "моноцитоз"] },
      { label: "сдвиг влево", variants: ["сдвиг", "влево"] },
      { label: "уменьшение: -пения", variants: ["пения", "лейкопения", "нейтропения", "лимфоцитопения", "моноцитопения"] },
    ],
  },
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/й/g, "и")
    .replace(/[^a-zа-я0-9%+.\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function conceptMatched(answer: string, variants: string[]) {
  const value = normalize(answer);
  return variants.some((variant) => value.includes(normalize(variant)));
}

function evaluate(question: MeaningQuestion, answer: string) {
  const matched = question.concepts.filter((concept) => conceptMatched(answer, concept.variants));
  const percent = Math.round((matched.length / question.concepts.length) * 100);
  const quality = percent >= 90 ? "Отлично" : percent >= 66 ? "Хорошо" : percent >= 33 ? "Есть пробелы" : "Нужно повторить";
  return { matched, missing: question.concepts.filter((concept) => !conceptMatched(answer, concept.variants)), percent, quality };
}

export function BloodMeaningTrainer() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, ReturnType<typeof evaluate>>>({});
  const [showReference, setShowReference] = useState(false);

  const question = QUESTIONS[index];
  const evaluation = checked[question.id] || null;
  const answeredCount = useMemo(() => Object.keys(answers).filter((key) => answers[key]?.trim()).length, [answers]);

  function check() {
    const answer = answers[question.id] || "";
    setChecked((current) => ({ ...current, [question.id]: evaluate(question, answer) }));
    setShowReference(false);
  }

  function next() {
    setIndex((current) => Math.min(current + 1, QUESTIONS.length - 1));
    setShowReference(false);
  }

  function previous() {
    setIndex((current) => Math.max(current - 1, 0));
    setShowReference(false);
  }

  function reset() {
    setIndex(0);
    setAnswers({});
    setChecked({});
    setShowReference(false);
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-extrabold">
          <Sparkles className="h-5 w-5 text-[var(--primary)]" />
          Ответ по смыслу
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Здесь нет вариантов ответа. Прочитай вопрос и своими словами объясни суть так, как отвечал бы на занятии.
          Проверка смотрит на ключевые идеи ответа, а не на дословное совпадение и орфографию.
        </p>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
          <span>Вопрос {index + 1} из {QUESTIONS.length}</span>
          <span>Отвечено: {answeredCount} / {QUESTIONS.length}</span>
        </div>

        <h3 className="mt-4 text-lg font-bold leading-7 text-slate-900">{question.question}</h3>

        <textarea
          value={answers[question.id] || ""}
          onChange={(e) => {
            setAnswers((current) => ({ ...current, [question.id]: e.target.value }));
            setChecked((current) => {
              const copy = { ...current };
              delete copy[question.id];
              return copy;
            });
            setShowReference(false);
          }}
          placeholder="Напиши ответ своими словами…"
          className="mt-4 min-h-44 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={check}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-bold text-white"
          >
            <Check className="h-4 w-4" /> Проверить ответ
          </button>
          <button
            type="button"
            onClick={() => {
              setShowReference((value) => !value);
              setChecked((current) => ({ ...current, [question.id]: evaluate(question, answers[question.id] || "") }));
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-bold text-slate-700"
          >
            {showReference ? "Скрыть эталон" : "Показать эталон"}
          </button>
        </div>

        {evaluation ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Понимание</div>
                <div className="mt-1 text-xl font-extrabold text-slate-900">{evaluation.percent}% · {evaluation.quality}</div>
              </div>
              <div className="text-xs font-semibold text-slate-600">
                Учтено ключевых идей: {evaluation.matched.length} / {question.concepts.length}
              </div>
            </div>
            {evaluation.missing.length > 0 ? (
              <div className="mt-3 text-sm leading-6 text-slate-700">
                <b>Что ещё нужно вспомнить:</b> {evaluation.missing.map((concept) => concept.label).join(", ")}.
              </div>
            ) : (
              <div className="mt-3 text-sm font-semibold text-[var(--status-ok-fg)]">Все ключевые идеи из эталона отражены.</div>
            )}
          </div>
        ) : null}

        {showReference ? (
          <div className="mt-4 rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-4 text-sm leading-6 text-[var(--status-warn-fg)]">
            <div className="font-extrabold">Эталон по 4.Кровь.docx</div>
            <div className="mt-2">{question.sourceAnswer}</div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={previous}
          disabled={index === 0}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Назад
        </button>
        <button
          type="button"
          onClick={next}
          disabled={index === QUESTIONS.length - 1}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Следующий вопрос <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700"
        >
          <RotateCcw className="h-4 w-4" /> Начать заново
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600">
        <b>Как работает проверка:</b> одна мысль может быть сформулирована разными словами. Система ищет смысловые группы, допускает обычные формы слов и не снижает результат за орфографию.
        Это учебная самопроверка по ключевым идеям источника, а не медицинская диагностика и не полнофункциональная ИИ-экспертиза.
      </div>
    </section>
  );
}

export default BloodMeaningTrainer;
