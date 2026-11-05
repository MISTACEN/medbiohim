"use client";

/**
 * Эмбриологический таймлайн (§6.6 задания агента №2): пошаговая
 * последовательность развития от гаметогенеза до плацентации.
 *
 * Схемы — учебные, намеренно упрощённые (геометрические обозначения слоёв и
 * структур); фактология — стандартный курс эмбриологии (сроки по
 * акушерскому/эмбриональному возрасту указаны как диапазон недели).
 * Экзаменационный режим: названия этапов скрыты, студент определяет стадию
 * по описанию. Прогресс существующих атласов не заменяется — модуль
 * самостоятельный и регистрируется в общей системе.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pause, Play, RotateCcw } from "lucide-react";

type Stage = {
  id: string;
  title: string;
  timing: string;
  description: string;
  terms: string[];
  /** Ключевая структура для экзаменационной проверки. */
  answer: string;
};

const STAGES: Stage[] = [
  {
    id: "gametogenesis",
    title: "Гаметогенез",
    timing: "до оплодотворения",
    description:
      "Созревание половых клеток путём мейоза: сперматогенез в семенных канальцах, овогенез в яичнике. Важнейший итог — гаплоидный набор хромосом и кроссинговер, обеспечивающий генетическое разнообразие. Ооцит II завершает мейоз только после оплодотворения.",
    terms: ["мейоз", "кроссинговер", "ооцит II", "сперматозоид"],
    answer: "Гаметогенез",
  },
  {
    id: "fertilization",
    title: "Оплодотворение",
    timing: "первые 24 часа",
    description:
      "Слияние гаплоидных гамет в верхних отделах маточной трубы: акросомная реакция, кортикальная реакция (блок полиспермии), завершение мейоза ооцита. Образуется зигота с диплоидным набором — начало нового организма.",
    terms: ["акросомная реакция", "блок полиспермии", "зигота", "амфимиксис"],
    answer: "Оплодотворение",
  },
  {
    id: "cleavage",
    title: "Дробление и морула",
    timing: "1–3 сутки",
    description:
      "Митотические деления зиготы без роста: бластомеры становятся всё мельче. С 3–16 бластомеров зародыш — плотный комочек (морула). Дробление идёт в трубе под оболочкой оплодотворения.",
    terms: ["бластомеры", "морула", "полное неравномерное дробление"],
    answer: "Дробление и морула",
  },
  {
    id: "blastocyst",
    title: "Бластоциста",
    timing: "4–5 сутки",
    description:
      "Внутри появляется полость (бластоцель), бластомеры расходятся к периферии. Различают эмбриобласт (из него развивается зародыш) и трофобласт (источник хориона и плаценты). Зародыш спускается в матку.",
    terms: ["бластоцель", "эмбриобласт", "трофобласт"],
    answer: "Бластоциста",
  },
  {
    id: "implantation",
    title: "Имплантация",
    timing: "6–7 сутки",
    description:
      "Прикрепление и погружение бластоцисты в подготовленный эндометрий (секреторная фаза). Трофобласт образует ворсины и начинает секретировать хорионический гонадотропин (β-ХГЧ — основа тестов беременности).",
    terms: ["эндометрий", "ворсины трофобласта", "β-ХГЧ"],
    answer: "Имплантация",
  },
  {
    id: "bilaminar",
    title: "Двухслойный зародыш",
    timing: "2-я неделя",
    description:
      "Эмбриобласт расщепляется на эпибласт и гипобласт — двуслойный зародышевый диск. Формируются амниотический пузырь и желточный мешок; от внезародышевой мезодермы — соединительная ножка (будущая пуповина).",
    terms: ["эпибласт", "гипобласт", "амнион", "желточный мешок"],
    answer: "Двухслойный зародыш",
  },
  {
    id: "gastrulation",
    title: "Гаструляция",
    timing: "3-я неделя",
    description:
      "Из эпибласта через первичную полоску клетки мигрируют внутрь — образуются три зародышевых листка. Эктодерма → нервная система и эпидермис; мезодерма → мышцы, кости, сосуды, почки; энтодерма → эпителий ЖКТ и дыхательных путей. Первичная полоска — организатор событий (узелок — прехордальная пластинка).",
    terms: ["первичная полоска", "эктодерма", "мезодерма", "энтодерма"],
    answer: "Гаструляция",
  },
  {
    id: "neurulation",
    title: "Нейруляция",
    timing: "3–4 недели",
    description:
      "Хорда индуцирует утолщение эктодермы — нервную пластинку, которая сворачивается в нервную трубку. Незаросшие концы — нейропоры; нарушение закрытия — пороки (spina bifida, анэнцефалия). Параллельно закладываются сомиты (миотом, склеротом, дерматом).",
    terms: ["нервная трубка", "нейропоры", "хорда", "сомиты"],
    answer: "Нейруляция",
  },
  {
    id: "organogenesis",
    title: "Органогенез (эмбриональный период)",
    timing: "4–8 недель",
    description:
      "Закладка всех основных органов из трёх листков. Период максимальной чувствительности к тератогенам (алкоголь, ретиноиды, краснуха, талидомид — исторический пример). К 8-й неделе зародыш приобретает человеческий облик; с 9-й недели наступает плодный период (fetus).",
    terms: ["критические периоды", "тератогены", "плодный период"],
    answer: "Органогенез (эмбриональный период)",
  },
  {
    id: "placentation",
    title: "Плацентация",
    timing: "2–12 недель (формирования)",
    description:
      "Хорион образует ворсины, врастающие в эндометрий; материнская и плодовая крови не смешиваются — обмен через плацентарный барьер. Функции: газообмен, питание, гормоны (β-ХГЧ, прогестерон, эстрогены), барьерная защита. К 12 неделям плацента сформирована.",
    terms: ["хорион", "плацентарный барьер", "пупочные сосуды"],
    answer: "Плацентация",
  },
];

