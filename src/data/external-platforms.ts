/**
 * Reverse-engineered map of the external study platforms linked from the
 * university hub. Only public navigation and section names are recorded — no
 * copyrighted content is copied and no paywall is bypassed. Deep links open the
 * original platform; `ours` points to the MEDBIOHIM equivalent where one exists.
 */

export type ExternalLink = {
  title: string;
  href: string;
  note?: string;
};

export type ExternalCategory = {
  title: string;
  description: string;
  links: ExternalLink[];
  /** К каким предметам сайта относится категория (canonical slug-группы). */
  tags?: string[];
};

export type ExternalPlatform = {
  slug: string;
  title: string;
  href: string;
  tagline: string;
  description: string;
  note: string;
  accent: "violet" | "emerald";
  stats: { label: string; value: string }[];
  categories: ExternalCategory[];
  adopt: { feature: string; oursHref?: string; oursLabel?: string }[];
};

export const NEOFAMILY: ExternalPlatform = {
  slug: "neofamily",
  title: "NeoFamily Lab",
  href: "https://lab.neofamily.ru/",
  tagline: "Интерактивные симуляции и тренажёры ЕГЭ",
  description:
    "Бесплатная лаборатория с анимациями и мини-симуляциями по биологии, химии и русскому языку. Каждая тема — отдельный интерактив плюс тренажёр формата ЕГЭ с разбором.",
  note: "Внешняя платформа, материалы принадлежат правообладателям. Изучаем как эталон наглядности, не копируем контент.",
  accent: "violet",
  stats: [
    { label: "Предмета", value: "3" },
    { label: "Тем-симуляций", value: "40+" },
    { label: "Формат", value: "ЕГЭ-2027" },
  ],
  categories: [
    {
      title: "Биология: клетка и молекулы",
      description: "Симуляции процессов с пошаговой анимацией — от мембраны до синтеза белка.",
      tags: ["biology", "histology", "physiology"],
      links: [
        { title: "Строение клетки: органоиды", href: "https://lab.neofamily.ru/cell-structure/", note: "интерактивная схема" },
        { title: "Фосфолипидный бислой", href: "https://lab.neofamily.ru/bilayer/", note: "самосборка мембраны" },
        { title: "Натрий-калиевый насос", href: "https://lab.neofamily.ru/na-k-pump/", note: "симулятор транспорта" },
        { title: "Фермент и субстрат", href: "https://lab.neofamily.ru/enzyme/", note: "скорость реакции" },
        { title: "Репликация ДНК", href: "https://lab.neofamily.ru/replication/" },
        { title: "Транскрипция и трансляция", href: "https://lab.neofamily.ru/translation/", note: "симулятор биосинтеза" },
        { title: "АТФ: заряди молекулу", href: "https://lab.neofamily.ru/atp/" },
      ],
    },
    {
      title: "Биология: генетика и организм",
      tags: ["biology"],
      description: "Законы, задачи и процессы развития в интерактивном виде.",
      links: [
        { title: "Законы Менделя", href: "https://lab.neofamily.ru/mendel/" },
        { title: "Калькулятор Харди–Вайнберга", href: "https://lab.neofamily.ru/hardy-weinberg/" },
        { title: "Митоз и мейоз", href: "https://lab.neofamily.ru/cell-division/" },
        { title: "Задачи на биосинтез белка", href: "https://lab.neofamily.ru/protein-synthesis-tasks/", note: "линия 27" },
        { title: "Методология эксперимента", href: "https://lab.neofamily.ru/experiment-variables/" },
        { title: "Мышечное сокращение", href: "https://lab.neofamily.ru/muscle-contraction/" },
      ],
    },
    {
      title: "Химия",
      tags: ["chemistry"],
      description: "От строения атома до электролиза и качественных реакций.",
      links: [
        { title: "Общая химия", href: "https://lab.neofamily.ru/himiya/" },
        { title: "Строение атома", href: "https://lab.neofamily.ru/atom-structure/" },
        { title: "Уравнивание реакций", href: "https://lab.neofamily.ru/balancing/" },
        { title: "Степени окисления", href: "https://lab.neofamily.ru/oxidation-states/" },
        { title: "Электролиз растворов", href: "https://lab.neofamily.ru/electrolysis/" },
        { title: "Ионы меди(II): качественная реакция", href: "https://lab.neofamily.ru/cuso4-naoh/" },
      ],
    },
    {
      title: "Русский язык и приложения",
      description: "Орфография, пунктуация и мобильные приложения платформы.",
      tags: ["russian"],
      links: [
        { title: "Гласные в корне", href: "https://lab.neofamily.ru/root-vowels/" },
        { title: "Приставки пре- и при-", href: "https://lab.neofamily.ru/pre-pri/" },
        { title: "Н и НН", href: "https://lab.neofamily.ru/n-nn/" },
        { title: "Ударения", href: "https://lab.neofamily.ru/stress/" },
        { title: "Скачать приложение", href: "https://lab.neofamily.ru/download/", note: "Android, iOS, RuStore" },
      ],
    },
  ],
  adopt: [
    { feature: "Мини-симуляции на каждую тему вместо статичной теории", oursHref: "/labs", oursLabel: "Лабораторные" },
    { feature: "Калькулятор Харди–Вайнберга как отдельный инструмент", oursHref: "/calculators", oursLabel: "Калькуляторы" },
    { feature: "Тренажёры формата экзамена с разбором ошибок", oursHref: "/trainers", oursLabel: "Тренажёры" },
    { feature: "Аттестация по этапам: теория → тест → задача", oursHref: "/attestations", oursLabel: "Аттестации" },
  ],
};

