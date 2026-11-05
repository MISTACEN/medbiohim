/**
 * File Engine — единая точка входа подсистемы просмотра файлов.
 *
 * Модули используют `FilePreview` (React) для интерфейса и чистые функции
 * отсюда — для проверок. Реализации просмотра зарегистрированы в
 * `formats.ts`; произвольный рендерер из данных не вызывается.
 */
export * from "./types";
export * from "./limits";
export * from "./formats";
export * from "./detection";
export * from "./security";
export * from "./text";
export * from "./xml";
export * from "./office/docx";
export * from "./office/pptx";
export * from "./office/workbook";
export * from "./office/archive";
export * from "./office/sheetGrid";
