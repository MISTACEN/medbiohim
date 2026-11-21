/**
 * Контент «Подготовка к самостоятельной» + «Режим экзамена» по лекции
 * `hist-03-embriologiya` (гистология, занятие 4 — основы общей эмбриологии).
 *
 * Данные перенесены в `src/data/embryology-self-work.json` (аудит 2026-11-22:
 * контент живёт в src/data; типизированная граница — здесь). Правила структуры:
 * `selfWorkTypes.ts`; keyPoints проверяются openAnswerCheck.ts — любой пункт
 * должен находиться в своей же model (образцовый ответ на «5»).
 */
import datasetJson from "@/data/embryology-self-work.json";
import type { SelfWorkTopic } from "./selfWorkTypes";

export const EMBRYOLOGY_SELF_WORK: SelfWorkTopic = datasetJson as unknown as SelfWorkTopic;
