/**
 * Публичный API адаптера FESMU — точка входа вместо монолита fesmu.ts.
 * Разнесено по образцу routes/teacher/ (ЗАДАЧА A3): _shared (http/текст),
 * cache, feed, documents, load, status, schedule.
 */
export {
  type FesmuAttempt,
  type FesmuAttemptInit,
  type FesmuMethod,
  type FesmuRequestInit,
  fesmuFetch,
  setFesmuTransportForTests,
  decodeEntities,
  cleanText,
  resolveUrl,
  extractDateText,
} from "./_shared";
export { clearFesmuCache, type CachedResult } from "./cache";
export { splitFeedBlocks, parseFeedItems, fetchFeed } from "./feed";
export {
  fileStem,
  titleFromFilename,
  parseCourseWord,
  deriveCourseFromTable,
  deriveProgram,
  deriveFormFromCell,
  deriveForm,
  classifyKind,
  parseScheduleDocuments,
} from "./documents";
export { type ScheduleLoad } from "./load";
export { probeServices, getServiceStatuses, getServiceReport } from "./status";
export { getSchedulePage, getFacultySchedule, getOverview } from "./schedule";
export { DISCLAIMER, FACULTIES, FEED_SOURCES, PORTAL, SCHEDULE_INDEX_URL, findFaculty, staticServices } from "../portals";
