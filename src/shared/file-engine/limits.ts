import type { PreviewLimits } from "./types";

/**
 * Пределы File Engine.
 *
 * Числа подобраны так, чтобы обычная методичка или презентация открывалась
 * целиком, а вредоносный архив не мог занять память браузера. Все пределы
 * применяются до отрисовки: превышение показывает безопасную информацию о
 * файле и кнопку скачивания оригинала, а не частично отрисованный документ.
 */
export const DEFAULT_LIMITS: PreviewLimits = {
  /** Абсолютный предохранитель для любого встроенного просмотра. */
  maxBytes: 80 * 1024 * 1024,
  // Office-документы читаются в память целиком (JSZip), поэтому предел ниже.
  maxOfficeBytes: 40 * 1024 * 1024,
  maxTextBytes: 4 * 1024 * 1024,
  maxTextChars: 400_000,
  maxArchiveEntries: 2_000,
  maxArchiveUncompressed: 200 * 1024 * 1024,
  maxArchiveRatio: 200,
  maxArchiveDepth: 12,
  maxArchiveNameLength: 255,
  maxSheetRows: 1_000,
  maxSheetCols: 60,
  maxSheets: 12,
  maxSlides: 80,
  maxDocImages: 24,
  maxDocImageBytes: 3 * 1024 * 1024,
  maxCsvRows: 1_000,
  maxCsvCols: 60,
};
