/**
 * Внешние библиотечные источники.
 *
 * Публичного API у `elib.fesmu.ru` не подтверждено (сайт отдаёт ASP/JS в
 * windows-1251), поэтому здесь только честные внешние ссылки и ручной поиск,
 * без выдуманных эндпоинтов. Доступность указана по официальным страницам
 * ДВГМУ; подписные базы открываются только после авторизации вуза.
 */

export type ResourceAvailability = "free" | "subscription" | "mixed" | "unknown";

export type ExternalResource = {
  id: string;
  title: string;
  organization: string;
  description: string;
  url: string;
  availability: ResourceAvailability;
  accessNote: string;
  kind: "catalog" | "database" | "repository" | "textbook";
};

export const AVAILABILITY_LABELS: Record<ResourceAvailability, string> = {
  free: "Свободно",
  subscription: "По подписке",
  mixed: "Частично свободно",
  unknown: "Доступ не подтверждён",
};

export const EXTERNAL_RESOURCES: ExternalResource[] = [
  {
    id: "elib-fesmu",
    title: "Электронная библиотека ДВГМУ",
    organization: "ДВГМУ",
    description:
      "Каталог книг, статей, авторефератов и электронных документов с поиском по названию, авторам, рубрикам и ключевым словам.",
    url: "http://elib.fesmu.ru/",
    availability: "mixed",
    accessNote:
      "Часть документов открыта, часть требует авторизации. Публичного API не подтверждено, поэтому поиск открывается на стороне библиотеки.",
    kind: "catalog",
  },
  {
    id: "fesmu-library",
    title: "Библиотека университета",
    organization: "ДВГМУ",
    description: "Режим работы, абонементы, медиатека и справочно-библиографический фонд.",
    url: "http://www.fesmu.ru/resursy/biblioteka-universiteta/",
    availability: "free",
    accessNote: "Страница со сведениями о доступе открыта.",
    kind: "catalog",
  },
  {
    id: "fesmu-databases",
    title: "Полнотекстовые базы ДВГМУ",
    organization: "ДВГМУ",
    description:
      "Перечень ЭБС и баз: «Консультант студента», IPRsmart, НЭИКОН, Web of Science, ScienceDirect, Nature, PubMed.",
    url: "http://www.fesmu.ru/resursy/biblioteka-universiteta/polnotekstovye-bazy-dannykh/",
    availability: "mixed",
    accessNote:
      "PubMed открыт; остальные ресурсы требуют подписки вуза или регистрации с IP организации.",
    kind: "database",
  },
  {
    id: "pubmed",
    title: "PubMed",
    organization: "NCBI / NLM",
    description: "Биомедицинская библиографическая база: MEDLINE, PubMed Central.",
    url: "https://pubmed.ncbi.nlm.nih.gov/",
    availability: "free",
    accessNote: "Поиск свободный; условия использования конкретной статьи зависят от её лицензии.",
    kind: "database",
  },
  {
    id: "consultant-student",
    title: "ЭБС «Консультант студента»",
    organization: "ГЭОТАР-Медиа",
    description: "Учебники и медицинская периодика для студентов и сотрудников вуза.",
    url: "https://www.studentlibrary.ru/",
    availability: "subscription",
    accessNote: "Доступ по подписке вуза; вход через личный кабинет образовательного портала.",
    kind: "database",
  },
  {
    id: "iprsmart",
    title: "ЭБС IPRsmart",
    organization: "IPR MEDIA",
    description: "Учебные и научные издания российских издательств.",
    url: "https://www.iprbookshop.ru/",
    availability: "subscription",
    accessNote: "Логин и пароль выдаёт вуз; удалённый доступ по регистрации.",
    kind: "database",
  },
];

/** Поиск по названию, организации и описанию; пустой запрос возвращает всё. */
export function searchExternalResources(query: string): ExternalResource[] {
  const normalized = String(query ?? "").trim().toLowerCase().replace(/ё/g, "е");
  if (!normalized) return EXTERNAL_RESOURCES;
  return EXTERNAL_RESOURCES.filter((resource) =>
    [resource.title, resource.organization, resource.description, resource.accessNote]
      .join(" ")
      .toLowerCase()
      .replace(/ё/g, "е")
      .includes(normalized),
  );
}
