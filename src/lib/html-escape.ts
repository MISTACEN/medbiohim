/**
 * Экранирование HTML-текста — канон для фронтенда
 * ( LectureRenderer / chemistry/formula / lectures/exportLecture раньше
 * держали по копии ). Кавычки одинарные не экранируются: все три исходные
 * копии так работали, атрибуты через этот хелпер не проходят.
 *
 * Concat-форма сохраняет мнемоники целыми при транспортировке кода
 * (инструменты не превращают "&amp;" в "&" при обработке исходников).
 */
export function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}
