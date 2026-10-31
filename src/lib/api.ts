/**
 * Публичный вход клиента same-origin API (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 *
 * Реализация разложена по src/lib/api/*; этот файл остаётся на месте, чтобы
 * ВСЕ существующие импорты `@/lib/api` продолжали работать. Контракт поверхности
 * сохранён: типы (D1), примитивы `api`/`apiCached`/`invalidateApiCache`,
 * обработка 401/refresh, кэш и `describeApiError` — без изменений.
 */
// D3: guard'ы границы полезной нагрузки остаются частью контракта @/lib/api —
// функции listSubjects/getDashboard/listTests/listSchedule применяют их в
// src/lib/api/{subjects,tests,schedule,misc}.ts.
export { filterSafe, isAnnouncement, isScheduleRow, isSubjectCard, isTestItem } from "@/lib/guards";

// D1: доменные типы.
export * from "./api/types";

// Транспорт и кэш.
export * from "./api/client";
export * from "./api/cache";

// Домены.
export * from "./api/auth";
export * from "./api/subjects";
export * from "./api/tests";
export * from "./api/schedule";
export * from "./api/homeworks";
export * from "./api/content";
export * from "./api/community";
export * from "./api/workshop";
export * from "./api/staff";
export * from "./api/files";
export * from "./api/admin";
export * from "./api/misc";

// Заготовки доменов, клиентские функции которых живут в features-api.ts.
export * from "./api/ai";
export * from "./api/srs";