/** Схема стадии: намеренно геометрическая, подписана «схематично». */
function StageSchematic({ index }: { index: number }) {
  const label = STAGES[index].title;
  switch (STAGES[index].id) {
    case "gametogenesis":
      return (
        <g>
          <circle cx="34" cy="50" r="14" fill="none" stroke="var(--primary)" strokeWidth="1.6" />
          <circle cx="34" cy="50" r="7" fill="var(--primary)" opacity="0.5" />
          <text x="34" y="70" fontSize="4" textAnchor="middle" fill="var(--muted)">ооцит II (n)</text>
          <path d="M62 44 C 70 40, 78 40, 86 44" fill="none" stroke="var(--status-warn-fg)" strokeWidth="1.2" />
          <circle cx="88" cy="45" r="4" fill="var(--status-warn-fg)" opacity="0.7" />
          <text x="72" y="36" fontSize="4" textAnchor="middle" fill="var(--muted)">сперматозоид (n)</text>
        </g>
      );
    case "fertilization":
      return (
        <g>
          <circle cx="50" cy="50" r="17" fill="none" stroke="var(--primary)" strokeWidth="1.6" />
          <circle cx="44" cy="52" r="8" fill="var(--primary)" opacity="0.5" />
          <circle cx="58" cy="47" r="3.6" fill="var(--status-warn-fg)" />
          <text x="50" y="74" fontSize="4" textAnchor="middle" fill="var(--muted)">зигота (2n)</text>
        </g>
      );
    case "cleavage":
      return (
        <g>
          {[[38, 44], [50, 44], [62, 44], [38, 56], [50, 56], [62, 56], [50, 32], [50, 68]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="6.5" fill="var(--primary)" opacity="0.45" stroke="var(--primary)" strokeWidth="0.8" />
          ))}
          <text x="50" y="84" fontSize="4" textAnchor="middle" fill="var(--muted)">морула</text>
        </g>
      );
    case "blastocyst":
      return (
        <g>
          <circle cx="50" cy="50" r="24" fill="none" stroke="var(--primary)" strokeWidth="1.4" />
          <circle cx="38" cy="46" r="2.6" fill="var(--primary)" opacity="0.6" />
          <circle cx="36" cy="56" r="2.6" fill="var(--primary)" opacity="0.6" />
          <circle cx="42" cy="62" r="2.6" fill="var(--primary)" opacity="0.6" />
          <circle cx="62" cy="58" r="7" fill="var(--status-ok-fg)" opacity="0.55" />
          <text x="62" y="70" fontSize="3.6" textAnchor="middle" fill="var(--muted)">эмбриобласт</text>
          <text x="78" y="30" fontSize="3.6" textAnchor="middle" fill="var(--muted)">трофобласт</text>
        </g>
      );
    case "implantation":
      return (
        <g>
          <rect x="0" y="58" width="100" height="26" fill="var(--status-warn-bg)" opacity="0.6" />
          <text x="50" y="92" fontSize="3.6" textAnchor="middle" fill="var(--muted)">эндометрий</text>
          <circle cx="50" cy="50" r="16" fill="none" stroke="var(--primary)" strokeWidth="1.4" />
          <circle cx="56" cy="55" r="5" fill="var(--status-ok-fg)" opacity="0.55" />
          <path d="M36 62 q 8 4 16 2" stroke="var(--status-critical-fg)" strokeWidth="1" fill="none" />
          <text x="30" y="44" fontSize="3.6" fill="var(--muted)">ворсины</text>
        </g>
      );
    case "bilaminar":
      return (
        <g>
          <ellipse cx="50" cy="46" rx="26" ry="6" fill="var(--primary)" opacity="0.55" />
          <text x="50" y="40" fontSize="3.6" textAnchor="middle" fill="var(--muted)">эпибласт</text>
          <ellipse cx="50" cy="58" rx="22" ry="5" fill="var(--status-warn-fg)" opacity="0.5" />
          <text x="50" y="69" fontSize="3.6" textAnchor="middle" fill="var(--muted)">гипобласт</text>
          <rect x="20" y="66" width="16" height="14" rx="3" fill="none" stroke="var(--muted)" strokeWidth="0.8" />
          <text x="28" y="86" fontSize="3.4" textAnchor="middle" fill="var(--muted)">амнион</text>
          <rect x="64" y="66" width="16" height="14" rx="3" fill="none" stroke="var(--muted)" strokeWidth="0.8" />
          <text x="72" y="86" fontSize="3.4" textAnchor="middle" fill="var(--muted)">желточный мешок</text>
        </g>
      );
    case "gastrulation":
      return (
        <g>
          <rect x="18" y="34" width="64" height="9" fill="var(--primary)" opacity="0.6" />
          <text x="84" y="40" fontSize="3.4" fill="var(--muted)">эктодерма</text>
          <rect x="18" y="45" width="64" height="9" fill="var(--status-warn-fg)" opacity="0.5" />
          <text x="84" y="51" fontSize="3.4" fill="var(--muted)">мезодерма</text>
          <rect x="18" y="56" width="64" height="9" fill="var(--status-ok-fg)" opacity="0.5" />
          <text x="84" y="62" fontSize="3.4" fill="var(--muted)">энтодерма</text>
          <line x1="50" y1="34" x2="50" y2="65" stroke="var(--status-critical-fg)" strokeWidth="1.4" />
          <text x="50" y="28" fontSize="3.6" textAnchor="middle" fill="var(--status-critical-fg)">первичная полоска</text>
        </g>
      );
    case "neurulation":
      return (
        <g>
          <path d="M30 40 Q50 30 70 40 Q50 44 30 40 Z" fill="var(--primary)" opacity="0.5" />
          <ellipse cx="50" cy="50" rx="8" ry="5" fill="none" stroke="var(--primary)" strokeWidth="1.4" />
          <text x="50" y="27" fontSize="3.6" textAnchor="middle" fill="var(--muted)">нервная трубка</text>
          {[26, 36, 46, 56, 66, 76].map((x) => (
            <rect key={x} x={x} y="60" width="7" height="7" rx="1.5" fill="var(--status-warn-fg)" opacity="0.5" />
          ))}
          <text x="50" y="76" fontSize="3.4" textAnchor="middle" fill="var(--muted)">сомиты</text>
        </g>
      );
    case "organogenesis":
      return (
        <g>
          <ellipse cx="50" cy="52" rx="20" ry="26" fill="none" stroke="var(--primary)" strokeWidth="1.4" />
          <circle cx="50" cy="34" r="7" fill="var(--primary)" opacity="0.4" />
          <text x="50" y="36" fontSize="3.4" textAnchor="middle" fill="#fff">B₁</text>
          <ellipse cx="50" cy="52" rx="9" ry="6" fill="var(--status-warn-fg)" opacity="0.5" />
          <rect x="44" y="62" width="12" height="9" rx="2" fill="var(--status-ok-fg)" opacity="0.5" />
          <text x="50" y="86" fontSize="3.6" textAnchor="middle" fill="var(--muted)">закладка нервной системы, сердца, кишечной трубки</text>
        </g>
      );
    case "placentation":
      return (
        <g>
          <rect x="0" y="20" width="100" height="10" fill="var(--status-warn-bg)" opacity="0.7" />
          <text x="50" y="16" fontSize="3.4" textAnchor="middle" fill="var(--muted)">материнская часть (эндометрий)</text>
          {[[28, 30], [50, 30], [72, 30]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y} q 2 10 -2 22`} stroke="var(--primary)" strokeWidth="1.2" fill="none" />
          ))}
          <rect x="0" y="62" width="100" height="8" fill="var(--status-ok-bg)" opacity="0.8" />
          <text x="50" y="78" fontSize="3.4" textAnchor="middle" fill="var(--muted)">плодовая часть (хорион) · барьер: крови не смешиваются</text>
        </g>
      );
    default:
      return <text x="50" y="50" textAnchor="middle" fill="var(--muted)">{label}</text>;
  }
}

export function EmbryologyTimeline() {
  const count = STAGES.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [examMode, setExamMode] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);

  const stage = STAGES[index];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
      setAnswer(null);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [playing, count]);

  const options = useMemo(() => {
    const others = STAGES.map((_, i) => i).filter((i) => i !== index);
    const picked = [others[(index + 2) % others.length], others[(index + 5) % others.length], others[(index + 7) % others.length]];
    const list = [index, ...picked].map((i) => STAGES[i].title);
    const shift = (index % list.length) + 1;
    return list.slice(shift).concat(list.slice(0, shift));
  }, [index]);
  const correctIndex = options.indexOf(stage.title);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {STAGES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setIndex(i);
              setAnswer(null);
            }}
            aria-label={s.title}
            aria-current={i === index}
            className={[
              "h-2.5 w-8 rounded-full border transition",
              i === index ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border)] hover:border-[var(--primary)]",
            ].join(" ")}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">
            Этап {index + 1}/{count}
            {examMode ? " · экзаменационный режим" : `: ${stage.title}`}
            <span className="ml-2 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--primary)]">{stage.timing}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setExamMode((v) => !v);
              setAnswer(null);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--primary-soft)]"
            aria-pressed={examMode}
          >
            {examMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {examMode ? "Показать названия" : "Экзаменационный режим"}
          </button>
        </div>

        <svg viewBox="0 0 100 100" className="mx-auto h-64 w-full max-w-md" role="img" aria-label={`Схема этапа ${index + 1}`}>
          <StageSchematic index={index} />
          <text x="98" y="97" fontSize="2.6" textAnchor="end" fill="var(--muted)">схематично</text>
        </svg>

        {examMode ? (
          <div className="mt-2">
            <p className="text-sm font-semibold">Какой этап развития показан?</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {options.map((option, i) => {
                const isCorrect = i === correctIndex;
                const selected = answer === i;
                const showState = answer !== null && (selected || isCorrect);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswer(i)}
                    className={[
                      "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm",
                      showState && isCorrect
                        ? "border-[var(--status-ok-fg)] bg-[var(--status-ok-bg)]"
                        : selected && answer !== null && !isCorrect
                          ? "border-[var(--status-critical-fg)] bg-[var(--status-critical-bg)]"
                          : "border-[var(--border)] hover:border-[var(--primary)]",
                    ].join(" ")}
                  >
                    <span>{option}</span>
                    {showState && isCorrect ? <span className="text-[var(--status-ok-fg)]">✓</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-base font-bold">{stage.title}</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{stage.description}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stage.terms.map((term) => (
                <span key={term} className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
                  {term}
                </span>
              ))}
            </div>
          </div>
        )}

        {answer !== null && examMode ? (
          <p className="mt-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs leading-5">
            <span className="font-semibold">{answer === correctIndex ? "Верно. " : "Пока неверно. "}</span>
            {stage.description}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIndex((i) => (i - 1 + count) % count);
              setAnswer(null);
            }}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--primary-soft)]"
          >
            <ChevronLeft className="h-4 w-4" /> Назад
          </button>
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white"
            aria-pressed={playing}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playing ? "Пауза" : "Автопрогон"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIndex((i) => (i + 1) % count);
              setAnswer(null);
            }}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--primary-soft)]"
          >
            Далее <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIndex(0);
              setAnswer(null);
              setPlaying(false);
            }}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs hover:bg-[var(--primary-soft)]"
            aria-label="К началу"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="rounded-2xl border border-dashed border-[var(--border)] p-3 text-xs leading-5 text-[var(--muted)]">
        Схемы — учебные упрощения, не медицинские иллюстрации. Сроки указаны по классическому курсу эмбриологии
        (эмбриональный период 1–8 недель, далее плодный). Источник фактологии: стандартный курс эмбриологии
        человека; для сдачи экзамена сверяйтесь с учебником кафедры.
      </p>
    </div>
  );
}
