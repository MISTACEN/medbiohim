/**
 * Static registry for the FESMU (ДВГМУ) integration: portal URLs, service
 * registry, the six schedule units and the feed/section labels.
 *
 * Every URL here was verified live on 2026-10-25 (see contract §0). Nothing in
 * this file performs I/O.
 */
import type { Faculty, FeedKind, PortalInfo, ScheduleKind, ServiceStatus } from "./types";

/** Public Moodle of the ОЗиЗ department (U6/U7); read-only catalog. */
export const OZIZ_URL = "https://ozizdvgmu.ru/";

export const PORTAL: PortalInfo = {
  name: "ФГБОУ ВО «Дальневосточный государственный медицинский университет» Минздрава России",
  url: "https://www.fesmu.ru/",
  eios_url: "https://eios.fesmu.ru/WebApp/#/",
  testing_url: "http://test.fesmu.ru:8080/",
  library_url: "https://elib.fesmu.ru/",
  schedule_url: "https://www.fesmu.ru/ucheba/raspisanie/",
  news_url: "https://www.fesmu.ru/press-center/news/",
  announcements_url: "https://www.fesmu.ru/press-center/announce/",
  events_url: "https://www.fesmu.ru/press-center/events/",
};

export const DISCLAIMER =
  "Мы не храним контент и не подменяем официальные источники: каждый материал остаётся ссылкой на публичную страницу ФЕСМУ. MEDBIOHIM не выполняет вход в ЕИОС, не хранит пароли и не обходит авторизацию.";

export const SCHEDULE_INDEX_URL = PORTAL.schedule_url;

export const SCHEDULE_NOTE =
  "Официальные PDF-файлы факультетов и графики учебного процесса. MEDBIOHIM не изменяет документы вуза и не подставляет расписание из других источников.";

/** Press-center list pages (verified paths, contract §0.1 bug 2). */
export const FEED_SOURCES: Record<FeedKind, string> = {
  news: PORTAL.news_url,
  announcements: PORTAL.announcements_url,
  events: PORTAL.events_url,
};

export const FEED_LABELS: Record<FeedKind, string> = {
  news: "Новости",
  announcements: "Объявления",
  events: "Анонсы",
};

/** Category slugs used by the press center, mapped to Russian labels (§1.3). */
export const SECTION_LABELS: Record<string, string> = {
  "for-applicants": "Для абитуриентов",
  "for-students": "Для студентов",
  "for-teacher": "Для преподавателей",
  "meropriyatiya": "Мероприятия",
};

/** Sort/priority order for document kinds (contract §1.4). */
export const KIND_ORDER: ScheduleKind[] = [
  "lectures",
  "classes",
  "exams",
  "practice-exams",
  "credits",
  "debt",
  "gia",
  "diploma",
  "process-graph",
  "other",
];

/** Fallback Russian label when a title carries no usable wording. */
export const KIND_LABELS: Record<ScheduleKind, string> = {
  lectures: "Лекции",
  classes: "Занятия",
  exams: "Экзамены",
  "practice-exams": "Экзамены по практике",
  credits: "Зачеты",
  debt: "Ликвидация академической задолженности",
  gia: "ГИА",
  diploma: "График вручения дипломов",
  "process-graph": "График учебного процесса",
  other: "Документ",
};

/** Boilerplate anchors that are never study documents (contract §1.4). */
export const BOILERPLATE_TITLES = [
  /образовательн[а-яё]*\s+кредит/i,
  /правила\s+внутреннего\s+распорядка/i,
  /информирование\s+вузов/i,
];

/**
 * Service registry (contract §0/§1.5). `reachable`/`http_status`/`latency_ms`/
 * `checked_at` stay null here: the overview never probes, `/api/university/status`
 * does. Returns fresh objects so a probe can never mutate the registry.
 */