export const SECHENOV: ExternalPlatform = {
  slug: "sechenov",
  title: "Школа Сеченова",
  href: "https://школасеченова.рф/",
  tagline: "Медицинская платформа с AI-тьютором и клиническими тренажёрами",
  description:
    "31 предмет с 1 по 6 курс: интерактивные методички, видеоразборы, тесты, клинические задачи, AI-тьютор по материалам урока и тренажёры ЭКГ/КТ/МРТ. Сильный ориентир по структуре учебного цикла.",
  note: "Доступ к урокам платный. MEDBIOHIM не обходит оплату, не копирует закрытые методички и использует только публичную навигацию.",
  accent: "emerald",
  stats: [
    { label: "Предметов", value: "31" },
    { label: "Курсы", value: "1–6" },
    { label: "Клин. тренажёр", value: "360+ ЭКГ" },
  ],
  categories: [
    {
      title: "Учебный цикл",
      description: "Как устроен урок: методичка, видео, тест, повторение.",
      links: [
        { title: "Каталог предметов", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/teach/catalog" },
        { title: "Демо-урок без регистрации", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/teach/demo" },
        { title: "Личный кабинет", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/teach/cabinet" },
        { title: "Тарифы", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/teach/subscription" },
      ],
    },
    {
      title: "Нейросеть и генераторы",
      description: "AI-инструменты платформы — полезны как ориентир для нашего тьютора.",
      links: [
        { title: "AI-тьютор", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/neyroset-dlya-medikov" },
        { title: "Конспект из лекций", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/neyroset-dlya-konspektov" },
        { title: "Запуск AI-сессии", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/teach/ai/start?task=create" },
        { title: "Презентация к семинару", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/neyroset-dlya-konspektov", note: "PPTX/PDF" },
      ],
    },
    {
      title: "Клинические инструменты",
      description: "Публичная часть: шкалы, рекомендации, тренажёр изображений.",
      tags: ["physiology", "first_aid"],
      links: [
        { title: "Клинические рекомендации", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/cr" },
        { title: "Медицинские шкалы", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/cr/scales" },
        { title: "Тренажёр ЭКГ", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/trainer/feed/ecg" },
        { title: "Блог", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/blog/" },
      ],
    },
    {
      title: "Право и экономика",
      description: "Смежные направления платформы.",
      links: [
        { title: "Право: кодексы и законы", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/pravo" },
        { title: "Экономика: НК, БК, законы", href: "https://xn--80aafla1ahtef3a7eg.xn--p1ai/ekonomika" },
      ],
    },
  ],
  adopt: [
    { feature: "AI-тьютор по материалам курса и голосовые ответы", oursHref: "/tutor", oursLabel: "AI-тьютор" },
    { feature: "Интервальное повторение и карточки", oursHref: "/cards", oursLabel: "Карточки" },
    { feature: "Тесты и клинические задачи по предмету", oursHref: "/tests", oursLabel: "Тесты" },
    { feature: "Шкалы и калькуляторы у постели", oursHref: "/calculators", oursLabel: "Калькуляторы" },
    { feature: "Клинические рекомендации как справочник", oursHref: "/materials", oursLabel: "Материалы" },
    { feature: "Аттестация по этапам с эталонными ответами", oursHref: "/attestations", oursLabel: "Аттестации" },
  ],
};

export const EXTERNAL_PLATFORMS = [NEOFAMILY, SECHENOV];

/** Канонический slug предмета сайта → теги категорий внешних платформ. */
export const SUBJECT_TAGS: Record<string, string[]> = {
  biology: ["biology"],
  histology: ["histology"],
  physiology: ["physiology"],
  inorganic_chemistry: ["chemistry"],
  organic_chemistry: ["chemistry"],
  chemistry_organic_physical: ["chemistry"],
  first_aid: ["first_aid"],
};

/**
 * Платформы и их категории, относящиеся к предмету.
 *
 * Нужна и странице предмета (вкладка «Платформы»), и старому хабу, поэтому
 * фильтрация живёт в данных, а не в компоненте: одна карта тегов на весь сайт.
 */
export function platformsForSubject(slug?: string | null): { platform: ExternalPlatform; categories: ExternalCategory[] }[] {
  const tags = SUBJECT_TAGS[String(slug || "")] || [];
  if (!tags.length) return [];
  return EXTERNAL_PLATFORMS.map((platform) => ({
    platform,
    categories: platform.categories.filter((category) => category.tags?.some((tag) => tags.includes(tag))),
  })).filter((entry) => entry.categories.length > 0);
}