const SERVICE_REGISTRY: Omit<ServiceStatus, "reachable" | "http_status" | "latency_ms" | "checked_at">[] = [
  {
    id: "portal",
    title: "Официальный сайт ДВГМУ",
    url: PORTAL.url,
    category: "portal",
    description: "Новости, документы, структура вуза и приёмная кампания.",
    badge: "Официальный сайт",
    note: "Основной публичный источник. Сертификат сайта неполный, поэтому проверка TLS для домена fesmu.ru ослаблена (см. FESMU_STRICT_TLS).",
  },
  {
    id: "eios",
    title: "ЕИОС",
    url: PORTAL.eios_url,
    category: "lms",
    description: "Электронная информационно-образовательная среда: расписание, материалы, оценки.",
    badge: "Личный кабинет",
    note: "Вход выполняется только на стороне вуза. MEDBIOHIM не отправляет логины, пароли и cookie.",
  },
  {
    id: "oziz",
    title: "ОЗиЗ — Moodle",
    url: OZIZ_URL,
    category: "lms",
    description: "Публичный каталог курсов кафедры общественного здоровья и здравоохранения: информационные технологии в здравоохранении, история медицины, физиология.",
    badge: "Moodle ОЗиЗ",
    note: "Читается только публичная страница каталога. Содержимое курса открывается после входа на стороне Moodle; MEDBIOHIM не входит в аккаунт и не хранит sesskey/токены.",
  },
  {
    id: "schedule",
    title: "Расписание",
    url: PORTAL.schedule_url,
    category: "schedule",
    description: "PDF-файлы факультетов: занятия, лекции, экзамены и ликвидация задолженности.",
    badge: "Официальные PDF",
    note: "Страницы факультетов читаются как публичные HTML-страницы, файлы не скачиваются.",
  },
  {
    id: "library",
    title: "Электронная библиотека",
    url: PORTAL.library_url,
    category: "library",
    description: "Учебники, методички и полнотекстовые ресурсы библиотеки ДВГМУ.",
    badge: "Библиотека",
    note: "Сервер библиотеки может не отвечать из внешней сети; статус проверяется отдельным запросом.",
  },
  {
    id: "testing",
    title: "Тестирование ДВГМУ",
    url: PORTAL.testing_url,
    category: "testing",
    description: "Оригинальная система тестирования. Вход — по ссылке из ЕИОС, а не по паролю в MEDBIOHIM.",
    badge: "Оригинальные тесты",
    note: "Открывается по HTTP на порту 8080; авторизация и сбор вопросов выполняются только в браузере пользователя.",
  },
  {
    id: "news",
    title: "Новости и объявления",
    url: PORTAL.news_url,
    category: "news",
    description: "Публичные новости, объявления и анонсы мероприятий университета.",
    badge: "Публичный архив",
    note: "Заголовки и даты берутся из карточек пресс-центра; полный текст открывается на сайте ФЕСМУ.",
  },
];

export function staticServices(): ServiceStatus[] {
  return SERVICE_REGISTRY.map((service) => ({
    ...service,
    reachable: null,
    http_status: null,
    latency_ms: null,
    checked_at: null,
  }));
}

/**
 * The six schedule units from contract §1.4.
 * `slug` is the last path segment of the verified URL, `short` is the compact
 * display form, `code` is the Russian abbreviation from the contract table
 * (null where the table shows «—»).
 */
export const FACULTIES: Faculty[] = [
  {
    id: "lechebnyy",
    slug: "lechebnyy-fakultet-31-05-01-lechebnoe-delo",
    title: "Лечебный факультет",
    short: "Лечебный",
    program: "Лечебное дело 31.05.01",
    programs: ["Лечебное дело 31.05.01"],
    code: "лф",
    url: "https://www.fesmu.ru/ucheba/raspisanie/lechebnyy-fakultet-31-05-01-lechebnoe-delo/",
  },
  {
    id: "pediatricheskiy",
    slug: "pediatricheskiy-fakultet-31-05-02-pediatriya",
    title: "Педиатрический факультет",
    short: "Педиатрический",
    program: "Педиатрия 31.05.02",
    programs: ["Педиатрия 31.05.02"],
    code: "пф",
    url: "https://www.fesmu.ru/ucheba/raspisanie/pediatricheskiy-fakultet-31-05-02-pediatriya/",
  },
  {
    id: "stomatologicheskiy",
    slug: "stomatologicheskiy-fakultet-31-05-03-stomatologiya",
    title: "Стоматологический факультет",
    short: "Стоматологический",
    program: "Стоматология 31.05.03",
    programs: ["Стоматология 31.05.03"],
    code: "сф",
    url: "https://www.fesmu.ru/ucheba/raspisanie/stomatologicheskiy-fakultet-31-05-03-stomatologiya/",
  },
  {
    id: "farmatsii",
    slug: "fakultet-farmatsii-i-biomeditsiny-33-05-01-farmatsiya",
    title: "Факультет фармации и биомедицины",
    short: "Фармации и биомедицины",
    program: "Фармация 33.05.01",
    // На одной странице две специальности: файлы разводятся по заголовкам (U1).
    programs: ["Фармация 33.05.01", "Медицинская биохимия 30.05.01"],
    code: "фф",
    url: "https://www.fesmu.ru/ucheba/raspisanie/fakultet-farmatsii-i-biomeditsiny-33-05-01-farmatsiya/",
  },
  {
    id: "mediko-gumanitarnyy",
    slug: "mediko-gumanitarnyy-fakultet",
    title: "Медико-гуманитарный факультет",
    short: "Медико-гуманитарный",
    program: null,
    programs: ["Социальная работа 39.03.02", "Клиническая психология 37.05.01", "Сестринское дело 34.03.01"],
    code: "мгф",
    url: "https://www.fesmu.ru/ucheba/raspisanie/mediko-gumanitarnyy-fakultet/",
  },
  {
    id: "kolledzh",
    slug: "mediko-farmatsevticheskiy-kolledzh",
    title: "Медико-фармацевтический колледж",
    short: "Колледж",
    program: "СПО",
    programs: ["СПО"],
    code: null,
    url: "https://www.fesmu.ru/ucheba/raspisanie/mediko-farmatsevticheskiy-kolledzh/",
  },
];

export function findFaculty(id: string | null | undefined): Faculty | null {
  if (!id) return null;
  const needle = id.trim().toLowerCase();
  if (!needle) return null;
  return (
    FACULTIES.find((faculty) => faculty.id === needle) ??
    FACULTIES.find((faculty) => faculty.slug === needle) ??
    null
  );
}
